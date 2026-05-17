#!/usr/bin/env bun
// Brain View server — Bun HTTP that:
// 1. Serves the built SPA (dist/) statically.
// 2. Proxies /api/* to GBrain via filesystem reads + CLI shell-outs.
//
// Endpoints:
//   GET    /api/pages?source=session|cluster|all&actor=&limit=
//   GET    /api/pages/*slug         — slug is a catch-all path segment
//   GET    /api/search?q=
//   POST   /api/ask                  { question }
//   GET    /api/health
//   Static *                         — falls through to dist/

import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import YAML from "yaml";

const PORT = parseInt(Bun.env.PORT ?? "8081", 10);
const CORPUS_DIR = resolve(Bun.env.CORPUS_DIR ?? "../examples/sample-corpus");
const GBRAIN_BIN = Bun.env.GBRAIN_BIN ?? "gbrain";
const STATIC_DIR = resolve(Bun.env.STATIC_DIR ?? "./dist");
const SYNC_DAEMON_URL = Bun.env.SYNC_DAEMON_URL ?? "http://localhost:7777";

interface PageFrontmatter {
  schema_version: number;
  slug: string;
  title: string;
  source: "agent_session" | "activity_cluster";
  agent_type: "claude" | "codex" | null;
  actor_id: string;
  started_at: string;
  last_active_at: string;
  ended_at: string | null;
  duration_ms: number;
  status: "active" | "completed" | "failed" | "aborted";
  command_count: number;
  files_changed?: string[];
  exit_status: "success" | "error" | null;
  tags?: string[];
}

function send(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function err(msg: string, status = 500): Response {
  return send({ error: msg }, status);
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/api/health") return await handleHealth();
      if (url.pathname === "/api/pages") return await handleList(url);
      if (url.pathname.startsWith("/api/pages/")) {
        const slug = decodeURI(url.pathname.replace("/api/pages/", ""));
        return await handleGet(slug);
      }
      if (url.pathname === "/api/search") return await handleSearch(url);
      if (url.pathname === "/api/ask" && req.method === "POST") return await handleAsk(req);

      return await serveStatic(url.pathname);
    } catch (e) {
      console.error(`[${url.pathname}]`, e);
      return err(e instanceof Error ? e.message : String(e));
    }
  },
});

console.log(`brain-view server listening on http://127.0.0.1:${server.port}`);
console.log(`  corpus: ${CORPUS_DIR}`);
console.log(`  static: ${STATIC_DIR}`);
console.log(`  gbrain: ${GBRAIN_BIN}`);

// ----------------------------------------------------------------------------
// Endpoints
// ----------------------------------------------------------------------------

async function handleList(url: URL): Promise<Response> {
  const sourceParam = url.searchParams.get("source");
  const actor = url.searchParams.get("actor");
  const limit = parseInt(url.searchParams.get("limit") ?? "100", 10);

  let prefix = "shell";
  if (sourceParam === "session") prefix = "shell/session";
  else if (sourceParam === "cluster") prefix = "shell/cluster";

  const root = join(CORPUS_DIR, prefix);
  const files = await collectMdFiles(root).catch(() => []);

  const pages: PageFrontmatter[] = [];
  for (const f of files) {
    const parsed = await readPageFrontmatter(f).catch(() => null);
    if (!parsed) continue;
    if (actor && parsed.actor_id !== actor) continue;
    pages.push(parsed);
  }
  pages.sort((a, b) => new Date(b.last_active_at).getTime() - new Date(a.last_active_at).getTime());
  return send({ pages: pages.slice(0, limit) });
}

async function handleGet(slug: string): Promise<Response> {
  if (!isValidSlug(slug)) return err("invalid slug", 400);
  const path = join(CORPUS_DIR, `${slug}.md`);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return err("not found", 404);
  }
  const split = splitFrontmatter(raw);
  if (!split) return err("malformed page", 500);
  return send({ ...split.frontmatter, body: split.body });
}

async function handleSearch(url: URL): Promise<Response> {
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (!q) return send({ hits: [] });

  // Filesystem fallback: title/tag substring match against all pages.
  // (gbrain search is preferred — see TODO below for HTTP MCP integration.)
  const root = join(CORPUS_DIR, "shell");
  const files = await collectMdFiles(root).catch(() => []);
  const hits: PageFrontmatter[] = [];
  for (const f of files) {
    const parsed = await readPageFrontmatter(f).catch(() => null);
    if (!parsed) continue;
    const hay = [parsed.title, ...(parsed.tags ?? []), parsed.actor_id].join(" ").toLowerCase();
    if (hay.includes(q.toLowerCase())) hits.push(parsed);
  }
  return send({ hits: hits.slice(0, 50) });
}

async function handleAsk(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { question?: string } | null;
  const q = body?.question?.trim();
  if (!q) return err("missing question", 400);

  // Try shelling out to `gbrain query <q>`. If gbrain isn't installed (which
  // is the case in dev), fall back to a corpus-grep answer so the UI still
  // demonstrates the shape.
  const startedAt = Date.now();
  const gbrainResult = await runGbrainQuery(q).catch(() => null);
  if (gbrainResult) {
    return send({
      answer: gbrainResult.answer,
      sources: gbrainResult.sources,
      duration_ms: Date.now() - startedAt,
    });
  }

  // Fallback: corpus-only grep answer.
  const matches = await corpusGrep(q);
  const answer =
    matches.length > 0
      ? `(GBrain not reachable; corpus-grep fallback) Found ${matches.length} matching page(s):\n${matches.map((m) => `• ${m.title}`).join("\n")}`
      : `(GBrain not reachable; corpus-grep fallback) No pages matched "${q}".`;
  return send({
    answer,
    sources: matches.map((m) => m.slug),
    duration_ms: Date.now() - startedAt,
  });
}

