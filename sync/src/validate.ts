#!/usr/bin/env bun
// gtab-validate <path-or-dir>
//
// Validates a single Markdown page or every page in a directory against the
// GTab page schema v1. Exit 0 on success, non-zero on any failure.

import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter, validateFrontmatter, ValidationError } from "./frontmatter.ts";
import type { PageFrontmatter } from "./types.ts";

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: gtab-validate <path-or-dir> [path-or-dir...]");
    return 2;
  }

  let failures = 0;
  let validated = 0;

  for (const arg of args) {
    const targets = await expand(arg);
    for (const file of targets) {
      validated += 1;
      const r = await validateFile(file);
      if (!r.ok) {
        failures += 1;
        console.error(`✗ ${file}\n  ${r.error}`);
      } else {
        console.log(`✓ ${file}`);
      }
    }
  }

  console.error(`\n${validated} files checked, ${failures} failure(s).`);
  return failures > 0 ? 1 : 0;
}

async function expand(path: string): Promise<string[]> {
  const s = await stat(path).catch(() => null);
  if (!s) {
    console.error(`✗ ${path} does not exist`);
    return [];
  }
  if (s.isFile()) return [path];
  const out: string[] = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await expand(full)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

async function validateFile(path: string): Promise<{ ok: true } | { ok: false; error: string }> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (e) {
    return { ok: false, error: `read error: ${e instanceof Error ? e.message : String(e)}` };
  }
  const parsed = parseFrontmatter(raw);
  if (!parsed) {
    return { ok: false, error: "no YAML frontmatter found (page must start with `---`)" };
  }
  try {
    validateFrontmatter(parsed.frontmatter as PageFrontmatter);
    return { ok: true };
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, error: e.message };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(2);
  },
);
