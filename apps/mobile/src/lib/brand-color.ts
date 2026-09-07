// The one shared brand-color predicate. Lives alone so brand.ts (the bleed
// resolver) and dominant-color.ts (the pixel extractor) can both use it
// without importing each other — they used to, and the require cycle warned
// on every launch.

/** Near-black, near-white AND near-grey make invisible (or dishwater)
 *  washes — reject them. The grey floor matters since the pixel-extracted
 *  color started LEADING the resolution: a placeholder favicon's grey must
 *  lose to the bank color or swatch behind it, never override them. */
export function usableBrandColor(hex: string | undefined): hex is string {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return false;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (luminance <= 0.09 || luminance >= 0.91) return false;
  return Math.max(r, g, b) - Math.min(r, g, b) >= 24;
}

// ---------------------------------------------------------------------------
// Refining an extracted logo color. A favicon is a mark on a white plate:
// after downscaling, the anti-aliased EDGE pixels (mark blended into white)
// often outnumber the pure mark pixels, so the histogram's winner is a
// washed-out pastel ("shy lila" for a strong purple). White-blending keeps
// the HUE and only drains saturation while lifting lightness — so the true
// color is recoverable: give some saturation back, clamp lightness into a
// confident band. Deliberately NOT full punch: the result should still sit
// comfortably as a background, just no longer anemic. Taste-tunable:

/** How much stolen saturation to give back, and the ceiling of that boost. */
const SATURATION_BOOST = 0.25;
const SATURATION_TARGET_CAP = 0.62;
/** The lightness band a brand wash looks confident in. */
const LIGHTNESS_MIN = 0.35;
const LIGHTNESS_MAX = 0.58;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const hueToChannel = (p: number, q: number, t: number): number => {
    let tn = t;
    if (tn < 0) tn += 1;
    if (tn > 1) tn -= 1;
    if (tn < 1 / 6) return p + (q - p) * 6 * tn;
    if (tn < 1 / 2) return q;
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
    return p;
  };
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hueToChannel(p, q, h + 1 / 3);
    g = hueToChannel(p, q, h);
    b = hueToChannel(p, q, h - 1 / 3);
  }
  const to255 = (v: number) => Math.round(v * 255);
  return (
    "#" +
    ((1 << 24) | (to255(r) << 16) | (to255(g) << 8) | to255(b)).toString(16).slice(1).toUpperCase()
  );
}

function saturationOf(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHsl(r, g, b)[1];
}

// Extraction is held to a STRICTER bar than stored/bank colors: a real
// brand color survives it easily, but a black-and-white logo's compression
// noise or blue-tinted near-black must NOT — those logos should read as
// MONO (undefined here) so the surfaces pick a scheme-appropriate ink
// instead of a muddy "almost black". Tolerance, not exactness: anything
// this close to black/white/grey counts as colorless.
const EXTRACT_LUMINANCE_MIN = 0.12;
const EXTRACT_LUMINANCE_MAX = 0.88;
const EXTRACT_SATURATION_MIN = 0.2;

function luminanceOf(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** The best USABLE color among an extraction's candidates, un-washed: the
 *  most saturated candidate wins (the purer color often hides in a
 *  secondary slot), then saturation and lightness are normalised back into
 *  the confident band. Returns undefined when nothing usable survives —
 *  which is exactly what a black-and-white logo should do. */
export function refineBrandColor(candidates: readonly unknown[]): string | undefined {
  const usable = candidates.filter(
    (c): c is string =>
      typeof c === "string" &&
      usableBrandColor(c) &&
      saturationOf(c) >= EXTRACT_SATURATION_MIN &&
      luminanceOf(c) > EXTRACT_LUMINANCE_MIN &&
      luminanceOf(c) < EXTRACT_LUMINANCE_MAX,
  );
  if (usable.length === 0) return undefined;
  const best = usable.reduce((a, b) => (saturationOf(b) > saturationOf(a) ? b : a));
  const [r, g, b] = hexToRgb(best);
  const [h, s, l] = rgbToHsl(r, g, b);
  const vividS = Math.max(s, Math.min(SATURATION_TARGET_CAP, s + SATURATION_BOOST));
  const settledL = Math.min(Math.max(l, LIGHTNESS_MIN), LIGHTNESS_MAX);
  return hslToHex(h, vividS, settledL);
}
