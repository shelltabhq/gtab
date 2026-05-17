#!/usr/bin/env bun
// gtab-sync — reference sync daemon.
//
// Two modes:
//   1. --once: read inputs (JSON file(s) or directory of JSON files), translate
//      each to Markdown, publish via `gbrain put <slug>`. For testing and the
//      Docker compose demo.
//   2. --watch: poll an input directory for changed JSON files, debounce, sync.
//      For sustained local use.
//
// Production hosts (e.g. ShellTab) implement their own input adapter — this
// reference daemon's input is the JSON shape documented in
// examples/sample-session-input.json. The translation/publish/state/health
// layers are reusable as library imports.

import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { translate, type TranslateOptions } from "./translate.ts";
import { publish, publishDelete } from "./publish.ts";
import { State } from "./state.ts";
import { startHealthServer, type HealthState } from "./health.ts";
import { Log } from "./log.ts";
import type { Input, StateRow } from "./types.ts";

interface Cli {
  input: string;
  stateDir: string;
  once: boolean;
  watch: boolean;
  dryRun: boolean;
  intervalMs: number;
  debounceMs: number;
  healthPort: number;
  hostId?: string;
  workspaceId?: string;
  gbrainBin: string;
}

function parseArgs(argv: string[]): Cli {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const has = (flag: string) => argv.includes(flag);
  return {
    input: get("--input") ?? "./examples/sample-corpus",
    stateDir: get("--state-dir") ?? "./.gtab-sync",
    once: has("--once") || (!has("--watch") && !has("--once")), // default once
    watch: has("--watch"),
    dryRun: has("--dry-run"),
    intervalMs: parseInt(get("--interval-ms") ?? "10000", 10),
    debounceMs: parseInt(get("--debounce-ms") ?? "30000", 10),
    healthPort: parseInt(get("--health-port") ?? "7777", 10),
    hostId: get("--host-id"),
    workspaceId: get("--workspace-id"),
    gbrainBin: get("--gbrain-bin") ?? "gbrain",
  };
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const log = new Log(join(cli.stateDir, "sync.log"));
  const state = await State.load(join(cli.stateDir, "state.ndjson"));

  const health: HealthState = {
    startedAt: Date.now(),
    inFlight: 0,
    queueSize: 0,
    quarantineSize: 0,
    lastSyncAt: null,
    errorCount5m: 0,
    gbrainReachable: false,
    gbrainVersion: null,
    backfillRemaining: 0,
  };

  // Probe gbrain reachability + version once at start.
  await probeGbrain(cli.gbrainBin, health, log);

  const stopHealth = startHealthServer({ port: cli.healthPort, state, health }).stop;

  await log.info("daemon_start", {
    input: cli.input,
    state_dir: cli.stateDir,
    mode: cli.watch ? "watch" : "once",
    dry_run: cli.dryRun,
    gbrain_reachable: health.gbrainReachable,
    gbrain_version: health.gbrainVersion,
    health_port: cli.healthPort,
  });

  const shutdown = async (signal: string) => {
    await log.info("daemon_stop", { signal });
    stopHealth();
    await state.flush();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  if (cli.watch) {
    await runWatchLoop(cli, state, health, log);
  } else {
    await runOnce(cli, state, health, log);
    stopHealth();
    await state.flush();
  }
}

async function runOnce(cli: Cli, state: State, health: HealthState, log: Log): Promise<void> {
  const inputs = await loadInputs(cli.input);
  health.queueSize = inputs.length;
  await log.info("once_start", { count: inputs.length });

  for (const { path, input } of inputs) {
    await syncOne({ cli, state, health, log, input, sourcePath: path });
  }
  await state.flush();
  await log.info("once_done", { tracked: state.size() });
}

async function runWatchLoop(cli: Cli, state: State, health: HealthState, log: Log): Promise<void> {
  // Simple polling watcher — production hosts use fs.watch or D1 polling.
  let lastSeen = new Map<string, number>();
  while (true) {
    const inputs = await loadInputs(cli.input);
    const dirty: typeof inputs = [];
    for (const item of inputs) {
      const m = (await stat(item.path)).mtimeMs;
      if (lastSeen.get(item.path) !== m) {
        lastSeen.set(item.path, m);
        dirty.push(item);
      }
    }
    health.queueSize = dirty.length;

    for (const { path, input } of dirty) {
      const slug = previewSlug(input);
      if (slug && !shouldPublish(state.get(slug), cli.debounceMs)) {
        await log.debug("debounce_skip", { slug });
        continue;
      }
      await syncOne({ cli, state, health, log, input, sourcePath: path });
    }

    await state.flush();
    await sleep(cli.intervalMs);
  }
}

async function syncOne(args: {
  cli: Cli;
  state: State;
  health: HealthState;
  log: Log;
  input: Input;
  sourcePath: string;
}): Promise<void> {
  const { cli, state, health, log, input, sourcePath } = args;
  const existing = state.get(previewSlug(input) ?? "") ?? null;
  const opts: TranslateOptions = {
    putCount: (existing?.put_count ?? 0) + 1,
    lastPutOffset: existing?.last_put_offset,
    ...(cli.hostId ? { hostId: cli.hostId } : {}),
    ...(cli.workspaceId ? { workspaceId: cli.workspaceId } : {}),
  };

  let translated;
  try {
    translated = translate(input, opts);
  } catch (e) {
    await log.error("translate_failed", { source: sourcePath, error: errMsg(e) });
    return;
  }

  if (existing?.source_etag === translated.sourceEtag) {
    await log.debug("etag_unchanged_skip", { slug: translated.slug });
    return;
  }

  if (cli.dryRun) {
    await log.info("dry_run_emit", { slug: translated.slug, bytes: translated.markdown.length });
    process.stdout.write(`\n--- ${translated.slug} ---\n${translated.markdown}\n`);
    return;
  }

  health.inFlight += 1;
  const result = await publish(translated.slug, translated.markdown, { gbrainBin: cli.gbrainBin });
  health.inFlight -= 1;

  if (result.ok) {
    const row: StateRow = {
      slug: translated.slug,
      last_synced_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      put_count: (existing?.put_count ?? 0) + 1,
      retry_count: 0,
      last_error: null,
      source_etag: translated.sourceEtag,
      ...(translated.frontmatter.sync.last_put_offset !== undefined
        ? { last_put_offset: translated.frontmatter.sync.last_put_offset }
        : {}),
    };
    state.set(row);
    health.lastSyncAt = row.last_synced_at;
    await log.info("put_ok", {
      slug: translated.slug,
      duration_ms: result.duration_ms,
      bytes: translated.markdown.length,
    });
  } else {
    const prev = existing?.retry_count ?? 0;
    const next = prev + 1;
    const quarantined = next > 5 || !result.retryable;
    state.set({
      slug: translated.slug,
      last_synced_at: existing?.last_synced_at ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      put_count: existing?.put_count ?? 0,
      retry_count: next,
      last_error: result.error,
      ...(existing?.source_etag ? { source_etag: existing.source_etag } : {}),
    });
    health.errorCount5m += 1;
    if (quarantined) health.quarantineSize += 1;
    await log.warn(quarantined ? "put_quarantined" : "put_failed", {
      slug: translated.slug,
      retry_count: next,
      retryable: result.retryable,
      error: result.error,
    });
  }
}

function previewSlug(input: Input): string | null {
  // Compute the slug without doing the full translate pass. Mirrors slug.ts logic.
  try {
    if (input.source === "agent_session") {
      return `shell/session/${utcDate(input.session.started_at)}/${input.session.provider_session_id}`;
    }
    return `shell/cluster/${utcDate(input.cluster.opened_at)}/${input.cluster.cluster_id}`;
  } catch {
    return null;
  }
}

function utcDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shouldPublish(existing: StateRow | undefined, debounceMs: number): boolean {
  if (!existing) return true;
  if (existing.retry_count > 0) return true; // retry pending
  const sinceLast = Date.now() - new Date(existing.last_synced_at).getTime();
  return sinceLast >= debounceMs;
}

async function loadInputs(root: string): Promise<{ path: string; input: Input }[]> {
  const resolved = resolve(root);
  const s = await stat(resolved).catch(() => null);
  if (!s) return [];
  const paths: string[] = [];
  if (s.isFile()) paths.push(resolved);
  else await walk(resolved, paths);

  const out: { path: string; input: Input }[] = [];
  for (const p of paths) {
    if (!p.endsWith(".json")) continue;
    try {
      const raw = await readFile(p, "utf8");
      const parsed = JSON.parse(raw) as Input;
      if (parsed.source === "agent_session" || parsed.source === "activity_cluster") {
        out.push({ path: p, input: parsed });
      }
    } catch {
      // ignore unparseable files
    }
  }
  return out;
}

async function walk(dir: string, out: string[]): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
}

