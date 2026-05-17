---
schema_version: 1
slug: shell/session/2026-05-15/01hxsess_failed_build_bb
title: Debug failing CI build — TypeScript narrowing regression
source: agent_session
agent_type: claude
actor_id: usr_01HX_MIKE_PERSON_BBBB
host_id: shelltab
workspace_id: drv_01HX_SAMPLE_DRIVE_X
started_at: 2026-05-15T19:42:11Z
last_active_at: 2026-05-15T20:18:47Z
ended_at: 2026-05-15T20:18:47Z
duration_ms: 2196000
status: failed
command_count: 23
files_changed:
  - packages/api/src/handlers/webhook.ts
exit_status: error
tags:
  - typescript
  - ci
  - regression
  - webhook
sync:
  last_synced_at: 2026-05-15T20:18:52Z
  last_put_offset: 31204
  put_count: 6
  source_etag: sha256:2b4d6e8a1c3f5b7d9e0a2c4e6f8a0b2d
---

# Debug failing CI build — TypeScript narrowing regression

## Summary

CI build started failing after merging a webhook-handler refactor (#1198). Investigation traced the failure to a TypeScript narrowing change between versions 5.4.5 → 5.5.0 that breaks discriminated-union narrowing through optional chaining. Session marked **failed** — root cause identified, fix proposed, but no commit landed (open question on whether to upgrade TS, downgrade, or rewrite the narrowing pattern). Handing off to Sarah for decision on Monday.

## Commands

- 2026-05-15T19:42:11Z `[01HXBLK_FAIL_01]` `git pull --rebase origin main` (exit 0, 1842ms)
- 2026-05-15T19:42:24Z `[01HXBLK_FAIL_02]` `npm ci` (exit 0, 18432ms)
- 2026-05-15T19:43:01Z `[01HXBLK_FAIL_03]` `npm run typecheck` (exit 1, 9123ms)
- 2026-05-15T19:43:45Z `[01HXBLK_FAIL_04]` `npm run typecheck 2>&1 | head -50` (exit 1, 9088ms)
- 2026-05-15T19:45:11Z `[01HXBLK_FAIL_05]` `rg "WebhookEvent" packages/api/src/` (exit 0, 124ms)
- 2026-05-15T19:48:32Z `[01HXBLK_FAIL_06]` `git log --oneline -20 packages/api/src/handlers/webhook.ts` (exit 0, 88ms)
- 2026-05-15T19:51:08Z `[01HXBLK_FAIL_07]` `git show abc123def` (exit 0, 142ms)
- 2026-05-15T19:54:42Z `[01HXBLK_FAIL_08]` `cat package.json | jq .devDependencies.typescript` (exit 0, 41ms)
- 2026-05-15T19:55:09Z `[01HXBLK_FAIL_09]` `git log -p package.json | head -100` (exit 0, 184ms)
- 2026-05-15T19:58:01Z `[01HXBLK_FAIL_10]` `npx tsc --version` (exit 0, 412ms)
- 2026-05-15T20:01:18Z `[01HXBLK_FAIL_11]` `git stash` (exit 0, 88ms)
- 2026-05-15T20:01:32Z `[01HXBLK_FAIL_12]` `git checkout main~5` (exit 0, 412ms)
- 2026-05-15T20:01:51Z `[01HXBLK_FAIL_13]` `npm run typecheck` (exit 0, 8201ms)
- 2026-05-15T20:02:42Z `[01HXBLK_FAIL_14]` `git checkout main` (exit 0, 224ms)
- 2026-05-15T20:03:09Z `[01HXBLK_FAIL_15]` `git stash pop` (exit 0, 88ms)
- 2026-05-15T20:08:18Z `[01HXBLK_FAIL_16]` `rg "ts-expect-error|@ts-ignore" packages/api/src/handlers/webhook.ts` (exit 0, 41ms)
- 2026-05-15T20:11:32Z `[01HXBLK_FAIL_17]` `npx tsc --noEmit --traceResolution packages/api/src/handlers/webhook.ts 2>&1 | tail -100` (exit 1, 12104ms)
- 2026-05-15T20:14:42Z `[01HXBLK_FAIL_18]` `npm install --save-dev typescript@5.4.5` (exit 0, 8214ms)
- 2026-05-15T20:15:09Z `[01HXBLK_FAIL_19]` `npm run typecheck` (exit 0, 8104ms)
- 2026-05-15T20:16:42Z `[01HXBLK_FAIL_20]` `git checkout -- package.json package-lock.json` (exit 0, 88ms)
- 2026-05-15T20:17:09Z `[01HXBLK_FAIL_21]` `npm ci` (exit 0, 17204ms)
- 2026-05-15T20:18:18Z `[01HXBLK_FAIL_22]` `npm run typecheck` (exit 1, 9018ms)
- 2026-05-15T20:18:47Z `[01HXBLK_FAIL_23]` `# session ended without commit — handing off` (exit 0, 0ms)

## Files

- packages/api/src/handlers/webhook.ts (modified but not committed)

## Decisions

- **Root cause identified, fix deferred.** TypeScript 5.5.0 changed narrowing behavior on optional chains through discriminated unions; the existing pattern in `webhook.ts:handleEvent()` (line 84-103) relies on the old behavior. Three options exist: (a) pin TS to 5.4.5, (b) rewrite the narrowing with explicit type guards, (c) accept the change and adopt the new pattern repo-wide.
- **Open question:** which option? Recorded as a tag for Sarah's Monday review. See Errors below for the exact diagnostic.

## Errors

- `npm run typecheck` at 19:43:01 — **6 type errors in `webhook.ts`**, all of form "Property 'X' does not exist on type 'WebhookEventA | WebhookEventB'". The discriminator field `event.type` was being narrowed correctly in TS 5.4.5 but treated as `string` rather than the union literal in 5.5.0.
- `npx tsc --traceResolution` at 20:11:32 — confirmed TS resolution path is correct; not a module-resolution issue. Pure narrowing semantics change.
- `npm run typecheck` (after revert) at 20:18:18 — same failure; revert was incomplete; package-lock didn't restore TS version. Closed session without committing.

## Transcript

> [mike] CI is failing on main. I just rebased, ran typecheck, got 6 errors in webhook.ts. None of these existed last week.

> [claude] Let me reproduce first, then bisect. I'll start by reading the error output, then checking what changed in webhook.ts and its dependencies recently.

> *several diagnostics in*

> [claude] The errors are all narrowing failures through `event?.payload?.type`. Going to check whether the file changed recently...

> [claude] webhook.ts last changed in abc123def (3 days ago) — that's an unrelated formatting cleanup. So the file content is innocent. Likely a toolchain change. Let me check package.json history.

> [claude] Found it: TypeScript bumped from 5.4.5 → 5.5.0 in commit (omitted). TS 5.5 has stricter narrowing through optional chains on discriminated unions. The narrowing pattern we use in `handleEvent()` no longer works.

> [mike] confirm by pinning TS back?

> [claude] Yes — I'll install 5.4.5 explicitly, re-typecheck, expect pass.

> *test passes after pin*

> [claude] Confirmed. Three options: pin (quick), rewrite (clean), adopt new pattern repo-wide (best long-term). I don't have authority to choose unilaterally — this is an architectural call. Recommend handing to Sarah.

> [mike] agreed. reverting my pin so main isn't broken differently, ending the session, will ping her tomorrow.
