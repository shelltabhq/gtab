---
schema_version: 1
slug: shell/session/2026-05-14/01hxsess_feature_design_e
title: Design the auth-token strategy for the API-first refactor
source: agent_session
agent_type: claude
actor_id: usr_01HX_MICHAEL_PERSON_CC
host_id: shelltab
workspace_id: drv_01HX_SAMPLE_DRIVE_X
started_at: 2026-05-14T11:08:42Z
last_active_at: 2026-05-14T12:42:18Z
ended_at: 2026-05-14T12:42:18Z
duration_ms: 5616000
status: completed
command_count: 18
files_changed:
  - docs/2026-05-14-auth-token-strategy.md
exit_status: success
tags:
  - design
  - auth
  - api-first
  - decision-doc
sync:
  last_synced_at: 2026-05-14T12:42:23Z
  last_put_offset: 22104
  put_count: 5
  source_etag: sha256:4d6f8a0c2e4f6a8c0e2f4a6c8e0f2a4c
---

# Design the auth-token strategy for the API-first refactor

## Summary

Locked in the auth-token strategy for the API-first refactor: **short-lived JWTs (1h) with refresh-token rotation (30d), no session cookies**. Wrote a binding design doc at `docs/2026-05-14-auth-token-strategy.md` covering the decision, rationale, threat model, and migration plan from the current cookie-based system. Sarah implemented the middleware patch two days later — see shell/session/2026-05-16/01hxsess_auth_refactor_aa.

## Commands

- 2026-05-14T11:08:42Z `[01HXBLK_DESIGN_01]` `git checkout -b design/auth-tokens` (exit 0, 42ms)
- 2026-05-14T11:09:01Z `[01HXBLK_DESIGN_02]` `mkdir -p docs && touch docs/2026-05-14-auth-token-strategy.md` (exit 0, 11ms)
- 2026-05-14T11:14:32Z `[01HXBLK_DESIGN_03]` `rg "cookie|session" packages/api/src/middleware/` (exit 0, 124ms)
- 2026-05-14T11:18:18Z `[01HXBLK_DESIGN_04]` `rg "JWT|jsonwebtoken|jose" packages/api/src/` (exit 0, 184ms)
- 2026-05-14T11:24:42Z `[01HXBLK_DESIGN_05]` `cat packages/api/src/middleware/cookie-auth.ts` (exit 0, 41ms)
- 2026-05-14T11:32:18Z `[01HXBLK_DESIGN_06]` `gh issue list --label "auth" --state all --limit 50` (exit 0, 1421ms)
- 2026-05-14T11:38:09Z `[01HXBLK_DESIGN_07]` `gh issue view 1042 --comments` (exit 0, 1842ms)
- 2026-05-14T11:48:42Z `[01HXBLK_DESIGN_08]` `code docs/2026-05-14-auth-token-strategy.md` (exit 0, 184ms)

*(10 more research/writing commands omitted)*

- 2026-05-14T12:38:11Z `[01HXBLK_DESIGN_17]` `git add docs/2026-05-14-auth-token-strategy.md && git commit -m "docs: auth-token strategy for API-first refactor"` (exit 0, 224ms)
- 2026-05-14T12:42:18Z `[01HXBLK_DESIGN_18]` `git push -u origin design/auth-tokens && gh pr create --title "docs: auth-token strategy for API-first refactor" --body-file docs/2026-05-14-auth-token-strategy.md` (exit 0, 2104ms)

## Files

- docs/2026-05-14-auth-token-strategy.md (+512/-0)

## Decisions

- **Short-lived JWTs (1h access) with refresh-token rotation (30d).** Rationale: the API-first refactor means clients other than browsers (CLI tools, agents, mobile) need to auth; cookies don't generalize. JWTs are stateless and pass through CDNs without coordination. Rotation closes the "stolen refresh token is forever" gap.
- **Reject session cookies entirely.** Rationale: legacy cookie code adds CSRF burden and doesn't survive cross-origin agent callers. Easier to remove now than to maintain two auth paths.
- **Migration plan: dual-write for 30 days, dual-read for 14, then cookie-off.** Rationale: existing browser sessions need a grace period; 30 days covers the median active session age in our analytics.

## Errors

(none)

## Transcript

> [michael] We need to decide the auth-token strategy before Sarah starts the API-first refactor. The options are: keep cookies, switch to JWTs entirely, or do both. I lean toward JWTs but want to talk through the threat model first.

> [claude] Let me read the current auth middleware to understand what we'd be changing, then survey the threat model. I'll look at how cookie-auth is used today and what migration would cost.

> *several files read*

> [claude] Current state: pure cookie-based, session ID stored in `__Host-sess` cookie, server-side session table in D1. Works fine for browsers but doesn't survive cross-origin callers (the API workers can't rely on cookies from arbitrary HTTP clients).

> [michael] right. and we have GH issues from CLI users (#1042) asking for a non-cookie auth path. let's review the threat model for JWTs.

> [claude] Main concerns: (1) revocation latency — tokens are valid for their full lifetime unless we maintain a blocklist; (2) refresh-token theft — once stolen, valid forever unless rotated; (3) signing key compromise — flat-fatal but rare. Mitigations: short access-token lifetime (1h), refresh-token rotation, async revocation blocklist (eventual consistency acceptable for low-value tokens).

> *design discussion continues...*

> [claude] Decision drafted in docs/2026-05-14-auth-token-strategy.md. Three decisions captured, migration plan included. PR opened.

> [michael] perfect. Sarah can implement this Friday or Monday.
