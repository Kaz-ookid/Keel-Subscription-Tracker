// Local-first persistence for the MVP: items + the payment-event ledger as one
// JSON blob in the device's AsyncStorage. PaymentItem/PaymentOccurrence are
// plain data (branded strings and Money serialise as-is), so no custom
// (de)serialisation is needed. This is the only place that knows about storage —
// swapping to SQLite later changes just this file.

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_CURRENCY,
  CURRENCIES,
  type Account,
  type Category,
  type CurrencyCode,
  type PaymentItem,
  type PaymentOccurrence,
} from "@keel/core";

const STORAGE_KEY = "keel.subscriptions.v1";

export interface PersistedState {
  items: PaymentItem[];
  /** Append-only ledger of actual payment events — the basis for analytics. */
  occurrences: PaymentOccurrence[];
  /** User-created categories (built-in DEFAULT_CATEGORIES are not stored). */
  categories: Category[];
  /** Bank accounts/cards payments are assigned to (archived ones included). */
  accounts: Account[];
  /** Big numbers merge into this currency for display. */
  displayCurrency: CurrencyCode;
}

const EMPTY: PersistedState = {
  items: [],
  occurrences: [],
  categories: [],
  accounts: [],
  displayCurrency: DEFAULT_CURRENCY,
};

/** Lenient parse of a persisted blob (storage or an imported backup file).
 *  Null when the JSON doesn't even resemble our shape. */
export function parsePersistedState(raw: string): PersistedState | null {
  try {
    const parsed = JSON.parse(raw);
    // Back-compat: an earlier build stored a bare PaymentItem[] array.
    if (Array.isArray(parsed)) {
      return { ...EMPTY, items: parsed as PaymentItem[] };
    }
    if (typeof parsed !== "object" || parsed === null) return null;
    if (!Array.isArray(parsed.items)) return null;
    return {
      items: parsed.items,
      occurrences: Array.isArray(parsed.occurrences) ? parsed.occurrences : [],
      categories: Array.isArray(parsed.categories) ? parsed.categories : [],
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      displayCurrency:
        typeof parsed.displayCurrency === "string" && parsed.displayCurrency in CURRENCIES
          ? (parsed.displayCurrency as CurrencyCode)
          : DEFAULT_CURRENCY,
    };
  } catch {
    return null;
  }
}

export async function loadState(): Promise<PersistedState> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return EMPTY;
  // Corrupt blob — start clean rather than crash the app on launch.
  return parsePersistedState(raw) ?? EMPTY;
}

export async function saveState(state: PersistedState): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
