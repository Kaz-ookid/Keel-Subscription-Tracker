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
  type SuggestedCommitment,
} from "@keel/core";

const STORAGE_KEY = "keel.subscriptions.v1";
const SNAPSHOT_KEY = "keel.snapshot.v1";

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
  /** The "To complete" list: suggestions the user said they have but
   *  hasn't filled in yet. */
  pending: SuggestedCommitment[];
}

const EMPTY: PersistedState = {
  items: [],
  occurrences: [],
  categories: [],
  accounts: [],
  displayCurrency: DEFAULT_CURRENCY,
  pending: [],
};

/** Lenient coercion of an already-parsed value into our shape.
 *  Null when it doesn't even resemble a PersistedState. */
function coercePersistedState(parsed: unknown): PersistedState | null {
  // Back-compat: an earlier build stored a bare PaymentItem[] array.
  if (Array.isArray(parsed)) {
    return { ...EMPTY, items: parsed as PaymentItem[] };
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const blob = parsed as Record<string, unknown>;
  if (!Array.isArray(blob.items)) return null;
  return {
    items: blob.items,
    occurrences: Array.isArray(blob.occurrences) ? blob.occurrences : [],
    categories: Array.isArray(blob.categories) ? blob.categories : [],
    accounts: Array.isArray(blob.accounts) ? blob.accounts : [],
    displayCurrency:
      typeof blob.displayCurrency === "string" && blob.displayCurrency in CURRENCIES
        ? (blob.displayCurrency as CurrencyCode)
        : DEFAULT_CURRENCY,
    pending: Array.isArray(blob.pending) ? blob.pending : [],
  };
}

/** Lenient parse of a persisted blob (storage or an imported backup file).
 *  Null when the JSON doesn't even resemble our shape. */
export function parsePersistedState(raw: string): PersistedState | null {
  try {
    return coercePersistedState(JSON.parse(raw));
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

/** A stashed copy of the user's data, so debug actions (demo data, clear all)
 *  can be undone. One slot: saving again overwrites the previous snapshot. */
export interface Snapshot {
  /** ISO timestamp of when the snapshot was taken. */
  savedAt: string;
  state: PersistedState;
}

export async function saveSnapshot(state: PersistedState): Promise<string> {
  const savedAt = new Date().toISOString();
  await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ savedAt, state }));
  return savedAt;
}

export async function loadSnapshot(): Promise<Snapshot | null> {
  const raw = await AsyncStorage.getItem(SNAPSHOT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed !== "object" || parsed === null) return null;
    const state = coercePersistedState(parsed.state);
    if (!state || typeof parsed.savedAt !== "string") return null;
    return { savedAt: parsed.savedAt, state };
  } catch {
    return null;
  }
}
