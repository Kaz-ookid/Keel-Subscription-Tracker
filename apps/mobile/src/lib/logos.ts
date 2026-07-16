// The single place that knows where brand logos come from. We never bundle
// trademarked artwork — a logo is fetched at runtime (currently via Google's
// favicon service, keyless and no-auth) and cached on disk by expo-image.
// Swapping providers (e.g. to a licensed logo API, or fetching each brand's
// own favicon direct) means changing exactly this function.
//
// This fetch only happens once the user has opted in (see logo-consent):
// BrandBadge gates it, so a domain leaves the device only by explicit choice.
// Note the trade-off in one place: the provider sees which brand domains a
// user looks up. Fetching direct from each brand would remove that aggregation
// (each brand sees only its own icon request) at a cost in reliability.

// Tolerate a pasted full URL — reduce to a bare host so the lookup works
// whether the user typed "netflix.com" or "https://www.netflix.com/account".
function hostOf(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

export function logoUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostOf(domain))}&sz=128`;
}

// The explicit expo-image cache key for a brand's logo. Stable per host (not the
// full provider URL), so a cached logo can be looked up by host alone — this is
// what lets an already-downloaded logo keep showing after web logos are turned
// off, without ever re-fetching. BrandBadge sets it on the <Image> AND passes it
// to Image.getCachePathAsync.
export function logoCacheKey(domain: string): string {
  return `logo:${hostOf(domain)}`;
}

// ---------------------------------------------------------------------------
// The logos-OFF disk lookup, memoised for the session. The native cache-path
// probe is async, so a badge that ran it on every mount flashed its monogram
// on every screen change before the logo popped back in. Resolving each host
// ONCE and remembering the answer makes every later mount render the cached
// logo in the same frame — pre-rendered, no blink.

import { Image } from "expo-image";

/** host → local file URI (null = known absent). Session-scoped. */
const resolvedLogos = new Map<string, string | null>();

/** Synchronous answer when this host was already probed this session:
 *  a file:// URI, null (known absent), or undefined (not probed yet). */
export function knownCachedLogo(domain: string): string | null | undefined {
  return resolvedLogos.get(hostOf(domain));
}

/** Probe the disk cache once per host and remember the answer. Never fetches. */
export async function lookupCachedLogo(domain: string): Promise<string | null> {
  const host = hostOf(domain);
  const known = resolvedLogos.get(host);
  if (known !== undefined) return known;
  let uri: string | null;
  try {
    const path = await Image.getCachePathAsync(logoCacheKey(domain));
    // A raw absolute path needs the scheme so expo-image loads it as a file.
    uri = path ? (path.startsWith("/") ? `file://${path}` : path) : null;
  } catch {
    uri = null;
  }
  resolvedLogos.set(host, uri);
  return uri;
}

/** A host's logo just loaded from the network (logos ON): its disk copy now
 *  exists, so a memoised "absent" from an earlier probe is stale — drop it and
 *  let the next OFF-mode ask re-probe. */
export function noteLogoCached(domain: string): void {
  if (resolvedLogos.get(hostOf(domain)) === null) resolvedLogos.delete(hostOf(domain));
}

/** Forget every probed path — after Image.clearDiskCache(), the remembered
 *  file URIs point at deleted files. */
export function forgetCachedLogoLookups(): void {
  resolvedLogos.clear();
}
