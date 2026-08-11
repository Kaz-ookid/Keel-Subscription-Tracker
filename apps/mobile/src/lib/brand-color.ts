// The one shared brand-color predicate. Lives alone so brand.ts (the bleed
// resolver) and dominant-color.ts (the pixel extractor) can both use it
// without importing each other — they used to, and the require cycle warned
// on every launch.

/** Near-black and near-white make invisible washes — reject them. */
export function usableBrandColor(hex: string | undefined): hex is string {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return false;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.09 && luminance < 0.91;
}
