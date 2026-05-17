// GTab page schema v1 — types matching spec/session-page-schema.md.
// Keep in sync with the spec; bump schema_version + add migration if changed.

export type Source = "agent_session" | "activity_cluster";
export type AgentType = "claude" | "codex" | null;
export type Status = "active" | "completed" | "failed" | "aborted";
export type ExitStatus = "success" | "error" | null;

export interface SyncMeta {
  last_synced_at: string;
  last_put_offset?: number;
  put_count: number;
  source_etag?: string;
}

export interface PageFrontmatter {
  schema_version: 1;
  slug: string;
  title: string;
  source: Source;
  agent_type: AgentType;
  actor_id: string;
  host_id?: string;
  workspace_id?: string;
  started_at: string;
  last_active_at: string;
  ended_at: string | null;
  duration_ms: number;
  status: Status;
  command_count: number;
  files_changed?: string[];
  exit_status: ExitStatus;
  tags?: string[];
  sync: SyncMeta;
}

// Input shape consumed by the reference sync daemon.
// Matches gtab/examples/sample-session-input.json.
// Hosts adapt this from their own capture format.
export interface SessionInput {
  source: "agent_session";
  session: {
    provider_session_id: string;
    drive_id?: string;
    org_id?: string;
    actor_id: string;
    agent_type: "claude" | "codex";
    started_at: string;
    last_active_at: string;
    ended_at: string | null;
    status: Status;
    exit_status: ExitStatus;
    title: string;
    tags?: string[];
  };
  transcript_jsonl?: TranscriptTurn[];
  blocks?: BlockEvent[];
  files_changed?: FileChange[];
}

export interface ClusterInput {
  source: "activity_cluster";
  cluster: {
    cluster_id: string;
    drive_id?: string;
    org_id?: string;
    actor_id: string;
    opened_at: string;
    last_event_at: string;
    closed_at: string | null;
    status: Status;
    title?: string;
    tags?: string[];
  };
  events: ClusterEvent[];
}

export type Input = SessionInput | ClusterInput;

export interface TranscriptTurn {
  ts: string;
  role: "user" | "assistant" | "tool_call" | "tool_result";
  actor_id?: string;
  content?: string;
  tool?: string;
  input?: unknown;
}

export interface BlockEvent {
  block_id: string;
  actor_id: string;
  command: string;
  exit_code: number;
  started_at: string;
  duration_ms: number;
  stderr_snippet?: string;
}

export interface FileChange {
  path: string;
  added: number;
  removed: number;
}

export interface ClusterEvent {
  type: string;
  payload: Record<string, unknown>;
  at: string;
  actor_id?: string;
}

// State row persisted to state.ndjson, one line per slug.
export interface StateRow {
  slug: string;
  last_synced_at: string;
  last_put_offset?: number;
  put_count: number;
  retry_count: number;
  last_error: string | null;
  source_etag?: string;
  deleted_at?: string;
}

export interface StateHeader {
  _meta: true;
  state_version: 1;
  daemon_version: string;
}

// Result of a single publish attempt.
export type PublishResult =
  | { ok: true; slug: string; duration_ms: number }
  | { ok: false; slug: string; error: string; retryable: boolean; duration_ms: number };
