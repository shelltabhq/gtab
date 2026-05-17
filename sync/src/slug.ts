// Slug construction + validation per gtab/spec/slug-convention.md.

// Slug grammar: lowercase only. GBrain's import command derives slugs from
// filesystem paths and lowercases them — mixed-case slugs cause import skip
// errors. We enforce lowercase at the source so corpus and frontmatter agree.
const SLUG_RE = /^shell\/(session|cluster)\/\d{4}-\d{2}-\d{2}\/[a-z0-9_-]{1,128}$/;
const SOURCE_ID_RE = /^[a-z0-9_-]{1,128}$/;

export function buildSlug(args: {
  sourceType: "session" | "cluster";
  startedAt: string;
  sourceId: string;
}): string {
  const date = utcDate(args.startedAt);
  // Lowercase incoming source IDs (e.g., ULIDs from upstream systems are
  // typically uppercase). Hosts can pass either; the slug is canonicalized.
  const id = args.sourceId.toLowerCase();
  if (!SOURCE_ID_RE.test(id)) {
    throw new Error(
      `Invalid source_id "${args.sourceId}". Must match ${SOURCE_ID_RE} (≤128 chars, [a-z0-9_-]).`,
    );
  }
  return `shell/${args.sourceType}/${date}/${id}`;
}

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

export function parseSlug(slug: string): {
  sourceType: "session" | "cluster";
  date: string;
  sourceId: string;
} | null {
  const m = slug.match(/^shell\/(session|cluster)\/(\d{4}-\d{2}-\d{2})\/([a-z0-9_-]{1,128})$/);
  if (!m) return null;
  return {
    sourceType: m[1] as "session" | "cluster",
    date: m[2]!,
    sourceId: m[3]!,
  };
}

// ISO 8601 → YYYY-MM-DD in UTC. Never local TZ.
function utcDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ISO 8601 timestamp: ${iso}`);
  }
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
