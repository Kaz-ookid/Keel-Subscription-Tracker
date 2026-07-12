// The Full Keel entitlement and the free AI-read meter. Device-stored like
// the other flags; when StoreKit gets wired (dev-build era, see BACKLOG),
// the purchase/restore flow simply calls setFullKeel(true) and everything
// downstream already works. Reads only count when they SUCCEED (a read that
// lands at least one item on the review screen), so failed parses never
// burn one.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

import { FREE_AI_READS } from "../constants";

const FULL_KEY = "keel.fullkeel.v1";
const READS_KEY = "keel.aiReadsUsed.v1";

export interface Entitlement {
  loaded: boolean;
  full: boolean;
  readsUsed: number;
}

let state: Entitlement = { loaded: false, full: false, readsUsed: 0 };
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  void ensureLoaded();
  return () => {
    listeners.delete(listener);
  };
}

async function ensureLoaded(): Promise<void> {
  if (state.loaded) return;
  loading ??= (async () => {
    try {
      const [full, reads] = await AsyncStorage.multiGet([FULL_KEY, READS_KEY]);
      state = {
        loaded: true,
        full: full[1] === "true",
        readsUsed: Number(reads[1]) || 0,
      };
    } catch {
      state = { ...state, loaded: true };
    }
    notify();
  })();
  await loading;
}

/** Free reads remaining; irrelevant (and huge) once Full Keel is owned. */
export function aiReadsLeft(snapshot: Entitlement = state): number {
  return snapshot.full ? Number.POSITIVE_INFINITY : Math.max(0, FREE_AI_READS - snapshot.readsUsed);
}

/** Burn one free read (no-op for Full Keel owners). Call on SUCCESS only. */
export async function consumeAiRead(): Promise<void> {
  await ensureLoaded();
  if (state.full) return;
  state = { ...state, readsUsed: state.readsUsed + 1 };
  notify();
  try {
    await AsyncStorage.setItem(READS_KEY, String(state.readsUsed));
  } catch {
    // Best-effort; the in-memory state already moved.
  }
}

/** Flip ownership: the future purchase/restore success handler, and the
 *  debug switch until then. */
export async function setFullKeel(next: boolean): Promise<void> {
  await ensureLoaded();
  state = { ...state, full: next };
  notify();
  try {
    await AsyncStorage.setItem(FULL_KEY, String(next));
  } catch {
    // Best-effort.
  }
}

/** Live entitlement for screens: re-renders on purchase and on spent reads. */
export function useEntitlement(): Entitlement & { readsLeft: number } {
  const snapshot = useSyncExternalStore(subscribe, () => state);
  return { ...snapshot, readsLeft: aiReadsLeft(snapshot) };
}
