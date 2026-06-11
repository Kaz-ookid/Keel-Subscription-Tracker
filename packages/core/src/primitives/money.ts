// Money as a value object: an integer amount in a currency's *minor* unit
// (cents, pence, …) plus the currency itself. Floating-point money is a bug
// waiting to happen (0.1 + 0.2 !== 0.3); storing integer minor units sidesteps
// it entirely. `Money` is self-describing — it always carries its currency —
// so even though v1 locks one currency per account, a later multi-currency
// world needs no shape change here.

import { CURRENCIES, type CurrencyCode } from "../constants/currencies";

export interface Money {
  /** Integer amount in the currency's minor unit. 9.99 EUR → 999. */
  readonly amount: number;
  readonly currency: CurrencyCode;
}

/** Construct `Money` directly from minor units (e.g. a stored value). */
export function money(minorUnits: number, currency: CurrencyCode): Money {
  return { amount: Math.round(minorUnits), currency };
}

/** Construct `Money` from a major-unit amount the user typed (9.99 → 999). */
export function fromMajor(major: number, currency: CurrencyCode): Money {
  const factor = 10 ** CURRENCIES[currency].decimalDigits;
  return { amount: Math.round(major * factor), currency };
}

/** Convert back to major units for display/serialisation (999 → 9.99). */
export function toMajor(value: Money): number {
  const factor = 10 ** CURRENCIES[value.currency].decimalDigits;
  return value.amount / factor;
}

/**
 * Render money for display. Deliberately dependency-free (no `Intl`, whose
 * locale data is unreliable under Hermes) so mobile, web, and the extension
 * all format identically. Symbol-suffixed with a comma decimal separator,
 * matching the EUR-first audience: `{ amount: 999, currency: "EUR" }` → "9,99 €".
 */
export function formatMoney(value: Money): string {
  const info = CURRENCIES[value.currency];
  const major = toMajor(value).toFixed(info.decimalDigits);
  const withComma = major.replace(".", ",");
  return `${withComma} ${info.symbol}`;
}

/** Zero in a given currency — the identity for summing. */
export function zeroMoney(currency: CurrencyCode): Money {
  return { amount: 0, currency };
}

/** Add two same-currency amounts. Throws on a currency mismatch — that would
 *  signal bad data (v1 is one-currency-per-account), so fail loudly. */
export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new TypeError(`Cannot add ${a.currency} to ${b.currency}`);
  }
  return { amount: a.amount + b.amount, currency: a.currency };
}

/** Sum a list of same-currency amounts. `currency` is required so an empty
 *  list still yields a well-typed zero. Throws if any entry differs. */
export function sumMoney(values: readonly Money[], currency: CurrencyCode): Money {
  return values.reduce(addMoney, zeroMoney(currency));
}

/**
 * Sum a mixed-currency list into one total per currency, in first-seen order.
 * Cross-currency totals must stay separate — collapsing them into one number
 * would be a lie. (v1 users are effectively single-currency, so callers
 * usually get a one-element result.)
 */
export function sumByCurrency(values: readonly Money[]): Money[] {
  const totals = new Map<CurrencyCode, Money>();
  for (const value of values) {
    const current = totals.get(value.currency);
    totals.set(value.currency, current ? addMoney(current, value) : value);
  }
  return Array.from(totals.values());
}

/**
 * Split `total` into `n` parts that sum back to it exactly, working in minor
 * units. The remainder is spread one minor unit at a time across the first
 * parts, so €100 / 3 → 33.34, 33.33, 33.33. Used for BNPL installment plans.
 */
export function splitMoney(total: Money, n: number): Money[] {
  if (n < 1) throw new RangeError(`Cannot split money into ${n} parts`);
  const base = Math.floor(total.amount / n);
  const remainder = total.amount - base * n;
  return Array.from({ length: n }, (_, i) => ({
    amount: base + (i < remainder ? 1 : 0),
    currency: total.currency,
  }));
}

// NOTE: subtraction and forecast/budget-smoothing math land with the §7
// calculation work, not here.
