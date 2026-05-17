<script lang="ts">
  import type { HealthStatus } from "../lib/types.ts";
  import Chat from "./Chat.svelte";
  import Health from "./Health.svelte";

  interface Props {
    health: HealthStatus | null;
    onCite: (slug: string) => void;
    onSyncNow: () => void;
    onDream: () => void;
  }
  let { health, onCite, onSyncNow, onDream }: Props = $props();
</script>

<aside class="panel">
  <div class="title">🧠 Brain</div>

  <div class="chat-area">
    <Chat {onCite} />
  </div>

  <div class="actions">
    <button onclick={onSyncNow} title="Trigger an immediate sync of all dirty sources">Sync now</button>
    <button onclick={onDream} title="Run GBrain's nightly dream cycle once (deferred in v1)" disabled>
      Dream cycle
    </button>
  </div>

  <Health {health} />
</aside>

<style>
  .panel {
    width: 340px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--border);
    background: var(--bg-elev);
    min-height: 0;
  }
  .title {
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    font-weight: 600;
    color: var(--fg);
    font-size: 13px;
  }
  .chat-area {
    flex: 1;
    min-height: 0;
    display: flex;
  }
  .chat-area :global(.chat) {
    width: 100%;
  }
  .actions {
    display: flex;
    gap: 6px;
    padding: 8px 12px;
    border-top: 1px solid var(--border);
  }
  .actions button {
    flex: 1;
    font-size: 11px;
    padding: 5px 8px;
  }
</style>
