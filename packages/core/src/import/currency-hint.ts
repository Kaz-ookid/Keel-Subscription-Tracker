// What currency the raw material itself shows. A model that omits the
// currency (a lone "$" is ambiguous to it) used to inherit the DISPLAY
// currency as the parser's default, which turned a $108.10 receipt into
// €108.10 (dogfood 2026-10-11). The hint is deterministic and conservative:
// it answers only when the text shows exactly one currency; two or more
// (a multi-currency statement) or none leave the default untouched.

import { CURRENCIES, type CurrencyCode } from "../constants/currencies";

// Symbols that name one currency unambiguously. "kr" (SEK/NOK/DKK) and the
// bare yen/yuan sign are left to the model; a plain "$" counts as USD, the
// prefixed forms as their own currency.
const SYMBOLS: readonly [RegExp, CurrencyCode][] = [
  [/€/u, "EUR"],
  [/£/u, "GBP"],
  [/\bFr\.?\s?\d/u, "CHF"],
  [/zł/u, "PLN"],
  [/₹/u, "INR"],
  [/₺/u, "TRY"],
  [/Kč/u, "CZK"],
  [/\bFt\b/u, "HUF"],
  [/\blei\b/u, "RON"],
  [/R\$/u, "BRL"],
  [/\b(?:CA|C)\$/u, "CAD"],
  [/\bA\$/u, "AUD"],
  [/\bMX\$/u, "MXN"],
  // A "$" not preceded by a letter (so CA$, A$, MX$, R$ don't double-count).
  [/(?<![A-Za-z])\$/u, "USD"],
];

/** The one currency the text shows, or null when it shows none or several. */
export function detectCurrencyHint(text: string): CurrencyCode | null {
  const found = new Set<CurrencyCode>();
  for (const code of Object.keys(CURRENCIES) as CurrencyCode[]) {
    if (new RegExp(`\\b${code}\\b`).test(text)) found.add(code);
  }
  for (const [pattern, code] of SYMBOLS) {
    if (pattern.test(text)) found.add(code);
  }
  return found.size === 1 ? [...found][0] : null;
}
