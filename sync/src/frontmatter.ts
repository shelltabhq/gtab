// YAML frontmatter emitter + validator for the GTab page schema v1.
// Uses the `yaml` package for canonical YAML 1.2 output.

import YAML from "yaml";
import type { PageFrontmatter } from "./types.ts";
import { isValidSlug } from "./slug.ts";

const SCHEMA_VERSION = 1 as const;

export function emitPage(fm: PageFrontmatter, body: string): string {
  validateFrontmatter(fm);
  const yaml = YAML.stringify(fm, { lineWidth: 0, defaultStringType: "PLAIN" });
  // YAML.stringify already escapes specials; we wrap in --- delimiters.
  return `---\n${yaml.trimEnd()}\n---\n\n${body}`;
}

export function validateFrontmatter(fm: PageFrontmatter): void {
  const errors: string[] = [];

  if (fm.schema_version !== SCHEMA_VERSION) {
    errors.push(`schema_version must be ${SCHEMA_VERSION}, got ${fm.schema_version}`);
  }
  if (!isValidSlug(fm.slug)) {
    errors.push(`slug "${fm.slug}" does not match the v1 slug grammar`);
  }
  if (!fm.title || typeof fm.title !== "string") {
    errors.push("title is required and must be a string");
  }
  if (fm.source !== "agent_session" && fm.source !== "activity_cluster") {
    errors.push(`source must be "agent_session" or "activity_cluster"`);
  }
  if (!fm.actor_id) {
    errors.push("actor_id is required");
  }
  if (!isIsoUtc(fm.started_at)) {
    errors.push(`started_at must be ISO 8601 UTC, got "${fm.started_at}"`);
  }
  if (!isIsoUtc(fm.last_active_at)) {
    errors.push(`last_active_at must be ISO 8601 UTC, got "${fm.last_active_at}"`);
  }
  if (fm.ended_at !== null && !isIsoUtc(fm.ended_at)) {
    errors.push(`ended_at must be ISO 8601 UTC or null, got "${fm.ended_at}"`);
  }
  if (typeof fm.duration_ms !== "number" || fm.duration_ms < 0) {
    errors.push("duration_ms must be a non-negative number");
  }
  const validStatuses = new Set(["active", "completed", "failed", "aborted"]);
  if (!validStatuses.has(fm.status)) {
    errors.push(`status must be one of ${[...validStatuses].join(", ")}, got "${fm.status}"`);
  }
  if (typeof fm.command_count !== "number" || fm.command_count < 0) {
    errors.push("command_count must be a non-negative number");
  }
  if (fm.source === "agent_session" && fm.agent_type === null) {
    errors.push("agent_session source requires non-null agent_type");
  }
  if (fm.source === "activity_cluster" && fm.agent_type !== null) {
    errors.push("activity_cluster source requires agent_type: null");
  }
  if (!fm.sync || typeof fm.sync.put_count !== "number" || fm.sync.put_count < 1) {
    errors.push("sync.put_count must be ≥ 1");
  }
  if (!fm.sync?.last_synced_at || !isIsoUtc(fm.sync.last_synced_at)) {
    errors.push("sync.last_synced_at must be ISO 8601 UTC");
  }

  if (errors.length > 0) {
    throw new ValidationError(`Frontmatter validation failed:\n  - ${errors.join("\n  - ")}`);
  }
}

export function parseFrontmatter(markdown: string): { frontmatter: unknown; body: string } | null {
  const m = markdown.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
  if (!m) return null;
  try {
    return { frontmatter: YAML.parse(m[1]!), body: m[2] ?? "" };
  } catch {
    return null;
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function isIsoUtc(s: unknown): s is string {
  if (typeof s !== "string") return false;
  // Strict: requires Z suffix (UTC). No timezone offsets allowed.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(s)) return false;
  return !Number.isNaN(new Date(s).getTime());
}
