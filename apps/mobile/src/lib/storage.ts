// Local-first persistence for the MVP: items + the payment-event ledger as one
// JSON blob in the device's AsyncStorage. PaymentItem/PaymentOccurrence are
// plain data (branded strings and Money serialise as-is), so no custom
// (de)serialisation is needed. This is the only place that knows about storage —
// swapping to SQLite later changes just this file.

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_CURRENCY,
  CURRENCIES,
  filterValid,
  isValidAccount,
  isValidCategory,
  isValidPaymentItem,
  isValidPaymentOccurrence,
  isValidSuggestedCommitment,
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

/** Lenient about the ENVELOPE, strict about the ENTRIES: the blob may be an
 *  older shape with fields missing, but each record inside must pass core's
 *  structural guards or it is dropped and counted — one corrupt entry costs
 *  one entry, never a crash in the calculations later. Null when the value
 *  doesn't even resemble a PersistedState. */
function coercePersistedState(parsed: unknown): { state: PersistedState; dropped: number } | null {
  // Back-compat: an earlier build stored a bare PaymentItem[] array.
  const blob: Record<string, unknown> = Array.isArray(parsed)
    ? { items: parsed }
    : typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  if (!Array.isArray(blob.items)) return null;
  const items = filterValid(blob.items, isValidPaymentItem);
  const occurrences = filterValid(
    Array.isArray(blob.occurrences) ? blob.occurrences : [],
    isValidPaymentOccurrence,
  );
  const categories = filterValid(
    Array.isArray(blob.categories) ? blob.categories : [],
    isValidCategory,
  );
  const accounts = filterValid(Array.isArray(blob.accounts) ? blob.accounts : [], isValidAccount);
  const pending = filterValid(
    Array.isArray(blob.pending) ? blob.pending : [],
    isValidSuggestedCommitment,
  );
  return {
    state: {
      items: items.kept,
      occurrences: occurrences.kept,
      categories: categories.kept,
      accounts: accounts.kept,
      displayCurrency:
        typeof blob.displayCurrency === "string" && blob.displayCurrency in CURRENCIES
          ? (blob.displayCurrency as CurrencyCode)
          : DEFAULT_CURRENCY,
      pending: pending.kept,
    },
    dropped:
      items.dropped + occurrences.dropped + categories.dropped + accounts.dropped + pending.dropped,
  };
}

/** Parse of a persisted blob (storage or an imported backup file), with the
 *  count of entries the guards had to drop. Null when the JSON doesn't even
 *  resemble our shape. */
export function parsePersistedStateDetailed(
  raw: string,
): { state: PersistedState; dropped: number } | null {
  try {
    return coercePersistedState(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** The state-only convenience used by launch and backup listings. */
export function parsePersistedState(raw: string): PersistedState | null {
  return parsePersistedStateDetailed(raw)?.state ?? null;
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
    const coerced = coercePersistedState(parsed.state);
    if (!coerced || typeof parsed.savedAt !== "string") return null;
    return { savedAt: parsed.savedAt, state: coerced.state };
  } catch {
    return null;
  }
}
