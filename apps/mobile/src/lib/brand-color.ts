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
