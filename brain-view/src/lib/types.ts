// Page schema types — kept narrow to what the UI consumes.
// Full schema lives in gtab/spec/session-page-schema.md.

export type Source = "agent_session" | "activity_cluster";
export type AgentType = "claude" | "codex" | null;
export type Status = "active" | "completed" | "failed" | "aborted";

export interface PageSummary {
  slug: string;
  title: string;
  source: Source;
  agent_type: AgentType;
  actor_id: string;
  started_at: string;
  last_active_at: string;
  ended_at: string | null;
  duration_ms: number;
  status: Status;
  command_count: number;
  files_changed?: string[];
  exit_status: "success" | "error" | null;
  tags?: string[];
}

export interface PageDetail extends PageSummary {
  body: string; // markdown without frontmatter
}

export interface HealthStatus {
  status: "healthy" | "degraded" | "down";
  gbrain_reachable: boolean;
  gbrain_version: string | null;
  sync_lag_seconds: number | null;
  last_sync_at: string | null;
  tracked_slugs: number;
  error_count_5m: number;
}

export interface AskResult {
  answer: string;
  sources: string[]; // slugs
  duration_ms: number;
}
