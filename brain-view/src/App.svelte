<script lang="ts">
  import { onMount } from "svelte";
  import type { HealthStatus, PageDetail, PageSummary } from "./lib/types.ts";
  import { getHealth, getPage, listPages } from "./lib/api.ts";
  import Feed from "./components/Feed.svelte";
  import DetailPane from "./components/DetailPane.svelte";
  import BrainPanel from "./components/BrainPanel.svelte";

  let pages = $state<PageSummary[]>([]);
  let loadingFeed = $state(false);
  let selectedSlug = $state<string | null>(null);
  let detail = $state<PageDetail | null>(null);
  let loadingDetail = $state(false);
  let sourceFilter = $state<"all" | "session" | "cluster">("all");
  let health = $state<HealthStatus | null>(null);

  async function refreshFeed() {
    loadingFeed = true;
    try {
      pages = await listPages({ source: sourceFilter, limit: 100 });
    } catch (e) {
      console.error("listPages failed:", e);
    } finally {
      loadingFeed = false;
    }
  }

  async function loadDetail(slug: string) {
    selectedSlug = slug;
    loadingDetail = true;
    try {
      detail = await getPage(slug);
    } catch (e) {
      console.error("getPage failed:", e);
      detail = null;
    } finally {
      loadingDetail = false;
    }
  }

  async function refreshHealth() {
    try {
      health = await getHealth();
    } catch {
      health = null;
    }
  }

  function closeDetail() {
    selectedSlug = null;
    detail = null;
  }

  onMount(() => {
    refreshFeed();
    refreshHealth();
    const t = setInterval(() => {
      refreshFeed();
      refreshHealth();
    }, 15_000);
    return () => clearInterval(t);
  });

  $effect(() => {
    // Re-fetch when filter changes.
    sourceFilter;
    refreshFeed();
  });
</script>

<header class="app-header">
  <div class="brand">
    <span class="logo">🧠</span>
    <span class="title">GTab</span>
    <span class="subtitle">— Brain View</span>
  </div>
  <div class="header-actions">
    <a href="https://github.com/ShellTabHQ/gtab" target="_blank" rel="noopener">github</a>
    <a href="https://shelltab.dev" target="_blank" rel="noopener">shelltab.dev</a>
  </div>
</header>

<main>
  <div class="left">
    <Feed
      {pages}
      {selectedSlug}
      onSelect={loadDetail}
      {sourceFilter}
      onFilterChange={(v) => (sourceFilter = v)}
      loading={loadingFeed}
      onRefresh={refreshFeed}
    />
    {#if selectedSlug}
      <div class="detail-overlay">
        <DetailPane page={detail} loading={loadingDetail} onClose={closeDetail} />
      </div>
    {/if}
  </div>
  <BrainPanel
    {health}
    onCite={(slug) => loadDetail(slug)}
    onSyncNow={refreshFeed}
    onDream={() => console.log("dream cycle button — deferred to phase 2")}
  />
</main>

<style>
  .app-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
    flex-shrink: 0;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .logo {
    font-size: 16px;
  }
  .title {
    font-weight: 600;
    font-size: 14px;
  }
  .subtitle {
    color: var(--fg-dimmer);
    font-size: 12px;
  }
  .header-actions {
    display: flex;
    gap: 12px;
    font-size: 12px;
  }
  .header-actions a {
    color: var(--fg-dim);
    text-decoration: none;
  }
  .header-actions a:hover {
    color: var(--info);
    text-decoration: underline;
  }
  main {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  .left {
    flex: 1;
    min-width: 0;
    position: relative;
    display: flex;
    flex-direction: column;
  }
  .detail-overlay {
    position: absolute;
    inset: 0;
    background: var(--bg);
    border-right: 1px solid var(--border);
    z-index: 10;
  }
</style>
