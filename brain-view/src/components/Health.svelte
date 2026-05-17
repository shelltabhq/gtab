<script lang="ts">
  import type { HealthStatus } from "../lib/types.ts";
  import { relative } from "../lib/time.ts";

  interface Props {
    health: HealthStatus | null;
  }
  let { health }: Props = $props();

  const dotColor = $derived(
    !health
      ? "var(--fg-dimmer)"
      : health.status === "healthy"
        ? "var(--ok)"
        : health.status === "degraded"
          ? "var(--warn)"
          : "var(--err)",
  );

  const lagLabel = $derived(
    health?.sync_lag_seconds === null || health?.sync_lag_seconds === undefined
      ? "no sync yet"
      : health.sync_lag_seconds < 60
        ? `${health.sync_lag_seconds}s lag`
        : `${Math.floor(health.sync_lag_seconds / 60)}m lag`,
  );
</script>

<div class="health">
  <div class="header">Health</div>
  {#if !health}
    <div class="row dim">connecting…</div>
  {:else}
    <div class="row">
      <span class="dot" style="background: {dotColor}"></span>
      <span class="label">{health.status}</span>
    </div>
    <div class="row">
      <span class="key">GBrain</span>
      {#if health.gbrain_reachable}
        <span class="val ok">{health.gbrain_version ?? "up"}</span>
      {:else}
        <span class="val err">offline</span>
      {/if}
    </div>
    <div class="row">
      <span class="key">Sync</span>
      <span class="val">{lagLabel}</span>
    </div>
    <div class="row">
      <span class="key">Pages</span>
      <span class="val">{health.tracked_slugs}</span>
    </div>
    {#if health.last_sync_at}
      <div class="row">
        <span class="key">Last</span>
        <span class="val">{relative(health.last_sync_at)}</span>
      </div>
    {/if}
    {#if health.error_count_5m > 0}
      <div class="row">
        <span class="key">Errors (5m)</span>
        <span class="val err">{health.error_count_5m}</span>
      </div>
    {/if}
  {/if}
</div>

<style>
  .health {
    padding: 8px 12px;
    border-top: 1px solid var(--border);
    font-size: 11px;
  }
  .header {
    color: var(--fg-dim);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
    font-size: 10px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 2px 0;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .label {
    color: var(--fg);
    text-transform: capitalize;
  }
  .key {
    color: var(--fg-dimmer);
    width: 70px;
  }
  .val {
    color: var(--fg);
  }
  .val.ok {
    color: var(--ok);
  }
  .val.err {
    color: var(--err);
  }
  .dim {
    color: var(--fg-dimmer);
  }
</style>
