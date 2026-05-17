# GTab

> Turn every terminal session and command into queryable, attributed, compounding knowledge — hosted on your machine, owned by you.

Every command you run, every session your agent completes, every commit, every deploy — your terminal already knows. But the moment the session ends, that knowledge evaporates. Tomorrow you re-explain. Next week you re-investigate. Next month you re-decide. Capture without compounding is just an archive.

GTab fixes the leak. It's a **protocol** plus a **reference implementation** for streaming terminal capture into [GBrain](https://github.com/garrytan/gbrain) — Garry Tan's open-source compounding memory system: a Markdown knowledge graph that auto-chunks, auto-embeds, auto-links, and runs a nightly dream cycle to enrich itself. 53+ skills, MCP-native, local-first, owned by the user. A **stable page schema** + **slug convention** translates captured terminal work into GBrain's Markdown format. A small **sync daemon** observes capture, debounces ~30s during active sessions, and publishes pages via `gbrain put`. The **Brain View** tile shows it back: chronological feed, attribution, Ask AI, graph. Hit GTab at any moment — mid-session or weeks later — and your work is there.

[ShellTab](https://shelltab.dev) is the first full implementation, and this repo is what we extracted out so any terminal product can adopt the same pattern. ShellTab is a multiplayer cloud terminal where engineers and AI agents collaborate inside shared **drives** — persistent VM workspaces where every keystroke runs through a single observable surface. Multiple humans drive the same terminal; Claude Code and Codex CLI spawn as first-class participants; files, previews, and review pipelines live on the drive's NVMe. ShellTab already had the highest-fidelity capture record of any terminal product — full JSONL agent transcripts, every shell command with exit code and OSC 633 attribution, every git commit and deploy clustered by user and time span. What it didn't have was compounding. GTab is the bridge: every captured session and cluster flows into a per-drive GBrain corpus continuously, GBrain compounds, the GTab tile in the workspace surfaces the result. Solo by default. Multiplayer when the host (e.g., ShellTab) provides drive members. The brain stays on the user's machine.

Built for the [GStack × GBrain Hackathon](https://events.ycombinator.com/GStack) (Y Combinator, May 16, 2026).

> Garry Tan, May 9 2026: *"the future belongs to individuals who build compounding AI systems, not to individuals who use corporate-owned centralized AI tools."*

---

## Quickstart

```bash
git clone https://github.com/ShellTabHQ/gtab
cd gtab/docker
docker compose up
```

Open <http://localhost:8080>. You'll see the **Brain View** tile rendering against a pre-baked sample corpus. The demo reads pages from the corpus filesystem and shells out to the local `gbrain` CLI for Ask AI. No accounts, no signups, no API keys.

Want the HTTP MCP endpoint exposed too (port 3131)? Set `ENABLE_GBRAIN_SERVE=1` — note that this serializes CLI access on PGLite's lock, so for the standalone demo we keep it off by default.

Want to put a real page in?

```bash
docker exec -i gtab-gbrain gbrain put shell/session/2026-05-16/my-first-session \
  < ./examples/sample-corpus/shell/session/2026-05-16/01hxsess_auth_refactor_aa.md
```

(GBrain's CLI verb is `put`; markdown content comes from stdin. The underlying MCP tool is `put_page`.)

It will appear in the Brain View within seconds.

---

## What's in this repo

| Directory | Purpose |
|---|---|
| [`spec/`](./spec/) | **The contribution.** Page schema, slug conventions, sync protocol. Stable and versioned. |
| [`sync/`](./sync/) | Reference Bun sync daemon: terminal capture → Markdown → `gbrain put`. Fork it for your host. |
| [`brain-view/`](./brain-view/) | Portable Svelte component. Reads any GBrain HTTP server. Embeddable. |
| [`docker/`](./docker/) | `Dockerfile` + `docker-compose.yml` for the full standalone demo. |
| [`examples/`](./examples/) | Sample corpus + sample sync inputs. |

---

## Adopting GTab in your host

Any system that captures terminal sessions can publish to GBrain via the GTab spec:

1. Read [`spec/session-page-schema.md`](./spec/session-page-schema.md) for the frontmatter contract.
2. Read [`spec/slug-convention.md`](./spec/slug-convention.md) for stable identifiers.
3. Read [`spec/sync-protocol.md`](./spec/sync-protocol.md) for the sync-daemon contract (debounce, state, retries).
4. Translate your capture format → Markdown.
5. Publish via `echo "$markdown" | gbrain put <slug>` (CLI) or call the `put_page` MCP tool directly over `gbrain serve --http` (HTTP transport, default port 3131).
6. (Optional) Embed [`brain-view/`](./brain-view/) for the UI.

[`sync/`](./sync/) is a working reference sync daemon in ~200 lines of Bun. Fork it.

---

## Compatibility

- **GBrain**: v0.31.1+ (thin-client mode + HTTP transport required).
- **Node**: 20+ (for `brain-view/`). **Bun**: 1.0+ (for `sync/`).
- **MCP**: spec-compliant; uses the `put_page`, `list_pages`, `get_page`, `search`, `query`, `get_backlinks` tools.

---

## Status

- **v0.1.0** — hackathon release, May 16 2026. Schema v1. Reference sync daemon + portable Brain View.
- Phase 2 (post-hackathon, ~2 weeks): activity-cluster ingestion, streaming Ask AI, backlinks, dream-cycle button.
- Phase 3: cross-host aggregation, team brains, schema migrations.

See [CHANGELOG.md](./CHANGELOG.md) for releases.

---

## License

MIT. See [LICENSE](./LICENSE).

---

## Maintainer

Maintained by [ShellTab HQ](https://shelltab.dev). ShellTab is the first full implementation of GTab and runs against this exact spec in production. The repository is intentionally host-agnostic — fork it, adopt the spec, and become GBrain-compatible. PRs welcome.
