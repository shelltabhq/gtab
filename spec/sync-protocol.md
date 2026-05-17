# GTab Sync Protocol — v1

**Status:** Stable. Binding for GTab v0.1.0.

This document defines the **publishing contract** that any GTab-compliant sync daemon implements. A sync daemon is the long-running bridge between a terminal-capture system (the host) and a [GBrain](https://github.com/garrytan/gbrain) corpus — it observes new capture, debounces, translates to the [page schema](./session-page-schema.md), and publishes to the corpus continuously.

> Naming note: the term "sync daemon" describes the entity. "Sync" alone describes the protocol/concept. This is distinct from GStack's `/sync-gbrain` slash command (which re-indexes a repo into GBrain on demand); the GTab sync daemon runs continuously and operates on terminal capture rather than code.

---

## 1. Overview

A sync daemon:

1. **Observes** sources of terminal capture (agent sessions, activity clusters).
2. **Translates** captured state into Markdown pages conforming to the [page schema](./session-page-schema.md).
3. **Publishes** pages to a GBrain corpus via the `put_page` MCP tool.
4. **Debounces** publishes during active sessions.
5. **Persists** sync state so it can resume across restarts.

Hosts may implement these responsibilities in one process, multiple processes, or as part of a larger daemon. The protocol does not constrain runtime topology.

---

## 2. Publishing primitive

The only required interaction with GBrain is the **`put_page` MCP tool**. The CLI verb that invokes it is **`gbrain put <slug>`** (markdown content from stdin):

```bash
echo "$markdown_with_frontmatter" | gbrain put <slug>
# or
gbrain put <slug> < page.md
```

- `<slug>` is the only positional argument — full slug string, per [`slug-convention.md`](./slug-convention.md).
- Content comes from stdin only. There is no `--content` flag.

`put_page` is **idempotent and overwriting**:
- A page at the given slug is fully replaced.
- GBrain stores + chunks the page. Embedding is a SEPARATE step (see §2.2).
- For remote MCP callers (`gbrain serve --http`), auto-link and timeline extraction post-hooks are skipped. The dream cycle picks them up later. Local CLI callers get auto-link inline.

### 2.2 Embedding — IMPORTANT

`gbrain put` does NOT embed the page. Without embeddings, only keyword/FTS search works; semantic search (`gbrain query` with `--expand`) returns "No results" for any abstract question. A sync daemon MUST also run `gbrain embed --all` periodically to keep the corpus searchable.

Embedding requires an OpenAI API key in the spawn env (`OPENAI_API_KEY`) — gbrain defaults to `openai:text-embedding-3-large` and there is no Anthropic embedding API today. Embedding cost is ~$0.02 per million tokens; a typical 1000-page corpus costs cents.

Recommended pattern:
1. After each sync tick that wrote ≥1 page, kick off `gbrain embed --all` in the background (mutex-serialized with put — PGLite is single-writer).
2. Cache the OpenAI key in process memory between sync ticks so the user only enters it once per drive.
3. Surface embed coverage via `gbrain stats` parsing (`Pages: N` + `Embedded: N`) so the UI can lock Ask AI until coverage ≥ ~80%.

The reference daemon ([`sync/`](../sync/)) implements this as `runEmbedInBackground()` after the tick's put loop.

### 2.3 Page body content — IMPORTANT

The page body is what gbrain chunks and embeds. A 3-line summary ("session with N commands. Status: completed.") gives gbrain almost nothing to match against — Ask AI will return "No results" for everything because the corpus contains no semantically searchable text.

A useful page body includes the actual captured content:
- For agent sessions: the last 5-10 user prompts (truncated to ~1000 chars each) + the most recent agent message snippets
- For terminal activity clusters: the last 10-30 bash commands as a fenced ` ```bash ` block

The host translates raw capture into these body sections; the sync daemon merely renders them into Markdown. See [`session-page-schema.md`](./session-page-schema.md) §5 for the body content guidance.

### 2.1 Transports

A sync daemon MAY publish via:

- **CLI shell-out** (recommended for local installs) — `Bun.spawn(['gbrain', 'put', slug], { stdin: markdownPipe })`. Simplest, gets auto-link inline because `ctx.remote=false`.
- **MCP stdio** — direct MCP client over `gbrain serve` stdio transport. Same caller semantics as HTTP (remote=true).
- **MCP HTTP** — direct MCP client over `gbrain serve --http` HTTP transport (default port `3131`, loopback-only by default). Required if GBrain runs on a different host than the sync daemon. Caller is considered remote — auto-link is deferred to the dream cycle.

The reference sync daemon ([`sync/`](../sync/)) uses CLI shell-out for simplicity. Production hosts may prefer HTTP transport for better error handling and structured failure responses.

---

## 3. Lifecycle

```
[host capture event]
       │
       ▼
[sync daemon observes change]
       │
       ▼
[apply debounce policy]   ◄── §4
       │
       ▼
[build Markdown page]     ◄── §5
       │
       ▼
[publish via put_page]    ◄── §2
       │
       ▼
[update sync state]       ◄── §6
```

---

## 4. Debounce policy

Sync daemons MUST implement debouncing to avoid hammering GBrain during active sessions. The recommended policy:

| Source state | Behavior |
|---|---|
| `status: active` AND last publish was `< debounce_ms` ago | Skip; check again on next tick |
| `status: active` AND last publish was `≥ debounce_ms` ago | Publish |
| `status: completed/failed/aborted` (final publish) | Publish immediately, bypass debounce |
| Manual trigger from host (e.g., "Sync now" button) | Publish immediately, bypass debounce |
| Backfill of historic source | Publish at host-defined rate (recommended 1/sec) |

**Recommended `debounce_ms`:** 30,000 (30 seconds). Hosts MAY tune this; values < 5,000 are discouraged.

### 4.1 Why debounce

GBrain re-embeds the full page on every `put_page`. For a session that emits 100 events per minute, debouncing keeps embedding cost bounded and avoids `put_page` queueing under the publish.

### 4.2 Source ETag (optional optimization)

Sync daemons MAY compute a `source_etag` (stable hash of source state) and skip publishing if the etag is unchanged since the last publish. This catches "session was idle but ticker fired anyway" cases. The etag is opaque; SHA-256 of the rendered Markdown body is one viable choice.

---

## 5. Page builder

The sync daemon is responsible for translating host-specific capture format into the GTab page schema.

### 5.1 Inputs

For an **agent session**:
- Session metadata (id, actor, start time, current state)
- Transcript bytes (e.g., NDJSON from Claude Code)
- File-change diff (if available)

For an **activity cluster**:
- Cluster metadata (open time, close time, scope)
- Ordered event list (commands, deploys, git ops, errors)

### 5.2 Outputs

A single Markdown string containing:
- YAML frontmatter conforming to [`session-page-schema.md`](./session-page-schema.md)
- Body sections per the recommended structure

### 5.3 Reference implementation

See [`sync/src/translate.ts`](../sync/src/translate.ts) for a Bun reference. Key functions:

- `sessionToMarkdown(meta, transcriptBytes)` — agent session translation
- `clusterToMarkdown(meta, events)` — activity cluster translation
- `buildFrontmatter(meta)` — YAML emission
- `validateFrontmatter(fm)` — schema check before publish

---

## 6. State persistence

Sync daemons MUST persist sync state so they can resume safely across restarts. The reference state format is **NDJSON**, one line per slug:

```json
{"slug":"shell/session/2026-05-16/01HX...","last_synced_at":"2026-05-16T14:32:05Z","last_put_offset":12847,"put_count":3,"retry_count":0,"last_error":null,"source_etag":"sha256:abc..."}
```

### 6.1 Required fields per state row

| Field | Type | Notes |
|---|---|---|
| `slug` | string | Unique key. |
| `last_synced_at` | ISO 8601 | Timestamp of last successful publish. |
| `put_count` | integer | Total successful publishes for this slug. |
| `retry_count` | integer | Consecutive failures since last success. Reset to 0 on success. |
| `last_error` | string \| null | Last error message; null on success. |

### 6.2 Optional fields

| Field | Type | Notes |
|---|---|---|
| `last_put_offset` | integer | Source cursor (e.g., JSONL byte offset). Allows incremental builders. |
| `source_etag` | string | For ETag-based skip. |

### 6.3 Atomicity

State writes MUST be atomic:
1. Write to `state.ndjson.tmp`
2. fsync
3. Rename to `state.ndjson`

Corrupted last lines on read SHOULD be tolerated (skip them) — partial writes happen.

### 6.4 State versioning

The first line of `state.ndjson` MAY be a header marker:

```json
{"_meta":true,"state_version":1,"daemon_version":"0.1.0"}
```

A reader encountering a newer `state_version` than it supports MUST refuse to start with a clear error.

---

## 7. Retry policy

When `put_page` fails:

1. Increment `retry_count` for the slug.
2. Schedule retry with **exponential backoff**: 1s, 2s, 4s, 8s, 16s (then capped).
3. After **5 consecutive failures**, mark the slug as **quarantined**. Don't auto-retry. Surface via observability.
4. A successful publish at any point resets `retry_count` to 0.

Quarantined slugs MAY be retried via host-initiated manual refresh.

---

## 8. Observability

Sync daemons SHOULD expose:

- **Structured logs** — NDJSON to a known location (recommended `<sync_root>/sync.log`). Fields: `ts`, `level`, `event`, `slug`, `duration_ms`, `error`.
- **Health endpoint** — HTTP `/health` on localhost (port host-defined). Returns JSON with `in_flight`, `queue_size`, `quarantine_size`, `last_sync_at`, `sync_lag_seconds`, `gbrain_reachable`.

The reference sync daemon exposes `/health` on `localhost:7777` (override via `GTAB_HEALTH_PORT` env).

---

## 9. Failure modes

| Failure | Required response |
|---|---|
| GBrain binary missing | Refuse to start; clear error log |
| GBrain serve unreachable | Backoff retry; surface in `/health` (`gbrain_reachable: false`) |
| `put_page` non-zero exit | Treat as retryable failure; apply backoff |
| `put_page` timeout (default 30s) | Kill child process; treat as failure |
| Source state corrupted (e.g., bad JSONL) | Log, quarantine the slug, continue |
| Disk full | Refuse to write state; surface in `/health`; do not lose in-memory queue |
| Network partition (HTTP transport) | Backoff; reconcile from durable state on recovery |

---

## 10. Backfill

When a sync daemon starts against a corpus with no prior state, it MAY perform a **backfill** of historic sources. Recommended behavior:

1. Enumerate all historic sources from the host.
2. Enqueue at a slow rate (default 1/sec, configurable).
3. Surface progress via `/health` (`backfill_remaining`).
4. Switch to steady-state mode once the queue is drained.

Backfill SHOULD bypass debounce (sources are already complete or stale).

---

## 11. Conformance

A GTab-compliant sync daemon:

- ✅ Implements §2 (publishing via `put_page`).
- ✅ Conforms to [`session-page-schema.md`](./session-page-schema.md) and [`slug-convention.md`](./slug-convention.md).
- ✅ Implements debouncing per §4.
- ✅ Persists state per §6.
- ✅ Retries failures per §7.
- ⚠️ Exposes observability per §8 (recommended, not required for v0.1.0).
- ⚠️ Implements backfill per §10 (recommended, not required).

---

## See also

- [`session-page-schema.md`](./session-page-schema.md) — the page contract.
- [`slug-convention.md`](./slug-convention.md) — stable identifiers.
- [`../sync/`](../sync/) — reference Bun sync daemon implementation.
