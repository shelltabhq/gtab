// Translates a host-supplied Input into a (frontmatter, body) pair conforming
// to the GTab page schema. Pure function — no IO, no side effects.

import { createHash } from "node:crypto";
import type {
  BlockEvent,
  ClusterEvent,
  ClusterInput,
  FileChange,
  Input,
  PageFrontmatter,
  SessionInput,
  TranscriptTurn,
} from "./types.ts";
import { buildSlug } from "./slug.ts";
import { emitPage } from "./frontmatter.ts";

export interface TranslateOptions {
  hostId?: string;
  workspaceId?: string;
  putCount: number; // ≥1; incremented per publish
  lastPutOffset?: number;
}

export interface TranslateResult {
  slug: string;
  frontmatter: PageFrontmatter;
  body: string;
  markdown: string; // emitPage(frontmatter, body)
  sourceEtag: string;
}

export function translate(input: Input, opts: TranslateOptions): TranslateResult {
  if (input.source === "agent_session") return translateSession(input, opts);
  return translateCluster(input, opts);
}

function translateSession(input: SessionInput, opts: TranslateOptions): TranslateResult {
  const s = input.session;
  const slug = buildSlug({
    sourceType: "session",
    startedAt: s.started_at,
    sourceId: s.provider_session_id,
  });

  const blocks = input.blocks ?? [];
  const filesChanged = input.files_changed ?? [];
  const transcript = input.transcript_jsonl ?? [];

  const durationMs = ms(s.started_at, s.last_active_at);

  const body = [
    `# ${s.title}`,
    "",
    "## Summary",
    "<empty — populated by dream cycle or downstream LLM>",
    "",
    blocks.length > 0 ? renderCommands(blocks) : null,
    filesChanged.length > 0 ? renderFiles(filesChanged) : null,
    renderErrors(blocks),
    transcript.length > 0 ? renderTranscript(transcript) : null,
  ]
    .filter((s): s is string => s !== null)
    .join("\n");

  const fm: PageFrontmatter = {
    schema_version: 1,
    slug,
    title: s.title,
    source: "agent_session",
    agent_type: s.agent_type,
    actor_id: s.actor_id,
    ...(opts.hostId ? { host_id: opts.hostId } : {}),
    ...(opts.workspaceId ? { workspace_id: opts.workspaceId } : {}),
    started_at: s.started_at,
    last_active_at: s.last_active_at,
    ended_at: s.ended_at,
    duration_ms: durationMs,
    status: s.status,
    command_count: blocks.length,
    files_changed: filesChanged.map((f) => f.path),
    exit_status: s.exit_status,
    tags: s.tags ?? [],
    sync: {
      last_synced_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      ...(opts.lastPutOffset !== undefined ? { last_put_offset: opts.lastPutOffset } : {}),
      put_count: opts.putCount,
      source_etag: "",
    },
  };

  const markdown = emitPage(fm, body);
  const sourceEtag = etagOf(markdown);
  fm.sync.source_etag = sourceEtag;

  return { slug, frontmatter: fm, body, markdown: emitPage(fm, body), sourceEtag };
}

function translateCluster(input: ClusterInput, opts: TranslateOptions): TranslateResult {
  const c = input.cluster;
  const slug = buildSlug({
    sourceType: "cluster",
    startedAt: c.opened_at,
    sourceId: c.cluster_id,
  });

  const events = input.events ?? [];
  const commandEvents = events.filter((e) => e.type === "command_block" || e.type === "command_block_error");
  const errorEvents = events.filter((e) => e.type === "command_block_error");
  const deployEvents = events.filter((e) => e.type.startsWith("deploy_"));

  const lastActive = c.last_event_at;
  const durationMs = ms(c.opened_at, lastActive);

  const title = c.title ?? `Activity cluster ${c.cluster_id}`;

  const body = [
    `# ${title}`,
    "",
    "## Summary",
    "<empty — populated by dream cycle or downstream LLM>",
    "",
    commandEvents.length > 0 ? renderClusterCommands(commandEvents) : null,
    errorEvents.length > 0 ? renderClusterErrors(errorEvents) : null,
    deployEvents.length > 0 ? renderDeploys(deployEvents) : null,
  ]
    .filter((s): s is string => s !== null)
    .join("\n");

  const fm: PageFrontmatter = {
    schema_version: 1,
    slug,
    title,
    source: "activity_cluster",
    agent_type: null,
    actor_id: c.actor_id,
    ...(opts.hostId ? { host_id: opts.hostId } : {}),
    ...(opts.workspaceId ? { workspace_id: opts.workspaceId } : {}),
    started_at: c.opened_at,
    last_active_at: lastActive,
    ended_at: c.closed_at,
    duration_ms: durationMs,
    status: c.status,
    command_count: commandEvents.length,
    files_changed: [],
    exit_status: c.status === "completed" ? "success" : c.status === "failed" ? "error" : null,
    tags: c.tags ?? [],
    sync: {
      last_synced_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      put_count: opts.putCount,
      source_etag: "",
    },
  };

  const markdown = emitPage(fm, body);
  const sourceEtag = etagOf(markdown);
  fm.sync.source_etag = sourceEtag;

  return { slug, frontmatter: fm, body, markdown: emitPage(fm, body), sourceEtag };
}

