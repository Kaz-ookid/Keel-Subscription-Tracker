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

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The palette entry closest to `hex` (plain RGB distance — the swatch grid
 *  is coarse enough that perceptual color math would change nothing). Used
 *  to mirror a logo's extracted color into a durable swatch choice. */
export function nearestColor(hex: string, palette: readonly string[]): string {
  const [r, g, b] = rgb(hex);
  let best = palette[0];
  let bestDistance = Infinity;
  for (const candidate of palette) {
    const [cr, cg, cb] = rgb(candidate);
    const distance = (cr - r) ** 2 + (cg - g) ** 2 + (cb - b) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}
