// Publishes a Markdown page to GBrain via the `gbrain put <slug>` CLI verb.
// Content is piped to stdin (verified at gbrain/src/core/operations.ts:524
// — cliHints: { name: 'put', positional: ['slug'], stdin: 'content' }).
//
// Returns a structured PublishResult; never throws.

import type { PublishResult } from "./types.ts";

export interface PublishOptions {
  gbrainBin?: string; // default "gbrain"
  timeoutMs?: number; // default 30000
  cwd?: string;
}

export async function publish(
  slug: string,
  markdown: string,
  opts: PublishOptions = {},
): Promise<PublishResult> {
  const bin = opts.gbrainBin ?? "gbrain";
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const startedAt = Date.now();

  let child: ReturnType<typeof Bun.spawn> | null = null;
  const timer = setTimeout(() => {
    try {
      child?.kill("SIGKILL");
    } catch {
      // child already gone
    }
  }, timeoutMs);

  try {
    // Bun.spawn accepts a Uint8Array as `stdin` — it gets piped to the child
    // and stdin closes automatically. Simpler and more portable than manual
    // FileSink/WritableStream juggling.
    child = Bun.spawn([bin, "put", slug], {
      stdin: new TextEncoder().encode(markdown),
      stdout: "pipe",
      stderr: "pipe",
      ...(opts.cwd ? { cwd: opts.cwd } : {}),
    });

    const exitCode = await child.exited;
    const duration_ms = Date.now() - startedAt;

    if (exitCode === 0) {
      return { ok: true, slug, duration_ms };
    }

    const stderrText = await readAll(child.stderr as ReadableStream<Uint8Array>);
    const stdoutText = await readAll(child.stdout as ReadableStream<Uint8Array>);
    const msg = (stderrText || stdoutText || `gbrain put exited ${exitCode}`).trim();
    return {
      ok: false,
      slug,
      error: msg,
      retryable: isRetryable(exitCode, msg),
      duration_ms,
    };
  } catch (e) {
    const duration_ms = Date.now() - startedAt;
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      slug,
      error: msg,
      retryable: true, // spawn/IO errors are typically retryable
      duration_ms,
    };
  } finally {
    clearTimeout(timer);
  }
}

// Delete via `gbrain delete <slug>`. Per gbrain/src/core/operations.ts
// cliHints, the verb is `delete` with slug positional.
export async function publishDelete(
  slug: string,
  opts: PublishOptions = {},
): Promise<PublishResult> {
  const bin = opts.gbrainBin ?? "gbrain";
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const startedAt = Date.now();

  let child: ReturnType<typeof Bun.spawn> | null = null;
  const timer = setTimeout(() => {
    try {
      child?.kill("SIGKILL");
    } catch {
      // child already gone
    }
  }, timeoutMs);

  try {
    child = Bun.spawn([bin, "delete", slug], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      ...(opts.cwd ? { cwd: opts.cwd } : {}),
    });
    const exitCode = await child.exited;
    const duration_ms = Date.now() - startedAt;

    if (exitCode === 0) {
      return { ok: true, slug, duration_ms };
    }

    const stderrText = await readAll(child.stderr as ReadableStream<Uint8Array>);
    const msg = stderrText.trim() || `gbrain delete exited ${exitCode}`;
    return {
      ok: false,
      slug,
      error: msg,
      retryable: isRetryable(exitCode, msg),
      duration_ms,
    };
  } catch (e) {
    const duration_ms = Date.now() - startedAt;
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, slug, error: msg, retryable: true, duration_ms };
  } finally {
    clearTimeout(timer);
  }
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(buf);
}

// Classifies a gbrain failure as retryable or terminal.
// Conservative: schema/validation failures aren't retryable; everything else is.
function isRetryable(exitCode: number | null, message: string): boolean {
  if (exitCode === null) return true; // killed by signal (likely timeout)
  const lower = message.toLowerCase();
  if (lower.includes("permission_denied")) return false;
  if (lower.includes("slug grammar")) return false;
  if (lower.includes("invalid frontmatter")) return false;
  if (lower.includes("schema validation")) return false;
  if (lower.includes("not authorized")) return false;
  return true;
}
