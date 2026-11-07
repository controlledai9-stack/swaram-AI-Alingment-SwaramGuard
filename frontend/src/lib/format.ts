export const pct = (v: number | null | undefined) => (v === null || v === undefined ? "n/a" : `${(v * 100).toFixed(1)}%`);

export const num = (v: number | null | undefined, digits = 2) => (v === null || v === undefined ? "n/a" : v.toFixed(digits));

/** `evt-abcdef12-0001` -> `evt-…-0001` for compact tables. */
export const shortId = (id: string) => id.replace(/^([a-z]+)-[0-9a-z]{6,}-(\d+)$/, "$1-…-$2");

/**
 * Friendly agent name generator (e.g. "Coder 3", "Analyst 2", "Planner 1")
 * Never displays cut-off raw UUIDs like "ag..." or "agt-271a5762-03".
 */
export function friendlyAgentName(id: string, role?: string | null): string {
  if (!id) return "Agent";
  
  // Extract trailing digits if present (e.g. agt-271a5762-03 -> 3)
  const match = id.match(/(\d+)$/);
  const numStr = match ? String(parseInt(match[1], 10)) : "";

  if (role) {
    const roleCapitalized = role.charAt(0).toUpperCase() + role.slice(1);
    return numStr ? `${roleCapitalized} ${numStr}` : roleCapitalized;
  }

  // If id is in role-number format like "coder-03" or "analyst-02"
  const prefixMatch = id.match(/^([a-z]+)[-_](\d+)$/i);
  if (prefixMatch) {
    const r = prefixMatch[1].charAt(0).toUpperCase() + prefixMatch[1].slice(1);
    return `${r} ${parseInt(prefixMatch[2], 10)}`;
  }

  return numStr ? `Agent ${numStr}` : id;
}

export const time = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

export const dateTime = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};
