// The brand-bleed color rule (DESIGN.md §9c): a row or screen glows in the
// service's TRUE color, never black or white.
//
// Resolution order:
//   1. the logo's pixel-derived dominant color — FIRST, always (user
//      decision, post round 2): what the badge shows is what the surface
//      wears; the stored color is its durable backup, auto-mirrored to the
//      nearest swatch by the form,
//   2. the item's own stored color,
//   3. the brand bank's color for a matching name or domain,
//   4. the caller's fallback (the theme accent),
// where any candidate too close to black or white is rejected and the chain
// falls through.

import { SUGGESTED_COMMITMENTS } from "@keel/core";

import { usableBrandColor } from "./brand-color";
import { dominantColor } from "./dominant-color";

export { usableBrandColor };

interface Branded {
  name: string;
  domain?: string;
  color?: string;
}

// One index, built once: the bank by lowercased name and by domain.
const byName = new Map<string, string>();
const byDomain = new Map<string, string>();
for (const s of SUGGESTED_COMMITMENTS) {
  if (!usableBrandColor(s.color)) continue;
  byName.set(s.name.toLowerCase(), s.color);
  if (s.domain && !byDomain.has(s.domain)) byDomain.set(s.domain, s.color);
}

export function brandBleed(item: Branded, fallback: string): string {
  const extracted = item.domain ? dominantColor(item.domain) : undefined;
  if (usableBrandColor(extracted)) return extracted;
  if (usableBrandColor(item.color)) return item.color;
  const banked =
    byName.get(item.name.trim().toLowerCase()) ??
    (item.domain ? byDomain.get(item.domain) : undefined);
  if (usableBrandColor(banked)) return banked;
  return fallback;
}
