// The brand-bleed color rule (DESIGN.md §9c): a row or screen glows in the
// service's TRUE color, never black or white.
//
// Resolution order:
//   1. the item's own stored color,
//   2. the brand bank's color for a matching name or domain,
//   3. the caller's fallback (the theme accent),
// where any candidate too close to black or white is rejected and the chain
// falls through. (Pixel-derived dominant colors need a native module that
// Expo Go can't load — revisit when dev builds arrive; until then the AI
// import supplies colors and the bank covers known brands.)

import { SUGGESTED_COMMITMENTS } from "@keel/core";

interface Branded {
  name: string;
  domain?: string;
  color?: string;
}

/** Near-black and near-white make invisible washes — reject them. */
function usable(hex: string | undefined): hex is string {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return false;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.09 && luminance < 0.91;
}

// One index, built once: the bank by lowercased name and by domain.
const byName = new Map<string, string>();
const byDomain = new Map<string, string>();
for (const s of SUGGESTED_COMMITMENTS) {
  if (!usable(s.color)) continue;
  byName.set(s.name.toLowerCase(), s.color);
  if (s.domain && !byDomain.has(s.domain)) byDomain.set(s.domain, s.color);
}

export function brandBleed(item: Branded, fallback: string): string {
  if (usable(item.color)) return item.color;
  const banked =
    byName.get(item.name.trim().toLowerCase()) ??
    (item.domain ? byDomain.get(item.domain) : undefined);
  if (usable(banked)) return banked;
  return fallback;
}
