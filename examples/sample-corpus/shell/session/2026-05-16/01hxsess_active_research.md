---
schema_version: 1
slug: shell/session/2026-05-16/01hxsess_active_research
title: Survey SvelteKit 5 patterns for the brain-view tile
source: agent_session
agent_type: codex
actor_id: usr_01HX_MICHAEL_PERSON_CC
host_id: shelltab
workspace_id: drv_01HX_SAMPLE_DRIVE_X
started_at: 2026-05-16T13:04:27Z
last_active_at: 2026-05-16T15:48:12Z
ended_at: null
duration_ms: 9825000
status: active
command_count: 41
files_changed:
  - notes/svelte5-patterns.md
exit_status: null
tags:
  - svelte5
  - research
  - brain-view
  - runes
sync:
  last_synced_at: 2026-05-16T15:48:22Z
  last_put_offset: 47213
  put_count: 12
  source_etag: sha256:6f8a2c4e1b3d5f7a9c0e2d4f6a8b0c2e
---

# Survey SvelteKit 5 patterns for the brain-view tile

## Summary

Active research session — surveying how Svelte 5 runes (`$state`, `$derived`, `$effect`) compose with SvelteKit's load functions and stream-aware fetchers. Working out the shape of the brain-view tile's data layer: should the feed be a `$state` rune that subscribes to an SSE source, or a Svelte store wrapped through `$state.snapshot`? Initial leaning: rune-first with explicit `$effect` for SSE, no store wrapping. **Not yet committed** — the page is updating live as the session continues.

## Commands

- 2026-05-16T13:04:27Z `[01HXBLK_RES_01]` `mkdir -p notes && cd notes` (exit 0, 12ms)
- 2026-05-16T13:04:42Z `[01HXBLK_RES_02]` `git clone --depth=1 https://github.com/sveltejs/kit /tmp/sveltekit-ref` (exit 0, 4218ms)
- 2026-05-16T13:05:18Z `[01HXBLK_RES_03]` `rg "\\$state" /tmp/sveltekit-ref/packages/kit/src -l | head -20` (exit 0, 88ms)
- 2026-05-16T13:08:32Z `[01HXBLK_RES_04]` `code notes/svelte5-patterns.md` (exit 0, 184ms)

*(38 more commands omitted — page is active and still being added to)*

- 2026-05-16T15:48:12Z `[01HXBLK_RES_41]` `rg "EventSource" /tmp/sveltekit-ref/examples` (exit 0, 124ms)

## Files

- notes/svelte5-patterns.md (in-progress draft, +312/-0 currently)

## Errors

(none yet)

## Transcript

> [michael] I want to understand what shape the brain-view feed should take. Svelte 5 has runes, SvelteKit has stores, and there's the question of how SSE plays with both.

> [codex] Let's start by reading how the SvelteKit team uses runes vs stores in their own examples, then look at how SSE is wired in the kit's adapter examples.

> *several files read*

> [codex] My current read: the runes-first approach gives you reactive primitives with no store/runes interop hazard. The pattern would be: `let pages = $state<GtabPage[]>([])`, then an `$effect` opens an SSE connection to your API, appends new pages, dedupes by slug. This is what I'd recommend for the brain-view tile.

> [michael] what about SvelteKit's load function? does it still apply?

> [codex] Yes — the initial page load can come through the SvelteKit `+page.server.ts` load function, returning the first batch synchronously. The SSE subscription kicks in client-side after hydration via `onMount` → `$effect`. Best of both worlds: fast first paint, live updates after.

*(session continues...)*
