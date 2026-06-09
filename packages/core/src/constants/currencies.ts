// The set of currencies the app understands, with the metadata every platform
// needs to display and compute money correctly. Adding a currency is one line.
//
// `decimalDigits` is load-bearing: it's how `Money` converts between major
// units (what the user types, e.g. 9.99) and the integer minor units it
// stores (999). Most currencies use 2; some use 0 (JPY) — never assume 2.

export interface CurrencyInfo {
  /** ISO 4217 code, also the key into `CURRENCIES`. */
  readonly code: string;
  /** Full display name, e.g. "Euro". */
  readonly name: string;
  /** Display symbol, e.g. "€". */
  readonly symbol: string;
  /** Number of minor-unit digits (EUR/USD → 2, JPY → 0). */
  readonly decimalDigits: number;
  /** Flag emoji — the "icon if applicable" for a currency. */
  readonly flag: string;
}

export const CURRENCIES = {
  EUR: { code: "EUR", name: "Euro", symbol: "€", decimalDigits: 2, flag: "🇪🇺" },
  USD: { code: "USD", name: "US Dollar", symbol: "$", decimalDigits: 2, flag: "🇺🇸" },
  GBP: { code: "GBP", name: "British Pound", symbol: "£", decimalDigits: 2, flag: "🇬🇧" },
  CHF: { code: "CHF", name: "Swiss Franc", symbol: "CHF", decimalDigits: 2, flag: "🇨🇭" },
  CAD: { code: "CAD", name: "Canadian Dollar", symbol: "$", decimalDigits: 2, flag: "🇨🇦" },
  AUD: { code: "AUD", name: "Australian Dollar", symbol: "$", decimalDigits: 2, flag: "🇦🇺" },
  JPY: { code: "JPY", name: "Japanese Yen", symbol: "¥", decimalDigits: 0, flag: "🇯🇵" },
} as const satisfies Record<string, CurrencyInfo>;

/** Every supported currency code, derived from `CURRENCIES` — the single
 *  source of truth. Add an entry above and this union widens automatically. */
export type CurrencyCode = keyof typeof CURRENCIES;

/** App-wide default (dogfooded in France first). */
export const DEFAULT_CURRENCY: CurrencyCode = "EUR";

/** Narrowed lookup so callers get a `CurrencyInfo`, not a wide record value. */
export function currencyInfo(code: CurrencyCode): CurrencyInfo {
  return CURRENCIES[code];
}
