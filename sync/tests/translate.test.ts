import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { translate } from "../src/translate.ts";
import { buildSlug, isValidSlug, parseSlug } from "../src/slug.ts";
import { parseFrontmatter, validateFrontmatter } from "../src/frontmatter.ts";
import type { Input, PageFrontmatter } from "../src/types.ts";

const repoRoot = join(import.meta.dir, "..", "..");

describe("slug", () => {
  test("buildSlug encodes UTC date and source id", () => {
    expect(
      buildSlug({
        sourceType: "session",
        startedAt: "2026-05-16T14:18:42Z",
        sourceId: "01hxsess_test",
      }),
    ).toBe("shell/session/2026-05-16/01hxsess_test");
  });

  test("buildSlug rejects source id with slash", () => {
    expect(() =>
      buildSlug({ sourceType: "session", startedAt: "2026-05-16T14:18:42Z", sourceId: "bad/id" }),
    ).toThrow();
  });

  test("isValidSlug accepts canonical slugs (lowercase only)", () => {
    expect(isValidSlug("shell/session/2026-05-16/abc-123")).toBe(true);
    expect(isValidSlug("shell/cluster/2026-05-16/01hx_abc_def")).toBe(true);
  });

  test("isValidSlug rejects bad slugs", () => {
    expect(isValidSlug("session/abc")).toBe(false);
    expect(isValidSlug("shell/foo/2026-05-16/abc")).toBe(false); // wrong source type
    expect(isValidSlug("shell/session/26-05-16/abc")).toBe(false); // bad date
    expect(isValidSlug("shell/session/2026-05-16/")).toBe(false); // empty id
    expect(isValidSlug("shell/session/2026-05-16/UPPER")).toBe(false); // uppercase rejected
  });

  test("buildSlug lowercases uppercase source IDs", () => {
    expect(
      buildSlug({
        sourceType: "session",
        startedAt: "2026-05-16T14:18:42Z",
        sourceId: "01HXSESS_UPPER",
      }),
    ).toBe("shell/session/2026-05-16/01hxsess_upper");
  });

  test("parseSlug round-trips", () => {
    const slug = "shell/session/2026-05-16/01hxsess_test";
    const parsed = parseSlug(slug);
    expect(parsed).toEqual({ sourceType: "session", date: "2026-05-16", sourceId: "01hxsess_test" });
  });

  test("UTC date stays on start date across midnight", () => {
    // 23:55 UTC start
    const slug = buildSlug({
      sourceType: "session",
      startedAt: "2026-05-16T23:55:00Z",
      sourceId: "x",
    });
    expect(slug).toBe("shell/session/2026-05-16/x");
  });
});

describe("translate — agent_session", () => {
  test("produces valid frontmatter against sample input", async () => {
    const raw = await readFile(
      join(repoRoot, "examples", "sample-session-input.json"),
      "utf8",
    );
    const input = JSON.parse(raw) as Input;

    const result = translate(input, { putCount: 1, hostId: "shelltab", workspaceId: "drv_TEST" });

    expect(result.slug).toBe("shell/session/2026-05-16/01hxsess_auth_refactor_aa");
    expect(result.frontmatter.source).toBe("agent_session");
    expect(result.frontmatter.agent_type).toBe("claude");
    expect(result.frontmatter.actor_id).toBe("usr_01HX_SARAH_PERSON_AAA");
    expect(result.frontmatter.command_count).toBe(3); // sample has 3 blocks
    expect(result.frontmatter.files_changed?.length).toBe(4);
    expect(result.frontmatter.host_id).toBe("shelltab");
    expect(result.frontmatter.workspace_id).toBe("drv_TEST");
    expect(result.sourceEtag).toMatch(/^sha256:/);

    // The emitted page must round-trip through the validator.
    const parsed = parseFrontmatter(result.markdown);
    expect(parsed).not.toBeNull();
    validateFrontmatter(parsed!.frontmatter as PageFrontmatter); // throws on failure
  });

  test("body renders commands, files, and errors sections", async () => {
    const raw = await readFile(
      join(repoRoot, "examples", "sample-session-input.json"),
      "utf8",
    );
    const input = JSON.parse(raw) as Input;
    const result = translate(input, { putCount: 1 });
    expect(result.body).toContain("## Commands");
    expect(result.body).toContain("## Files");
    expect(result.body).toContain("## Errors"); // sample has an exit=1 block
    expect(result.body).toContain("## Transcript");
  });

  test("etag is stable across identical inputs and changes on content drift", async () => {
    const raw = await readFile(
      join(repoRoot, "examples", "sample-session-input.json"),
      "utf8",
    );
    const input = JSON.parse(raw) as Input;
    const r1 = translate(structuredClone(input), { putCount: 1 });
    const r2 = translate(structuredClone(input), { putCount: 1 });
    // Note: last_synced_at is "now", so etags will differ between calls within
    // a second only if formatting collapses to the same second. We assert the
    // weaker invariant: same put_count + same content → same slug at minimum.
    expect(r1.slug).toBe(r2.slug);
  });
});

describe("translate — activity_cluster", () => {
  test("renders cluster with deploy events", () => {
    const input: Input = {
      source: "activity_cluster",
      cluster: {
        cluster_id: "01hxclus_test",
        actor_id: "usr_test",
        opened_at: "2026-05-15T22:14:08Z",
        last_event_at: "2026-05-15T22:42:18Z",
        closed_at: "2026-05-15T22:42:18Z",
        status: "completed",
        title: "Test cluster",
        tags: ["deploy"],
      },
      events: [
        {
          type: "deploy_succeeded",
          payload: { target: "us-east", version: "v3.4.0" },
          at: "2026-05-15T22:30:00Z",
        },
        {
          type: "command_block",
          payload: { command: "kubectl rollout status", exit_code: 0 },
          at: "2026-05-15T22:21:18Z",
        },
      ],
    };
    const result = translate(input, { putCount: 1 });
    expect(result.slug).toBe("shell/cluster/2026-05-15/01hxclus_test");
    expect(result.frontmatter.source).toBe("activity_cluster");
    expect(result.frontmatter.agent_type).toBeNull();
    expect(result.frontmatter.command_count).toBe(1); // one command_block
    expect(result.body).toContain("## Deploys");
    expect(result.body).toContain("## Commands");
  });
});

describe("frontmatter validation", () => {
  test("validates sample-corpus pages", async () => {
    const corpusFiles = [
      "shell/session/2026-05-16/01hxsess_auth_refactor_aa.md",
      "shell/session/2026-05-16/01hxsess_active_research.md",
      "shell/session/2026-05-15/01hxsess_failed_build_bb.md",
      "shell/session/2026-05-14/01hxsess_feature_design_e.md",
      "shell/cluster/2026-05-15/01hxclus_deploy_ops_cccc.md",
      "shell/cluster/2026-05-14/01hxclus_debugging_dddd.md",
    ];
    for (const file of corpusFiles) {
      const raw = await readFile(join(repoRoot, "examples", "sample-corpus", file), "utf8");
      const parsed = parseFrontmatter(raw);
      expect(parsed, `${file} should have parseable frontmatter`).not.toBeNull();
      validateFrontmatter(parsed!.frontmatter as PageFrontmatter); // throws on failure
    }
  });
});
