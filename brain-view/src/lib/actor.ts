// Stable color + display-name resolution for actor_ids.
// Hosts SHOULD resolve actor_id → display name via their own user table.
// For the standalone demo, we hash to a palette slot and use a friendly label.

const PALETTE = [
  "var(--actor-1)",
  "var(--actor-2)",
  "var(--actor-3)",
  "var(--actor-4)",
  "var(--actor-5)",
  "var(--actor-6)",
];

const DEMO_NAMES: Record<string, string> = {
  usr_01HX_SARAH_PERSON_AAA: "Sarah",
  usr_01HX_MIKE_PERSON_BBBB: "Mike",
  usr_01HX_MICHAEL_PERSON_CC: "Michael",
};

export function displayName(actorId: string): string {
  return DEMO_NAMES[actorId] ?? truncate(actorId, 12);
}

export function actorColor(actorId: string): string {
  let h = 0;
  for (let i = 0; i < actorId.length; i++) {
    h = (h * 31 + actorId.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(h) % PALETTE.length]!;
}

export function initials(actorId: string): string {
  const name = displayName(actorId);
  const parts = name.split(/\s+/);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
