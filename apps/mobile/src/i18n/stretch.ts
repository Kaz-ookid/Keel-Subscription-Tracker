// "Stretched English", the debug pseudo-language: every string about 40%
// longer, the length a wordy translation reaches, so a layout that only
// holds in English shows up before a real language breaks it. The filler is
// short words so it wraps like real text; it is only ever APPENDED, which
// leaves every {{placeholder}} as it was. Pure, so locales.test.ts covers it.

const FILLER = "lorem ipsum dolor sit amet sed do ut labore et magna aliqua ";

/** A copy of a locale tree with every string stretched. */
export function stretchLocale<T>(node: T): T {
  if (typeof node === "string") {
    if (node === "") return node;
    const extra = Math.max(2, Math.ceil(node.length * 0.4));
    const filler = FILLER.repeat(Math.ceil(extra / FILLER.length)).slice(0, extra - 1);
    return `${node} ${filler.trimEnd()}` as T;
  }
  if (Array.isArray(node)) return node.map(stretchLocale) as T;
  if (node !== null && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => [key, stretchLocale(value)]),
    ) as T;
  }
  return node;
}
