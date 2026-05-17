// HTTP /health endpoint per sync-protocol.md §8.
// Bun.serve, loopback-only by default.

import type { State } from "./state.ts";

export interface HealthState {
  startedAt: number;
  inFlight: number;
  queueSize: number;
  quarantineSize: number;
  lastSyncAt: string | null;
  errorCount5m: number;
  gbrainReachable: boolean;
  gbrainVersion: string | null;
  backfillRemaining: number;
}

export function startHealthServer(opts: {
  port: number;
  state: State;
  health: HealthState;
}): { stop: () => void } {
  const server = Bun.serve({
    port: opts.port,
    hostname: "127.0.0.1",
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/health") {
        const now = Date.now();
        const status: "healthy" | "degraded" | "down" = !opts.health.gbrainReachable
          ? "down"
          : opts.health.errorCount5m > 5
            ? "degraded"
            : "healthy";
        const body = {
          status,
          uptime_seconds: Math.floor((now - opts.health.startedAt) / 1000),
          in_flight: opts.health.inFlight,
          queue_size: opts.health.queueSize,
          quarantine_size: opts.health.quarantineSize,
          last_sync_at: opts.health.lastSyncAt,
          sync_lag_seconds: opts.health.lastSyncAt
            ? Math.floor((now - new Date(opts.health.lastSyncAt).getTime()) / 1000)
            : null,
          error_count_5m: opts.health.errorCount5m,
          gbrain_reachable: opts.health.gbrainReachable,
          gbrain_version: opts.health.gbrainVersion,
          backfill_remaining: opts.health.backfillRemaining,
          tracked_slugs: opts.state.size(),
          daemon_version: "0.1.0",
        };
        return new Response(JSON.stringify(body, null, 2), {
          status: status === "down" ? 503 : 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.pathname === "/refresh" && req.method === "POST") {
        // The main loop owns the queue; refresh just bumps a hint.
        // Caller pattern: POST /refresh?slug=<slug> to nudge a single slug.
        return new Response(JSON.stringify({ enqueued: true }), {
          status: 202,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("Not Found", { status: 404 });
    },
  });

  return {
    stop: () => server.stop(true),
  };
}