// -- body renderers ---------------------------------------------------------

function renderCommands(blocks: BlockEvent[]): string {
  const lines = blocks.map((b) => {
    const exit = `(exit ${b.exit_code}, ${b.duration_ms}ms)`;
    return `- ${b.started_at} \`[${b.block_id}]\` \`${escapeBacktick(b.command)}\` ${exit}`;
  });
  return `## Commands\n${lines.join("\n")}\n`;
}

function renderFiles(files: FileChange[]): string {
  const lines = files.map((f) => `- ${f.path} (+${f.added}/-${f.removed})`);
  return `## Files\n${lines.join("\n")}\n`;
}

function renderErrors(blocks: BlockEvent[]): string | null {
  const fails = blocks.filter((b) => b.exit_code !== 0);
  if (fails.length === 0) return null;
  const lines = fails.map((b) => {
    const stderr = b.stderr_snippet ? `\n  - stderr: \`${escapeBacktick(b.stderr_snippet.split("\n")[0] ?? "")}\`` : "";
    return `- \`${escapeBacktick(b.command)}\` at ${b.started_at} (exit ${b.exit_code})${stderr}`;
  });
  return `## Errors\n${lines.join("\n")}\n`;
}

function renderTranscript(turns: TranscriptTurn[]): string {
  const lines = turns.map((t) => {
    if (t.role === "user") return `> [${t.actor_id ?? "user"}] ${t.content ?? ""}\n`;
    if (t.role === "assistant") return `> [assistant] ${t.content ?? ""}\n`;
    if (t.role === "tool_call") return `> [tool] ${t.tool ?? "?"}(${JSON.stringify(t.input ?? {})})\n`;
    return "";
  });
  return `## Transcript\n${lines.join("\n")}`;
}

function renderClusterCommands(events: ClusterEvent[]): string {
  const lines = events.map((e) => {
    const cmd = (e.payload.command as string | undefined) ?? "";
    const exit = e.payload.exit_code !== undefined ? `(exit ${e.payload.exit_code})` : "";
    return `- ${e.at} \`${escapeBacktick(cmd)}\` ${exit}`.trim();
  });
  return `## Commands\n${lines.join("\n")}\n`;
}

function renderClusterErrors(events: ClusterEvent[]): string {
  const lines = events.map((e) => {
    const cmd = (e.payload.command as string | undefined) ?? "";
    const msg = (e.payload.error as string | undefined) ?? "";
    return `- \`${escapeBacktick(cmd)}\` at ${e.at}${msg ? ` — ${msg}` : ""}`;
  });
  return `## Errors\n${lines.join("\n")}\n`;
}

function renderDeploys(events: ClusterEvent[]): string {
  const lines = events.map((e) => `- ${e.at} ${e.type} ${JSON.stringify(e.payload)}`);
  return `## Deploys\n${lines.join("\n")}\n`;
}

// -- helpers ----------------------------------------------------------------

function ms(startIso: string, endIso: string): number {
  return Math.max(0, new Date(endIso).getTime() - new Date(startIso).getTime());
}

function etagOf(s: string): string {
  return `sha256:${createHash("sha256").update(s).digest("hex").slice(0, 32)}`;
}

function escapeBacktick(s: string): string {
  return s.replace(/`/g, "\\`");
}
