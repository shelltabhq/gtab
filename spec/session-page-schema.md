# GTab Page Schema — v1

**Status:** Stable. Binding for GTab v0.1.0 (May 2026).
**Schema version:** `1`

Every page GTab publishes to a [GBrain](https://github.com/garrytan/gbrain) corpus is a Markdown file with **YAML frontmatter**. Frontmatter is the contract; the body is recommended structure but tolerant of extension.

This document defines:
1. The frontmatter field set (required + optional, with types).
2. The body section layout (recommended).
3. The versioning policy (how `schema_version` evolves).

---

## 1. Frontmatter contract

```yaml
---
schema_version: 1
slug: <see slug-convention.md>
title: <string>
source: agent_session | activity_cluster
agent_type: claude | codex | null
actor_id: <stable user identifier — host-defined>
host_id: <optional — identifies the publishing host (e.g., shelltab, custom)>
workspace_id: <optional — host-defined scoping identifier (e.g., drive_id, project_id)>
started_at: <ISO 8601 UTC>
last_active_at: <ISO 8601 UTC>
ended_at: <ISO 8601 UTC | null>
duration_ms: <integer ≥ 0>
status: active | completed | failed | aborted
command_count: <integer ≥ 0>
files_changed: [<relative path>, ...]
exit_status: success | error | null
tags: [<string>, ...]
sync:
  last_synced_at: <ISO 8601 UTC>
  last_put_offset: <integer ≥ 0>
  put_count: <integer ≥ 1>
  source_etag: <string — opaque hash of source state at publish time>
---
```

### 1.1 Required fields

| Field | Type | Notes |
|---|---|---|
| `schema_version` | integer | Must be `1` for this version. |
| `slug` | string | Stable. See [slug-convention.md](./slug-convention.md). |
| `title` | string | Display title. Auto-generated acceptable. |
| `source` | enum | One of `agent_session`, `activity_cluster`. |
| `actor_id` | string | The user who initiated this work. Stable, host-defined (UUID, email, slug — host's choice). |
| `started_at` | ISO 8601 | UTC. Determines the date segment of the slug. |
| `last_active_at` | ISO 8601 | UTC. Updated on every publish. |
| `duration_ms` | integer | `last_active_at - started_at` in milliseconds. |
| `status` | enum | `active`, `completed`, `failed`, `aborted`. |
| `command_count` | integer | Total commands observed. May increase across publishes while `status: active`. |
| `sync.last_synced_at` | ISO 8601 | UTC. Timestamp of this publish. |
| `sync.put_count` | integer | How many times this page has been published (≥1). |

### 1.2 Optional fields

| Field | Type | Notes |
|---|---|---|
| `agent_type` | enum or null | One of `claude`, `codex`, or `null`. Required to be non-null when `source: agent_session`. |
| `host_id` | string | Host adopting the spec (e.g., `shelltab`, `sesh-cli`). Useful for cross-host corpora. |
| `workspace_id` | string | Host-defined logical workspace (e.g., a drive id, a project). |
| `ended_at` | ISO 8601 or null | `null` while `status: active`. Set to `last_active_at` on completion. |
| `files_changed` | array of strings | Relative paths touched during the session. May grow across publishes. |
| `exit_status` | enum or null | `success`, `error`, or `null`. Only meaningful when `status: completed`. |
| `tags` | array of strings | Host-supplied; GBrain skills may add more during the dream cycle. |
| `sync.last_put_offset` | integer | Source-specific cursor (e.g., JSONL byte offset, event count). Allows incremental publishing logic. |
| `sync.source_etag` | string | Opaque hash of source state. If unchanged since last publish, the host MAY skip republishing. |

### 1.3 Field semantics

- **`actor_id` is opaque to GTab.** The publishing host decides the format (UUID, email, slug). Hosts SHOULD use a stable identifier that doesn't change if a user renames themselves. Consumers (Brain View, GBrain queries) treat it as a string; resolving to display name/avatar is the host's responsibility.

- **`status: active` is sticky.** A page MAY be republished many times while active. The slug never changes; only `last_active_at`, `command_count`, `files_changed`, body content, and `sync.*` fields update.

- **`status: completed/failed/aborted` is final** for a given slug. Once set, the next publish should set `ended_at` and SHOULD NOT revert to `active`.

- **`tags` are additive.** Hosts SHOULD NOT clear tags during a republish; new tags are appended. GBrain skills may also add tags during the dream cycle — those are out of the host's control.

### 1.4 Forward compatibility

Implementations MAY include additional frontmatter fields not listed here. Readers (e.g., Brain View) MUST ignore unknown fields. Writers MUST NOT use the `gtab.*` or `sync.*` namespaces for non-spec fields (reserved).

---

## 2. Body structure (recommended)

The Markdown body is GBrain's input for chunking, embedding, search, and dream-cycle enrichment. **A thin body (just a title + one-line summary) makes the corpus useless for Ask AI** — semantic search has nothing meaningful to match against, so abstract questions return "No results" 100% of the time. Include real captured content.

The structure below is recommended but not enforced:

```markdown
# {{title}}

## Summary
<one-paragraph synthesis; empty on first publish; populated by host LLM or GBrain dream cycle>

## Prompts                              ← agent_session only; the most-load-bearing section
> {{user prompt 1 — truncated to ~1000 chars}}

> {{user prompt 2}}

...

## Agent messages                       ← agent_session only; last 5-8 reply snippets
{{snippet}}

## Commands                             ← activity_cluster (or session with shell calls)
```bash
{{command 1}}
{{command 2}}
```

## Files
- {{relative path}} (+{{added}}/-{{removed}})
- ...

## Decisions
<extracted by host or GBrain skills; structured as "decision — rationale" pairs>

## Errors
<commands with non-zero exit, grouped by error fingerprint>

## Transcript
<for source: agent_session — condensed turn-by-turn dialogue with [actor] tags>
```

The **Prompts** + **Commands** sections are the highest-leverage content for Ask AI usefulness. Each prompt should be a real human-written question (or paraphrase) — that's the surface gbrain's hybrid search keys off of when answering "what was I working on?" / "did I try X?" questions. Without those, the corpus reads like a table of contents with no chapters.

### 2.1 Section ordering

The order above is recommended for readability. GBrain chunking does not rely on section order — but human readers and the Brain View tile parse sections left-to-right by header. Out-of-order sections still work; sticking to the order keeps the experience consistent across implementations.

### 2.2 Empty sections

Sections that are not yet populated SHOULD be **omitted** rather than rendered as empty headers. Empty `## Summary` headers are an exception: include them on first publish as a hint to the dream cycle.

### 2.3 Body size

GBrain handles large pages (multi-megabyte transcripts) by chunking. There is no hard cap. However:
- Implementations SHOULD truncate transcript sections beyond ~1 MB.
- Each publish replaces the entire page; large pages mean large embedding costs. Use the debounce window (recommended ≥30s during active sessions) to limit churn.

---

## 3. Versioning policy

### 3.1 What constitutes a version bump

| Change type | New version? |
|---|---|
| New optional field | No (additive, forward-compatible) |
| New required field | Yes |
| Field type change (e.g., string → integer) | Yes |
| Field rename | Yes |
| Field removal | Yes |
| New section in body | No (body is loose) |
| New `status` enum value | Yes (consumers may not handle it) |
| New `source` enum value | Yes |

### 3.2 Migration policy

When `schema_version` bumps:

1. A migration doc lands under `spec/migrations/v<old>-to-v<new>.md` describing field-by-field changes.
2. Hosts SHOULD provide a migration runner that re-publishes existing pages at the new schema.
3. Readers SHOULD continue accepting older schema versions for at least one major release.

### 3.3 Writer compliance

- A writer at schema vN MUST set `schema_version: N` in every page it publishes.
- A writer MUST NOT overwrite a page whose `schema_version > N` (the page is from a future writer; don't downgrade).
- Migration runners are an exception — they explicitly upgrade in place.

---

## 4. Example page

A realistic example page is at [`examples/sample-corpus/shell/session/2026-05-16/sample-auth-refactor.md`](../examples/sample-corpus/shell/session/2026-05-16/sample-auth-refactor.md).

---

## 5. Validation

A reference validator lives at [`sync/src/validate.ts`](../sync/src/validate.ts). It accepts:

```bash
gtab-validate <path/to/page.md>
```

Exit code 0 on valid, non-zero on schema violation. Hosts are encouraged to run it in CI.

---

## 6. Non-goals

- **Conflict resolution.** A slug is unique by construction; the spec does not define merge semantics for accidental duplicates.
- **Multi-actor pages.** v1 carries one `actor_id`. Multi-actor collaboration on a single page is a v2 candidate.
- **Page deletion.** Out of scope. Hosts decide when to call GBrain's `delete_page`.

---

## See also

- [`slug-convention.md`](./slug-convention.md) — how to construct stable slugs.
- [`sync-protocol.md`](./sync-protocol.md) — when and how to publish.
- [GBrain `put_page` MCP tool](https://github.com/garrytan/gbrain/blob/master/src/core/operations.ts) — the underlying publish primitive.
