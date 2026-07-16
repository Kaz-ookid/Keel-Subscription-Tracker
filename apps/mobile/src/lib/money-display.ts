// Turn a single Money into a plain number in the display currency — the shared
// glue behind price ordering and any chart sizing that must compare amounts
// across currencies. Same-currency is exact; otherwise it merges through the
// cached rates, and falls back to the raw amount when no rate is available (an
// honest approximation, never a throw). Display-only: the stored Money keeps
// its own currency.

import { mergeTotals, type CurrencyCode, type ExchangeRates, type Money } from "@keel/core";

export function amountInDisplay(
  value: Money,
  displayCurrency: CurrencyCode,
  rates: ExchangeRates | null,
): number {
  if (value.currency === displayCurrency) return value.amount;
  if (rates) {
    const merged = mergeTotals([value], displayCurrency, rates);
    if (merged) return merged.total.amount;
  }
  return value.amount;
}

/** A LIST of per-currency totals as one display-currency number, for chart
 *  scales and sort keys. Different fallback from the single-value helper: with
 *  no usable rates it counts only what is already in the display currency
 *  (summing raw cross-currency amounts would chart a lie). */
export function totalInDisplay(
  values: Money[],
  displayCurrency: CurrencyCode,
  rates: ExchangeRates | null,
): number {
  if (rates) {
    const merged = mergeTotals(values, displayCurrency, rates);
    if (merged) return merged.total.amount;
  }
  return values.find((v) => v.currency === displayCurrency)?.amount ?? 0;
}
