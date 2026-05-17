<script lang="ts">
  import type { PageDetail } from "../lib/types.ts";
  import { displayName } from "../lib/actor.ts";
  import { relative, durationLabel } from "../lib/time.ts";

  interface Props {
    page: PageDetail | null;
    loading: boolean;
    onClose: () => void;
  }
  let { page, loading, onClose }: Props = $props();
</script>

{#if loading}
  <div class="detail">
    <div class="placeholder">Loading…</div>
  </div>
{:else if !page}
  <div class="detail">
    <div class="placeholder">Select a row from the feed.</div>
  </div>
{:else}
  <div class="detail">
    <header>
      <div class="header-left">
        <h2>{page.title}</h2>
        <div class="sub">
          <span>{displayName(page.actor_id)}</span>
          <span class="dot">·</span>
          <span>{relative(page.last_active_at)}</span>
          <span class="dot">·</span>
          <span>{durationLabel(page.duration_ms)}</span>
          <span class="dot">·</span>
          <span class="status status-{page.status}">{page.status}</span>
        </div>
      </div>
      <button class="close" onclick={onClose} title="Close">✕</button>
    </header>

    <div class="slug">
      <code>{page.slug}</code>
    </div>

    {#if page.tags && page.tags.length > 0}
      <div class="tags">
        {#each page.tags as t}
          <span class="tag">{t}</span>
        {/each}
      </div>
    {/if}

    <article>
      {#each page.body.split("\n") as line, i (i)}
        {#if line.startsWith("## ")}
          <h3>{line.slice(3)}</h3>
        {:else if line.startsWith("# ")}
          <h2 class="body-h2">{line.slice(2)}</h2>
        {:else if line.startsWith("- ")}
          <div class="li">{line.slice(2)}</div>
        {:else if line.startsWith("> ")}
          <blockquote>{line.slice(2)}</blockquote>
        {:else if line.trim() === ""}
          <div class="break"></div>
        {:else}
          <div class="para">{line}</div>
        {/if}
      {/each}
    </article>
  </div>
{/if}

<style>
  .detail {
    height: 100%;
    overflow-y: auto;
    padding: 20px 24px;
  }
  .placeholder {
    color: var(--fg-dimmer);
    padding: 40px 0;
    text-align: center;
  }
  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 6px;
  }
  .header-left {
    flex: 1;
    min-width: 0;
  }
  h2 {
    font-size: 16px;
    margin: 0 0 4px;
    color: var(--fg);
  }
  h3 {
    font-size: 13px;
    color: var(--fg-dim);
    margin: 14px 0 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
  }
  .body-h2 {
    font-size: 14px;
    margin: 12px 0 4px;
    color: var(--fg);
  }
  .sub {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--fg-dim);
  }
  .dot {
    color: var(--fg-dimmest);
  }
  .status {
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 10px;
    text-transform: uppercase;
    font-weight: 600;
  }
  .status-active {
    background: rgba(147, 197, 253, 0.15);
    color: var(--info);
  }
  .status-completed {
    background: rgba(110, 231, 183, 0.15);
    color: var(--ok);
  }
  .status-failed {
    background: rgba(252, 165, 165, 0.15);
    color: var(--err);
  }
  .status-aborted {
    background: var(--bg-elev-2);
    color: var(--fg-dimmer);
  }
  .close {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    padding: 0;
    border-radius: 50%;
    color: var(--fg-dim);
  }
  .slug {
    font-size: 11px;
    color: var(--fg-dimmer);
    margin-bottom: 8px;
  }
  .tags {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  .tag {
    background: var(--bg-elev-2);
    color: var(--info);
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 10px;
  }
  article {
    font-size: 12px;
    line-height: 1.6;
    color: var(--fg);
  }
  .li {
    margin: 1px 0;
    padding-left: 12px;
    text-indent: -8px;
  }
  .li::before {
    content: "• ";
    color: var(--fg-dimmer);
  }
  .para {
    margin: 4px 0;
  }
  .break {
    height: 6px;
  }
  blockquote {
    border-left: 2px solid var(--accent);
    padding: 2px 10px;
    margin: 4px 0;
    color: var(--fg-dim);
    background: var(--bg-elev);
  }
</style>
