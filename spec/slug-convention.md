# GTab Slug Convention — v1

**Status:** Stable. Binding for GTab v0.1.0.

Every GTab page has a **stable, unique slug** — assigned once at first publish and never changed. The slug doubles as the page's path inside the GBrain corpus directory tree.

---

## 1. Format

```
shell/<source-type>/<YYYY-MM-DD>/<source-id>
```

| Segment | Values | Notes |
|---|---|---|
| `shell` | literal | Namespace. Distinguishes GTab pages from other GBrain content (manual notes, imported docs, etc.). |
| `<source-type>` | `session` \| `cluster` | Matches the `source` frontmatter field's first word. |
| `<YYYY-MM-DD>` | UTC date | From `started_at`. Pages do **not** migrate to the new date when they cross midnight. |
| `<source-id>` | string | Stable identifier from the originating system. UUIDs, ULIDs, or short slugs all work. Must not contain `/`. |

### 1.1 Source-type values

- `session` — an agent-driven session (Claude Code, Codex CLI, or any agent that maintains turn-by-turn state).
- `cluster` — an activity cluster (raw terminal commands, deploys, git ops grouped by time/scope).

Hosts MAY add new source types only with a schema version bump (see [`session-page-schema.md`](./session-page-schema.md#33-writer-compliance)).

### 1.2 Date segment

- Always **UTC** to avoid timezone-driven slug instability.
- Always `YYYY-MM-DD` (four digits, zero-padded).
- Computed from `started_at`, never from `last_active_at` or wall-clock at publish time.

### 1.3 Source ID

- Should be **stable for the entire lifetime of the source** (no renaming, no regeneration).
- ULIDs are recommended (lexicographically sortable, time-encoded prefix).
- UUIDs (v4) are acceptable.
- Custom slugs (e.g., `auth-refactor-q2`) are allowed if the host can guarantee uniqueness.
- MUST NOT contain `/` (would break the filesystem mapping).
- MUST be lowercase ASCII alphanumerics, hyphens, and underscores. Mixed-case slugs cause `gbrain import` to derive a path-lowercased slug that doesn't match the frontmatter slug, and the page is silently skipped on bulk import. URL-safe by construction.

---

## 2. Examples

```
shell/session/2026-05-16/01hxab12cd34ef56gh78ij90kl
shell/session/2026-05-16/auth-refactor-q2
shell/cluster/2026-05-16/01hxab99zz88yy77xx66ww55vv
shell/cluster/2026-05-17/deploy-cluster-9f3e1a
```

---

## 3. Filesystem mapping

GBrain stores Markdown pages on disk at:

```
<corpus_root>/<slug>.md
```

For the examples above, with `corpus_root = ~/.gtab/corpus`:

```
~/.gtab/corpus/shell/session/2026-05-16/01hxab12cd34ef56gh78ij90kl.md
~/.gtab/corpus/shell/session/2026-05-16/auth-refactor-q2.md
~/.gtab/corpus/shell/cluster/2026-05-16/01hxab99zz88yy77xx66ww55vv.md
```

The directory tree mirrors the slug structure. Hosts MUST NOT create files outside this tree under the `shell/` namespace.

---

## 4. Constraints

### 4.1 Length

- Total slug length: **≤ 255 characters** (filesystem-portable limit on common filesystems).
- Source ID segment: **≤ 128 characters** recommended.

### 4.2 Character set

- Allowed: `a-z`, `0-9`, `-`, `_`, `/` (as segment separator only).
- Disallowed: uppercase letters, spaces, dots (except in extensions), special characters, non-ASCII.
- Validation regex: `^shell/(session|cluster)/\d{4}-\d{2}-\d{2}/[a-z0-9_-]{1,128}$`

Hosts whose upstream identifiers are uppercase (e.g., ULIDs are uppercase by spec) MUST lowercase before building the slug. This is a one-way mapping; the canonical slug is lowercase.

### 4.3 Uniqueness

Slugs MUST be globally unique within a single GBrain corpus. Hosts SHOULD use ULIDs or UUIDs to make collisions practically impossible. If a collision occurs:

- The second writer's `put_page` MAY succeed (overwriting), but the host SHOULD log the collision for triage.
- Spec does not mandate merge semantics.

### 4.4 Cross-host coordination

If multiple hosts publish to the same corpus (rare in v1, common in v2+ team brains), they SHOULD include `host_id` in frontmatter so consumers can disambiguate. The slug itself does NOT include `host_id` — keep slugs short.

---

## 5. Non-goals

- **Hierarchical slugs.** v1 is two levels deep (source-type + date). Sub-projects or sub-clusters are not modeled in the slug — they belong in `tags` or `workspace_id`.
- **Semantic slugs by default.** Hosts MAY use semantic slugs (e.g., `auth-refactor`) but the spec's default is opaque IDs. Semantic slugs trade uniqueness for readability.

---

## See also

- [`session-page-schema.md`](./session-page-schema.md) — the page contract.
- [`sync-protocol.md`](./sync-protocol.md) — when and how to publish.
