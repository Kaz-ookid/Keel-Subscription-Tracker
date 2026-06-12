// Currency conversion for DISPLAY aggregation. Stored money never converts —
// every amount keeps the currency it was entered in (exact); conversion only
// merges totals into the user's display currency (approximate by definition —
// daily reference rates — but displayed unmarked: see formatTotalsIn). Pure:
// rates are injected, fetching them is the platform's job.

import { CURRENCIES, type CurrencyCode } from "../constants/currencies";
import { formatMoney, formatMoneyList, fromMajor, toMajor, type Money } from "./money";

export interface ExchangeRates {
  /** The reference date of the rates (ISO date from the provider). */
  date: string;
  /** Units of each currency per 1 EUR (ECB convention). EUR itself implied. */
  rates: Partial<Record<CurrencyCode, number>>;
}

function ratePerEur(currency: CurrencyCode, rates: ExchangeRates): number | undefined {
  if (currency === "EUR") return 1;
  const rate = rates.rates[currency];
  return typeof rate === "number" && rate > 0 ? rate : undefined;
}

/**
 * Convert via the EUR cross-rate, rounding into the target's minor units.
 * Returns undefined when a rate is missing — callers fall back to showing the
 * original currency rather than guessing.
 */
export function convertMoney(
  value: Money,
  to: CurrencyCode,
  rates: ExchangeRates,
): Money | undefined {
  if (value.currency === to) return value;
  const from = ratePerEur(value.currency, rates);
  const target = ratePerEur(to, rates);
  if (from === undefined || target === undefined) return undefined;
  return fromMajor((toMajor(value) / from) * target, to);
}

export interface MergedTotal {
  total: Money;
  /** True when any amount was actually converted (kept for callers that care). */
  approximate: boolean;
}

/**
 * Merge per-currency totals into one display amount. Undefined when any
 * needed rate is missing (the caller then shows the honest per-currency list).
 */
export function mergeTotals(
  totals: readonly Money[],
  to: CurrencyCode,
  rates: ExchangeRates,
): MergedTotal | undefined {
  let sum = 0;
  let approximate = false;
  for (const value of totals) {
    const converted = convertMoney(value, to, rates);
    if (converted === undefined) return undefined;
    if (value.currency !== to) approximate = true;
    sum += converted.amount;
  }
  return { total: { amount: sum, currency: to }, approximate };
}

/**
 * The one display rule for big numbers: merged into the display currency
 * (conversion is unmarked — owning commitments in several currencies makes it
 * self-evident, and a marker on every number taxed them all for a rare case);
 * the per-currency list when rates are unavailable.
 */
export function formatTotalsIn(
  totals: readonly Money[],
  to: CurrencyCode,
  rates: ExchangeRates | null,
): string {
  if (totals.length === 0) return formatMoney({ amount: 0, currency: to });
  if (totals.length === 1 && totals[0].currency === to) return formatMoney(totals[0]);
  const merged = rates ? mergeTotals(totals, to, rates) : undefined;
  if (!merged) return formatMoneyList(totals);
  return formatMoney(merged.total);
}

/** Every currency a rates object can serve, for validating fetched payloads. */
export const RATE_CURRENCIES = Object.keys(CURRENCIES) as CurrencyCode[];
