<script lang="ts">
  import { ask } from "../lib/api.ts";
  import type { AskResult } from "../lib/types.ts";

  interface Props {
    onCite: (slug: string) => void;
  }
  let { onCite }: Props = $props();

  interface Turn {
    role: "user" | "brain";
    content: string;
    sources?: string[];
    duration_ms?: number;
    error?: string;
  }

  let turns = $state<Turn[]>([]);
  let input = $state("");
  let loading = $state(false);

  async function send() {
    const q = input.trim();
    if (!q || loading) return;
    input = "";
    turns = [...turns, { role: "user", content: q }];
    loading = true;
    try {
      const result: AskResult = await ask(q);
      turns = [
        ...turns,
        { role: "brain", content: result.answer, sources: result.sources, duration_ms: result.duration_ms },
      ];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      turns = [...turns, { role: "brain", content: "", error: msg }];
    } finally {
      loading = false;
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }
</script>

<div class="chat">
  <div class="header">🧠 Ask the brain</div>
  <div class="turns">
    {#if turns.length === 0}
      <div class="hint">Try: "what did Sarah work on yesterday?" or "show me sessions where the build failed"</div>
    {/if}
    {#each turns as t, i (i)}
      <div class="turn turn-{t.role}">
        <div class="role">{t.role === "user" ? "You" : "Brain"}</div>
        {#if t.error}
          <div class="error">⚠ {t.error}</div>
        {:else}
          <div class="content">{t.content}</div>
          {#if t.sources && t.sources.length > 0}
            <details class="sources">
              <summary>{t.sources.length} source{t.sources.length === 1 ? "" : "s"}</summary>
              {#each t.sources as s}
                <button class="src-link" onclick={() => onCite(s)}>{s}</button>
              {/each}
            </details>
          {/if}
        {/if}
      </div>
    {/each}
    {#if loading}
      <div class="turn turn-brain">
        <div class="role">Brain</div>
        <div class="content thinking">thinking…</div>
      </div>
    {/if}
  </div>
  <div class="input-row">
    <textarea
      placeholder="Ask the brain anything..."
      bind:value={input}
      onkeydown={onKey}
      rows="2"
      disabled={loading}
    ></textarea>
    <button data-variant="primary" onclick={send} disabled={loading || !input.trim()}>
      Ask
    </button>
  </div>
</div>

<style>
  .chat {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .header {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    font-weight: 600;
    color: var(--fg);
    font-size: 13px;
  }
  .turns {
    flex: 1;
    overflow-y: auto;
    padding: 10px 12px;
    min-height: 0;
  }
  .hint {
    color: var(--fg-dimmer);
    font-size: 11px;
    font-style: italic;
    padding: 8px 0;
  }
  .turn {
    margin-bottom: 10px;
    padding: 8px 10px;
    border-radius: 6px;
    background: var(--bg-elev-2);
  }
  .turn-brain {
    background: var(--accent-soft);
    border: 1px solid var(--accent);
  }
  .role {
    font-size: 10px;
    color: var(--fg-dim);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }
  .content {
    font-size: 12px;
    color: var(--fg);
    line-height: 1.5;
    white-space: pre-wrap;
  }
  .thinking {
    color: var(--fg-dimmer);
    font-style: italic;
  }
  .error {
    color: var(--err);
    font-size: 12px;
  }
  .sources {
    margin-top: 6px;
    font-size: 10px;
  }
  .sources summary {
    cursor: pointer;
    color: var(--fg-dim);
  }
  .src-link {
    display: block;
    text-align: left;
    width: 100%;
    border: none;
    background: transparent;
    color: var(--info);
    padding: 2px 0;
    font-size: 10px;
    font-family: ui-monospace, monospace;
  }
  .src-link:hover {
    text-decoration: underline;
    background: transparent;
  }
  .input-row {
    display: flex;
    gap: 6px;
    padding: 8px 12px;
    border-top: 1px solid var(--border);
  }
  textarea {
    flex: 1;
    resize: none;
    font-size: 12px;
  }
</style>
