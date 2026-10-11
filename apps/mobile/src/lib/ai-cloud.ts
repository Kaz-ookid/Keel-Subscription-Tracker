// Consent for "Keel reads it for you": the one switch that lets the app send
// text to Apple's Private Cloud Compute model. OFF until the user turns it on
// (the privacy policy promised an option you turn on, so the default honors
// it); the import screen asks in place the first time, Settings keeps the
// switch. Device-scoped (its own key, like the app lock and the AI hard
// switch), so restoring a backup never flips it. Same external-store pattern
// as ai-visibility: one source of truth, live updates.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

const KEY = "keel.ai.cloud-consent.v1";

let consented = false;
const listeners = new Set<() => void>();

function emit(next: boolean): void {
  consented = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let hydrating: Promise<void> | null = null;
export function hydrateAiCloud(): Promise<void> {
  if (!hydrating) {
    hydrating = AsyncStorage.getItem(KEY)
      .then((raw) => emit(raw === "1"))
      .catch(() => emit(false));
  }
  return hydrating;
}

/** Grant or withdraw consent; persists and updates every AI surface live. */
export function setAiCloudConsent(next: boolean): void {
  emit(next);
  void AsyncStorage.setItem(KEY, next ? "1" : "0").catch(() => {
    // Best-effort: the in-memory choice already took effect this session.
  });
}

export function useAiCloudConsent(): boolean {
  return useSyncExternalStore(subscribe, () => consented);
}

/** Non-hook read, for call sites that only dispatch. */
export function aiCloudConsentSnapshot(): boolean {
  return consented;
}
