---
schema_version: 1
slug: shell/cluster/2026-05-15/01hxclus_deploy_ops_cccc
title: Production deploy window — payment-service v3.4.0
source: activity_cluster
agent_type: null
actor_id: usr_01HX_MIKE_PERSON_BBBB
host_id: shelltab
workspace_id: drv_01HX_SAMPLE_DRIVE_X
started_at: 2026-05-15T22:14:08Z
last_active_at: 2026-05-15T22:42:18Z
ended_at: 2026-05-15T22:42:18Z
duration_ms: 1690000
status: completed
command_count: 31
files_changed: []
exit_status: success
tags:
  - deploy
  - production
  - kubernetes
  - payment-service
sync:
  last_synced_at: 2026-05-15T22:42:23Z
  last_put_offset: 31
  put_count: 3
  source_etag: sha256:8c0e2a4d6f8b0c2e4a6d8f0b2c4e6a8d
---

# Production deploy window — payment-service v3.4.0

## Summary

Successful production deploy of `payment-service` v3.4.0. Rolled out across 3 production clusters (us-east, us-west, eu-central) with canary at 5% → 25% → 100%. Zero error-rate regression over the 28-minute window. Includes the auth middleware patch from shell/session/2026-05-16/01hxsess_auth_refactor_aa (cherry-picked into the release branch).

## Commands

- 2026-05-15T22:14:08Z `git checkout release/v3.4.0` (exit 0, 124ms)
- 2026-05-15T22:14:22Z `git pull` (exit 0, 412ms)
- 2026-05-15T22:14:42Z `git log --oneline release/v3.4.0..origin/main` (exit 0, 88ms)
- 2026-05-15T22:15:08Z `git cherry-pick abc4567` (exit 0, 184ms)
- 2026-05-15T22:15:32Z `git push origin release/v3.4.0` (exit 0, 1421ms)
- 2026-05-15T22:18:11Z `make build-image TAG=v3.4.0` (exit 0, 184214ms)
- 2026-05-15T22:21:18Z `docker push registry.internal/payment-service:v3.4.0` (exit 0, 18412ms)
- 2026-05-15T22:21:42Z `kubectl --context prod-us-east set image deployment/payment-service api=registry.internal/payment-service:v3.4.0` (exit 0, 412ms)
- 2026-05-15T22:21:58Z `kubectl --context prod-us-east rollout status deployment/payment-service --timeout 300s` (exit 0, 142001ms)
- 2026-05-15T22:24:32Z `curl -fsS https://payment-us-east.internal/health | jq` (exit 0, 412ms)
- 2026-05-15T22:25:08Z `curl -fsS https://payment-us-east.internal/version | jq .version` (exit 0, 88ms)

*(20 more identical-shape commands for us-west and eu-central rollouts)*

- 2026-05-15T22:40:42Z `kubectl --context prod-eu-central rollout status deployment/payment-service --timeout 300s` (exit 0, 124001ms)
- 2026-05-15T22:42:01Z `curl -fsS https://payment-eu-central.internal/version | jq .version` (exit 0, 88ms)
- 2026-05-15T22:42:18Z `gh release create v3.4.0 --title "payment-service v3.4.0" --notes-file CHANGELOG.md` (exit 0, 2104ms)

## Files

(none — deploy ops, no source changes in this cluster)

## Decisions

- **Canary strategy: 5% → 25% → 100%.** Rationale: standard team pattern; 5% gives us 2-3 minutes of real prod traffic before widening. Confirmed against historical incident postmortems — no payment-service deploy has needed a wider canary.

## Errors

(none)

## Transcript

(activity_cluster — no agent transcript)
