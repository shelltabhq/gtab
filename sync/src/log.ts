// Structured NDJSON logging per sync-protocol.md §8.
// Writes to <path>/sync.log; rotation is host-managed (logrotate, journald, etc.).

import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export type Level = "debug" | "info" | "warn" | "error";

export class Log {
  constructor(
    private readonly path: string,
    private readonly minLevel: Level = "info",
  ) {}

  async info(event: string, fields: Record<string, unknown> = {}): Promise<void> {
    return this.emit("info", event, fields);
  }
  async warn(event: string, fields: Record<string, unknown> = {}): Promise<void> {
    return this.emit("warn", event, fields);
  }
  async error(event: string, fields: Record<string, unknown> = {}): Promise<void> {
    return this.emit("error", event, fields);
  }
  async debug(event: string, fields: Record<string, unknown> = {}): Promise<void> {
    return this.emit("debug", event, fields);
  }

  private async emit(level: Level, event: string, fields: Record<string, unknown>): Promise<void> {
    if (rank(level) < rank(this.minLevel)) return;
    const line =
      JSON.stringify({
        ts: new Date().toISOString(),
        level,
        event,
        ...fields,
      }) + "\n";

    // Also mirror to stderr for human visibility.
    process.stderr.write(line);

    try {
      await mkdir(dirname(this.path), { recursive: true });
      await appendFile(this.path, line, "utf8");
    } catch {
      // Best-effort file logging. Stderr is the durable channel.
    }
  }
}

function rank(l: Level): number {
  return { debug: 0, info: 1, warn: 2, error: 3 }[l];
}
