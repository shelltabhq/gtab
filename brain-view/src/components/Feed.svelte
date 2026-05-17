<script lang="ts">
  import type { PageSummary } from "../lib/types.ts";
  import FeedRow from "./FeedRow.svelte";

  interface Props {
    pages: PageSummary[];
    selectedSlug: string | null;
    onSelect: (slug: string) => void;
    sourceFilter: "all" | "session" | "cluster";
    onFilterChange: (v: "all" | "session" | "cluster") => void;
    loading: boolean;
    onRefresh: () => void;
  }
  let { pages, selectedSlug, onSelect, sourceFilter, onFilterChange, loading, onRefresh }: Props = $props();
</script>

<div class="feed">
  <div class="filters">
    <button
      class:active={sourceFilter === "all"}
      onclick={() => onFilterChange("all")}
    >
      All <span class="count">{pages.length}</span>
    </button>
    <button
      class:active={sourceFilter === "session"}
      onclick={() => onFilterChange("session")}
    >
      Sessions
    </button>
    <button
      class:active={sourceFilter === "cluster"}
      onclick={() => onFilterChange("cluster")}
    >
      Clusters
    </button>
    <div class="spacer"></div>
    <button onclick={onRefresh} disabled={loading} title="Refresh">
      {loading ? "Loading..." : "↻"}
    </button>
  </div>

  <div class="rows">
    {#if loading && pages.length === 0}
      <div class="empty">Loading brain…</div>
    {:else if pages.length === 0}
      <div class="empty">
        <div class="empty-title">Your brain is empty.</div>
        <div class="empty-sub">
          Start a session and your work will appear here within 30 seconds. Or put a page directly:
          <code>gbrain put &lt;slug&gt; &lt; page.md</code>
        </div>
      </div>
    {:else}
      {#each pages as page (page.slug)}
        <FeedRow
          {page}
          selected={page.slug === selectedSlug}
          onclick={() => onSelect(page.slug)}
        />
      {/each}
    {/if}
  </div>
</div>

<style>
  .feed {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-width: 0;
  }
  .filters {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .filters button {
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
  }
  .filters button.active {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--fg);
  }
  .count {
    color: var(--fg-dimmer);
    margin-left: 2px;
  }
  .spacer {
    flex: 1;
  }
  .rows {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }
  .empty {
    padding: 24px 14px;
    color: var(--fg-dim);
  }
  .empty-title {
    color: var(--fg);
    font-weight: 500;
    margin-bottom: 4px;
  }
  .empty-sub {
    font-size: 12px;
  }
</style>
