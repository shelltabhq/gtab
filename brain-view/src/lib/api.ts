// Thin fetch wrappers for the Brain View backend.
// All backend endpoints live under /api/* (proxied to the Bun server in dev).

import type { AskResult, HealthStatus, PageDetail, PageSummary } from "./types.ts";

export interface ListPagesParams {
  source?: "session" | "cluster" | "all";
  actor?: string;
  limit?: number;
}

export async function listPages(params: ListPagesParams = {}): Promise<PageSummary[]> {
  const search = new URLSearchParams();
  if (params.source && params.source !== "all") search.set("source", params.source);
  if (params.actor) search.set("actor", params.actor);
  if (params.limit) search.set("limit", String(params.limit));
  const res = await fetch(`/api/pages?${search}`);
  if (!res.ok) throw new Error(`listPages: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { pages: PageSummary[] };
  return j.pages;
}

export async function getPage(slug: string): Promise<PageDetail | null> {
  const res = await fetch(`/api/pages/${encodeURI(slug)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getPage: ${res.status} ${await res.text()}`);
  return (await res.json()) as PageDetail;
}

export async function search(q: string): Promise<PageSummary[]> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`search: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { hits: PageSummary[] };
  return j.hits;
}

export async function ask(question: string): Promise<AskResult> {
  const res = await fetch(`/api/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) throw new Error(`ask: ${res.status} ${await res.text()}`);
  return (await res.json()) as AskResult;
}

export async function getHealth(): Promise<HealthStatus> {
  const res = await fetch(`/api/health`);
  if (!res.ok) throw new Error(`health: ${res.status}`);
  return (await res.json()) as HealthStatus;
}
