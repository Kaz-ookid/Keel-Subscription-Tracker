// Exchange-rate plumbing: fetch the ECB daily reference rates (via the free,
// keyless Frankfurter API) and cache them on-device. The app always works
// offline with the last known rates — display conversion is approximate by
// design, so yesterday's reference rate is fine; NO rates at all just means
// totals fall back to their honest per-currency lists.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { RATE_CURRENCIES, type CurrencyCode, type ExchangeRates } from "@keel/core";

const STORAGE_KEY = "keel.exchange-rates.v1";
const ENDPOINT = "https://api.frankfurter.dev/v1/latest?base=EUR";

function parseRates(payload: unknown): ExchangeRates | null {
  if (typeof payload !== "object" || payload === null) return null;
  const data = payload as { date?: unknown; rates?: unknown };
  if (typeof data.date !== "string" || typeof data.rates !== "object" || data.rates === null) {
    return null;
  }
  const all = data.rates as Record<string, unknown>;
  const rates: Partial<Record<CurrencyCode, number>> = {};
  for (const code of RATE_CURRENCIES) {
    const value = all[code];
    if (typeof value === "number" && value > 0) rates[code] = value;
  }
  // EUR is the base (implied 1); anything else missing simply won't merge.
  return { date: data.date, rates };
}

export async function loadCachedRates(): Promise<ExchangeRates | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? parseRates(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Fetch today's reference rates; cache and return them, or null on failure. */
export async function fetchRates(): Promise<ExchangeRates | null> {
  try {
    const response = await fetch(ENDPOINT);
    if (!response.ok) return null;
    const rates = parseRates(await response.json());
    if (rates) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(rates));
    return rates;
  } catch {
    return null;
  }
}
