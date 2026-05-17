---
schema_version: 1
slug: shell/cluster/2026-05-14/01hxclus_debugging_dddd
title: Trace prod 502s — payment-service latency spike
source: activity_cluster
agent_type: null
actor_id: usr_01HX_SARAH_PERSON_AAA
host_id: shelltab
workspace_id: drv_01HX_SAMPLE_DRIVE_X
started_at: 2026-05-14T03:18:42Z
last_active_at: 2026-05-14T04:42:09Z
ended_at: 2026-05-14T04:42:09Z
duration_ms: 5007000
status: completed
command_count: 47
files_changed: []
exit_status: success
tags:
  - incident
  - oncall
  - 502
  - payment-service
  - latency
sync:
  last_synced_at: 2026-05-14T04:42:14Z
  last_put_offset: 47
  put_count: 8
  source_etag: sha256:1e3a5c7e9b1d3f5a7c9e1d3f5a7c9e1d
---

# Trace prod 502s — payment-service latency spike

## Summary

Oncall investigation of a 02:55 UTC alert: payment-service p99 latency spike → 502 rate climbed to 8% on us-east-1. Root cause traced to a downstream `risk-scorer` service exhausting its DB connection pool after a vendor cron job started running at the same time. Mitigated by raising the connection-pool ceiling temporarily; permanent fix tracked in JIRA SCORE-1184.

## Commands

- 2026-05-14T03:18:42Z `kubectl --context prod-us-east logs deployment/payment-service --since=30m | tail -200` (exit 0, 2104ms)
- 2026-05-14T03:19:18Z `kubectl --context prod-us-east logs deployment/payment-service --since=30m | grep ERROR | wc -l` (exit 0, 1842ms)
- 2026-05-14T03:20:08Z `kubectl --context prod-us-east logs deployment/payment-service --since=30m | grep "502" | head -20` (exit 0, 1924ms)
- 2026-05-14T03:21:32Z `kubectl --context prod-us-east logs deployment/payment-service --since=30m | grep -E "(timeout|refused|reset)" | head -20` (exit 0, 1801ms)
- 2026-05-14T03:23:11Z `kubectl --context prod-us-east logs deployment/payment-service --since=30m | grep risk-scorer | head -20` (exit 0, 1742ms)
- 2026-05-14T03:24:42Z `curl -fsS https://grafana.internal/api/dashboards/uid/payment-svc/?from=now-1h | jq '.dashboard.panels[] | select(.title=="p99 latency")'` (exit 0, 412ms)
- 2026-05-14T03:27:11Z `kubectl --context prod-us-east logs deployment/risk-scorer --since=30m | grep -E "(pool|connection)" | head -20` (exit 0, 1842ms)
- 2026-05-14T03:29:32Z `kubectl --context prod-us-east logs deployment/risk-scorer --since=30m | grep "max connections" | wc -l` (exit 0, 1421ms)

*(35 more commands omitted — diagnostics across logs, metrics dashboards, downstream service health)*

- 2026-05-14T04:38:11Z `kubectl --context prod-us-east set env deployment/risk-scorer DB_POOL_MAX=200` (exit 0, 412ms)
- 2026-05-14T04:38:42Z `kubectl --context prod-us-east rollout status deployment/risk-scorer --timeout 180s` (exit 0, 84012ms)
- 2026-05-14T04:40:18Z `curl -fsS https://grafana.internal/api/dashboards/uid/payment-svc | jq '.dashboard.panels[] | select(.title=="p99 latency") | .targets[0]'` (exit 0, 412ms)
- 2026-05-14T04:41:42Z `gh issue create --title "Move risk-scorer DB pool to autoscale" --body "Mitigation only; SCORE-1184 tracks permanent fix" --label "tech-debt,priority:high"` (exit 0, 1204ms)
- 2026-05-14T04:42:09Z `# incident resolved at 04:42 UTC; postmortem scheduled` (exit 0, 0ms)

## Files

(none — pure ops investigation)

## Decisions

- **Mitigation: bump risk-scorer DB pool from 50 → 200.** Rationale: vendor cron + payment-service traffic together exceed 50 concurrent connections at peak. 200 is over-provisioned but safe until SCORE-1184 lands autoscale. Acceptable for the next 7 days.
- **Permanent fix deferred to SCORE-1184.** Autoscaling the pool requires capacity planning and a vendor SLA check.

## Errors

- payment-service logs: 412 occurrences of "502 Bad Gateway" between 02:55 and 03:18 UTC. Traced to risk-scorer returning 503 due to "max connections reached" → payment-service propagating as 502.
- risk-scorer logs: 1,148 occurrences of "max connections (50) reached" between 02:48 and 04:38 UTC. Confirms pool exhaustion as proximate cause.

## Transcript

(activity_cluster — no agent transcript)
