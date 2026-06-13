// The single place that knows where brand logos come from. We never bundle
// trademarked artwork — a logo is fetched at runtime from the brand's own web
// presence and cached on disk by expo-image. Swapping providers (e.g. to a
// licensed logo API) means changing exactly this function.

export function logoUrl(domain: string): string {
  // Tolerate a pasted full URL — reduce to a bare host so the lookup works
  // whether the user typed "netflix.com" or "https://www.netflix.com/account".
  const host = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
}