async function probeGbrain(bin: string, health: HealthState, log: Log): Promise<void> {
  try {
    const child = Bun.spawn([bin, "--version"], { stdout: "pipe", stderr: "pipe" });
    const code = await child.exited;
    if (code === 0) {
      const out = await new Response(child.stdout as ReadableStream<Uint8Array>).text();
      health.gbrainReachable = true;
      health.gbrainVersion = out.trim().split("\n")[0] ?? null;
      await log.info("gbrain_probe_ok", { version: health.gbrainVersion });
    } else {
      health.gbrainReachable = false;
      await log.error("gbrain_probe_failed", { exit_code: code });
    }
  } catch (e) {
    health.gbrainReachable = false;
    await log.error("gbrain_probe_error", { error: errMsg(e) });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Only run main() when invoked as a CLI. Library importers (e.g. ShellTab's
// drive-runtime adapter) get the re-exports below without booting the daemon.
if (import.meta.main) {
  main().catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
  });
}

// Re-exports — these make `sync` usable as a library by ShellTab and other hosts.
export { translate } from "./translate.ts";
export { publish, publishDelete } from "./publish.ts";
export { State } from "./state.ts";
export { startHealthServer } from "./health.ts";
export { Log } from "./log.ts";
export { buildSlug, isValidSlug, parseSlug } from "./slug.ts";
export { validateFrontmatter, emitPage, parseFrontmatter } from "./frontmatter.ts";
export * from "./types.ts";