async function handleHealth(): Promise<Response> {
  const gbrainProbe = await probeGbrain();

  // Try to relay daemon health if it's running.
  let daemon: {
    sync_lag_seconds: number | null;
    last_sync_at: string | null;
    tracked_slugs: number;
    error_count_5m: number;
  } | null = null;
  try {
    const res = await fetch(`${SYNC_DAEMON_URL}/health`, { signal: AbortSignal.timeout(500) });
    if (res.ok) {
      const j = (await res.json()) as {
        sync_lag_seconds: number | null;
        last_sync_at: string | null;
        tracked_slugs: number;
        error_count_5m: number;
      };
      daemon = j;
    }
  } catch {
    // Daemon not running — we count corpus pages directly instead.
  }

  let trackedSlugs = daemon?.tracked_slugs ?? 0;
  if (!daemon) {
    try {
      const files = await collectMdFiles(join(CORPUS_DIR, "shell"));
      trackedSlugs = files.length;
    } catch {
      trackedSlugs = 0;
    }
  }

  return send({
    status: gbrainProbe.reachable ? "healthy" : "degraded",
    gbrain_reachable: gbrainProbe.reachable,
    gbrain_version: gbrainProbe.version,
    sync_lag_seconds: daemon?.sync_lag_seconds ?? null,
    last_sync_at: daemon?.last_sync_at ?? null,
    tracked_slugs: trackedSlugs,
    error_count_5m: daemon?.error_count_5m ?? 0,
  });
}

// ----------------------------------------------------------------------------
// Static serving
// ----------------------------------------------------------------------------

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

async function serveStatic(pathname: string): Promise<Response> {
  // Normalize: strip leading slash, default to index.html
  let rel = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
  if (rel.includes("..")) return new Response("forbidden", { status: 403 });

  let abs = join(STATIC_DIR, rel);
  let s = await stat(abs).catch(() => null);
  if (!s || s.isDirectory()) {
    // SPA fallback: serve index.html so client-side router can take it.
    abs = join(STATIC_DIR, "index.html");
    s = await stat(abs).catch(() => null);
    if (!s) return new Response("not found", { status: 404 });
  }
  const mime = MIME[extname(abs).toLowerCase()] ?? "application/octet-stream";
  const file = Bun.file(abs);
  return new Response(file, { headers: { "content-type": mime } });
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

async function collectMdFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  await walk(root, out);
  return out;
}

async function walk(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
  }
}

function splitFrontmatter(raw: string): { frontmatter: PageFrontmatter; body: string } | null {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
  if (!m) return null;
  try {
    const frontmatter = YAML.parse(m[1]!) as PageFrontmatter;
    return { frontmatter, body: m[2] ?? "" };
  } catch {
    return null;
  }
}

async function readPageFrontmatter(path: string): Promise<PageFrontmatter | null> {
  const raw = await readFile(path, "utf8");
  return splitFrontmatter(raw)?.frontmatter ?? null;
}

function isValidSlug(slug: string): boolean {
  return /^shell\/(session|cluster)\/\d{4}-\d{2}-\d{2}\/[a-z0-9_-]{1,128}$/.test(slug);
}

async function probeGbrain(): Promise<{ reachable: boolean; version: string | null }> {
  try {
    const child = Bun.spawn([GBRAIN_BIN, "--version"], { stdout: "pipe", stderr: "pipe" });
    const code = await child.exited;
    if (code !== 0) return { reachable: false, version: null };
    const out = await new Response(child.stdout as ReadableStream<Uint8Array>).text();
    return { reachable: true, version: out.trim().split("\n")[0] ?? null };
  } catch {
    return { reachable: false, version: null };
  }
}

interface GbrainQueryOutput {
  answer: string;
  sources: string[];
}

async function runGbrainQuery(question: string): Promise<GbrainQueryOutput | null> {
  try {
    const child = Bun.spawn([GBRAIN_BIN, "query", question], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await child.exited;
    if (code !== 0) return null;
    const text = await new Response(child.stdout as ReadableStream<Uint8Array>).text();
    return {
      answer: text.trim(),
      sources: [],
    };
  } catch {
    return null;
  }
}

async function corpusGrep(q: string): Promise<{ slug: string; title: string }[]> {
  const root = join(CORPUS_DIR, "shell");
  const files = await collectMdFiles(root).catch(() => []);
  const matches: { slug: string; title: string }[] = [];
  const needle = q.toLowerCase();
  for (const f of files) {
    try {
      const raw = await readFile(f, "utf8");
      if (!raw.toLowerCase().includes(needle)) continue;
      const split = splitFrontmatter(raw);
      if (!split) continue;
      matches.push({ slug: split.frontmatter.slug, title: split.frontmatter.title });
    } catch {
      // skip unreadable files
    }
  }
  return matches.slice(0, 10);
}
