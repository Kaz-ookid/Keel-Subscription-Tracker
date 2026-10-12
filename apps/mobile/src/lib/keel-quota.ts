// The day's cloud allowance, as far as the app can know it: Apple rations
// Private Cloud Compute per user and the model answers "quota" once the
// limit is reached. The app remembers the day it heard that, and every
// "Keel reads it" door says so up front instead of letting the user pick
// screenshots or type a list for a read that cannot happen. The guard
// lifts at the next local day (the error names no reset time this build
// can read); a read that still fails simply records the day again. Same
// external-store pattern as ai-cloud: one source of truth, live updates.

import { today } from "@keel/core";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

const KEY = "keel.ai.cloud-quota-hit.v1";

let hitOn: string | null = null;
const listeners = new Set<() => void>();

function emit(next: string | null): void {
  hitOn = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let hydrating: Promise<void> | null = null;
export function hydrateQuota(): Promise<void> {
  if (!hydrating) {
    hydrating = AsyncStorage.getItem(KEY)
      .then((raw) => emit(raw))
      .catch(() => emit(null));
  }
  return hydrating;
}

/** The model just answered "quota": remember the day. */
export function recordQuotaHit(): void {
  const day = today();
  emit(day);
  void AsyncStorage.setItem(KEY, day).catch(() => {
    // Best-effort: the in-memory mark already guards this session.
  });
}

/** True while today's allowance is known to be used up. */
export function useQuotaOut(): boolean {
  const day = useSyncExternalStore(subscribe, () => hitOn);
  return day === today();
}
