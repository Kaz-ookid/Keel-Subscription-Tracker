// The single place that knows where brand logos come from. We never bundle
// trademarked artwork — a logo is fetched at runtime from the brand's own web
// presence and cached on disk by expo-image. Swapping providers (e.g. to a
// licensed logo API) means changing exactly this function.

export function logoUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}
