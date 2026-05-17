// NDJSON state persistence per gtab/spec/sync-protocol.md §6.
// First line is a header (state_version + daemon_version).
// Subsequent lines: one StateRow per slug.
// Writes are atomic: write tmp, fsync, rename.

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { StateHeader, StateRow } from "./types.ts";

const STATE_VERSION = 1 as const;
const DAEMON_VERSION = "0.1.0";

export class State {
  private rows = new Map<string, StateRow>();
  private constructor(private readonly path: string) {}

  static async load(path: string): Promise<State> {
    const s = new State(path);
    try {
      const raw = await readFile(path, "utf8");
      const lines = raw.split("\n").filter((l) => l.trim() !== "");
      if (lines.length === 0) return s;

      const headerRaw = lines.shift()!;
      let parsedHeader: unknown = null;
      try {
        parsedHeader = JSON.parse(headerRaw);
      } catch {
        // Not parseable — treat as no header.
      }
      const isHeader =
        parsedHeader !== null &&
        typeof parsedHeader === "object" &&
        (parsedHeader as StateHeader)._meta === true;

      if (isHeader) {
        const v = (parsedHeader as StateHeader).state_version;
        if (typeof v !== "number" || v > STATE_VERSION) {
          throw new Error(
            `state.ndjson schema version ${v} is newer than this daemon's supported version ${STATE_VERSION}. Refusing to start. Upgrade gtab-sync or remove the state file to start fresh.`,
          );
        }
      } else {
        // First line was NOT a header (legacy file or absent marker) — put it back so it's parsed as a data row below.
        lines.unshift(headerRaw);
      }

      // Parse rows. Tolerate a corrupted LAST line (partial write).
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        try {
          const row = JSON.parse(line) as StateRow;
          if (typeof row.slug !== "string") continue;
          s.rows.set(row.slug, row);
        } catch (e) {
          if (i === lines.length - 1) break; // tolerate trailing partial line
          throw e;
        }
      }
    } catch (e: unknown) {
      // File not found is fine — fresh state.
      if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "ENOENT") {
        return s;
      }
      throw e;
    }
    return s;
  }

  get(slug: string): StateRow | undefined {
    return this.rows.get(slug);
  }

  set(row: StateRow): void {
    this.rows.set(row.slug, row);
  }

  delete(slug: string): void {
    this.rows.delete(slug);
  }

  all(): StateRow[] {
    return [...this.rows.values()];
  }

  size(): number {
    return this.rows.size;
  }

  async flush(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });

    const header: StateHeader = {
      _meta: true,
      state_version: STATE_VERSION,
      daemon_version: DAEMON_VERSION,
    };
    const lines = [JSON.stringify(header)];
    for (const row of this.rows.values()) {
      lines.push(JSON.stringify(row));
    }
    const content = lines.join("\n") + "\n";

    const tmp = this.path + ".tmp";
    await writeFile(tmp, content, { encoding: "utf8", flag: "w" });
    // Bun's writeFile fsyncs implicitly; rename is atomic on POSIX.
    await rename(tmp, this.path);
  }
}
