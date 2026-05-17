# GTab Examples

Reference data used by `docker compose up` and the reference sync daemon's tests.

## `sample-corpus/`

Six anonymized example pages exercising the schema and slug conventions. The Brain View tile renders these out-of-the-box for the standalone demo (`docker compose up`).

| Slug | Actor | Source | Status | Notes |
|---|---|---|---|---|
| [`shell/session/2026-05-16/01hxsess_auth_refactor_aa`](./sample-corpus/shell/session/2026-05-16/01hxsess_auth_refactor_aa.md) | Sarah | agent_session (claude) | completed | Auth middleware patch; implements the strategy from the 05-14 design session. |
| [`shell/session/2026-05-16/01hxsess_active_research`](./sample-corpus/shell/session/2026-05-16/01hxsess_active_research.md) | Michael | agent_session (codex) | **active** | Mid-session example; `ended_at: null`, `status: active`. Exercises the in-progress UI state. |
| [`shell/session/2026-05-15/01hxsess_failed_build_bb`](./sample-corpus/shell/session/2026-05-15/01hxsess_failed_build_bb.md) | Mike | agent_session (claude) | **failed** | TS narrowing regression; exit_status: error. Exercises the failure UI state. |
| [`shell/session/2026-05-14/01hxsess_feature_design_e`](./sample-corpus/shell/session/2026-05-14/01hxsess_feature_design_e.md) | Michael | agent_session (claude) | completed | Auth strategy design doc; referenced by the auth refactor page. |
| [`shell/cluster/2026-05-15/01hxclus_deploy_ops_cccc`](./sample-corpus/shell/cluster/2026-05-15/01hxclus_deploy_ops_cccc.md) | Mike | activity_cluster | completed | Production deploy window. agent_type: null. |
| [`shell/cluster/2026-05-14/01hxclus_debugging_dddd`](./sample-corpus/shell/cluster/2026-05-14/01hxclus_debugging_dddd.md) | Sarah | activity_cluster | completed | Oncall incident response. Tagged `incident`, `oncall`. |

### What the corpus exercises

- **Both source types** (4× session, 2× cluster)
- **Three actors** (Sarah, Mike, Michael) — drives attribution color-coding in the Brain View
- **All four status values** (completed, failed, active, completed)
- **Two agent types** + null (claude, codex, null for clusters)
- **Cross-references** between pages (auth_refactor → feature_design, deploy_ops → auth_refactor) — exercises backlink and graph-traversal queries
- **Varied tag sets** — auth, security, deploy, incident, design, research, etc.
- **Varied page sizes** — from short cluster summaries to long agent transcripts
- **Sync metadata** — every page has realistic `sync.*` frontmatter (last_synced_at, put_count, source_etag)

### Actors

Three made-up `actor_id` values used throughout:

| `actor_id` | Display |
|---|---|
| `usr_01HX_SARAH_PERSON_AAA` | Sarah |
| `usr_01HX_MIKE_PERSON_BBBB` | Mike |
| `usr_01HX_MICHAEL_PERSON_CC` | Michael |

The host (e.g., ShellTab) is responsible for resolving `actor_id` → display name + avatar at render time. The corpus stores only the opaque ID.

---

## `sample-session-input.json`

A reference input that a host's sync daemon might receive — what ShellTab's `gtab-sync` would consume before translating to Markdown. Shows the contract between host capture and the sync daemon.

```bash
# Feed it to the reference sync daemon (dry-run mode):
bun run ../sync/src/index.ts --input ./sample-session-input.json --dry-run
```

This produces the Markdown that would be published via `gbrain put <slug>`, without actually publishing. Useful for testing translation logic.

---

## Adding more examples

To add a new sample page:

1. Pick a slug per [`spec/slug-convention.md`](../spec/slug-convention.md).
2. Create the file at `sample-corpus/<slug>.md`.
3. Frontmatter MUST validate against [`spec/session-page-schema.md`](../spec/session-page-schema.md).
4. Run `gtab-validate sample-corpus/<slug>.md` to verify (once the reference validator lands).
5. Update the table above.

PRs adding new examples are welcome — they help cover edge cases in the Brain View component.
