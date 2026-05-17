<script lang="ts">
  import type { PageSummary } from "../lib/types.ts";
  import { actorColor, displayName, initials } from "../lib/actor.ts";
  import { relative } from "../lib/time.ts";

  interface Props {
    page: PageSummary;
    selected: boolean;
    onclick: () => void;
  }
  let { page, selected, onclick }: Props = $props();

  const statusGlyph: Record<PageSummary["status"], string> = {
    active: "●",
    completed: "✓",
    failed: "✗",
    aborted: "⊘",
  };
  const statusColor: Record<PageSummary["status"], string> = {
    active: "var(--info)",
    completed: "var(--ok)",
    failed: "var(--err)",
    aborted: "var(--fg-dimmer)",
  };

  const sourceLabel = $derived(page.source === "agent_session" ? page.agent_type ?? "agent" : "cluster");
  const fileCount = $derived(page.files_changed?.length ?? 0);
</script>

<button class="row" class:selected {onclick} type="button">
  <div class="avatar" style="background: {actorColor(page.actor_id)}">
    {initials(page.actor_id)}
  </div>
  <div class="meta">
    <div class="line-1">
      <span class="status" style="color: {statusColor[page.status]}">{statusGlyph[page.status]}</span>
      <span class="actor">{displayName(page.actor_id)}</span>
      <span class="source">{sourceLabel}</span>
      <span class="dot">·</span>
      <span class="time">{relative(page.last_active_at)}</span>
    </div>
    <div class="line-2">{page.title}</div>
    <div class="line-3">
      <span>{page.command_count} commands</span>
      {#if fileCount > 0}
        <span class="dot">·</span><span>{fileCount} files</span>
      {/if}
      {#if page.tags && page.tags.length > 0}
        <span class="dot">·</span>
        <span class="tags">
          {#each page.tags.slice(0, 3) as t}
            <span class="tag">{t}</span>
          {/each}
        </span>
      {/if}
    </div>
  </div>
</button>

<style>
  .row {
    display: flex;
    gap: 10px;
    width: 100%;
    text-align: left;
    border: none;
    border-bottom: 1px solid var(--border);
    border-radius: 0;
    background: transparent;
    padding: 10px 14px;
    cursor: pointer;
  }
  .row:hover {
    background: var(--bg-elev);
  }
  .row.selected {
    background: var(--accent-soft);
    border-left: 2px solid var(--accent);
    padding-left: 12px;
  }
  .avatar {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 600;
    color: var(--bg);
  }
  .meta {
    flex: 1;
    min-width: 0;
  }
  .line-1 {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--fg-dim);
    margin-bottom: 3px;
  }
  .status {
    font-size: 10px;
  }
  .actor {
    color: var(--fg);
    font-weight: 500;
  }
  .source {
    color: var(--accent);
    background: var(--accent-soft);
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 10px;
  }
  .dot {
    color: var(--fg-dimmest);
  }
  .time {
    color: var(--fg-dimmer);
  }
  .line-2 {
    font-size: 13px;
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-bottom: 3px;
  }
  .line-3 {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--fg-dimmer);
  }
  .tags {
    display: inline-flex;
    gap: 3px;
  }
  .tag {
    background: var(--bg-elev-2);
    color: var(--info);
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 10px;
  }
</style>
