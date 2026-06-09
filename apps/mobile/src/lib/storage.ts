// Local-first persistence for the MVP: items + the payment-event ledger as one
// JSON blob in the device's AsyncStorage. PaymentItem/PaymentOccurrence are
// plain data (branded strings and Money serialise as-is), so no custom
// (de)serialisation is needed. This is the only place that knows about storage —
// swapping to SQLite later changes just this file.

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Category, PaymentItem, PaymentOccurrence } from "@keel/core";

const STORAGE_KEY = "keel.subscriptions.v1";

export interface PersistedState {
  items: PaymentItem[];
  /** Append-only ledger of actual payment events — the basis for analytics. */
  occurrences: PaymentOccurrence[];
  /** User-created categories (built-in DEFAULT_CATEGORIES are not stored). */
  categories: Category[];
}

const EMPTY: PersistedState = { items: [], occurrences: [], categories: [] };

export async function loadState(): Promise<PersistedState> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw);
    // Back-compat: an earlier build stored a bare PaymentItem[] array.
    if (Array.isArray(parsed)) {
      return { items: parsed as PaymentItem[], occurrences: [], categories: [] };
    }
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      occurrences: Array.isArray(parsed.occurrences) ? parsed.occurrences : [],
      categories: Array.isArray(parsed.categories) ? parsed.categories : [],
    };
  } catch {
    // Corrupt blob — start clean rather than crash the app on launch.
    return EMPTY;
  }
}

export async function saveState(state: PersistedState): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
