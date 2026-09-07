// The brand-bleed color rule (DESIGN.md §9c): a row or screen glows in the
// service's TRUE color, never black or white.
//
// Resolution order:
//   1. the logo's pixel verdict — FIRST, always (user decision, post
//      round 2): what the badge shows is what the surface wears. A COLORED
//      logo hands over its dominant color; a MONO (black-and-white) logo
//      hands over the SCHEME'S ink instead — white in dark mode, near-black
//      in light — because "the Apple logo's dominant color" is not a color,
//      and painting black-on-black helps nobody (2026-09-08 retex).
//   2. the item's own stored color,
//   3. the brand bank's color for a matching name or domain,
//   4. the caller's fallback (the theme accent),
// where any candidate too close to black or white is rejected and the chain
// falls through.

import { SUGGESTED_COMMITMENTS } from "@keel/core";

import { usableBrandColor } from "./brand-color";
import { dominantColor, monoPolarity } from "./dominant-color";
import { resolvedSchemeSnapshot } from "../theme";

/** What a mono logo's surfaces wear: the scheme's ink. Not pure black on
 *  light — a #000 wash dies on the light material; near-black reads right. */
const MONO_INK_DARK_SCHEME = "#FFFFFF";
const MONO_INK_LIGHT_SCHEME = "#1C2733";

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
  // A logo KNOWN to be black-and-white: the scheme's ink, always — the
  // pixel verdict leads, and its verdict here is "no color".
  if (item.domain && monoPolarity(item.domain)) {
    return resolvedSchemeSnapshot() === "dark" ? MONO_INK_DARK_SCHEME : MONO_INK_LIGHT_SCHEME;
  }
  if (usableBrandColor(item.color)) return item.color;
  const banked =
    byName.get(item.name.trim().toLowerCase()) ??
    (item.domain ? byDomain.get(item.domain) : undefined);
  if (usableBrandColor(banked)) return banked;
  return fallback;
}
