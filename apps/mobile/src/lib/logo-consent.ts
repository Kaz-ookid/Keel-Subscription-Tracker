// First-run consent for loading brand logos from the web. A logo is the ONE
// thing the app would fetch that is derived from what the user tracks (the
// brand's domain), so it stays OFF until the user says yes: until then every
// badge shows its offline monogram and nothing about the user's commitments
// leaves the phone. Device-scoped (its own key, like the app lock) — kept OUT
// of the backup blob, so restoring a backup never flips a new phone's choice.
//
// Exposed as an external store (useSyncExternalStore): one source of truth that
// every BrandBadge and the Settings row read live, so a toggle re-renders the
// whole app at once. The badge default (offline) is already the safe state, so
// nothing blocks on hydration.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

const KEY = "keel.logos.consent.v1";

export type LogoConsentStatus = "unset" | "on" | "off";

export interface LogoConsent {
  /** "unset" until the user has chosen — the prompt shows once in that state. */
  status: LogoConsentStatus;
  /** False until the stored choice has been read from disk (so the prompt does
   *  not flash before we know an earlier choice). */
  hydrated: boolean;
}

let snapshot: LogoConsent = { status: "unset", hydrated: false };
const listeners = new Set<() => void>();

function emit(next: LogoConsent): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): LogoConsent {
  return snapshot;
}

// Read the stored choice once, at startup. The offline default already renders
// safely, so this is fire-and-forget.
let hydrating: Promise<void> | null = null;
export function hydrateLogoConsent(): Promise<void> {
  if (!hydrating) {
    hydrating = AsyncStorage.getItem(KEY)
      .then((raw) => {
        const status: LogoConsentStatus = raw === "on" ? "on" : raw === "off" ? "off" : "unset";
        emit({ status, hydrated: true });
      })
      .catch(() => emit({ status: "unset", hydrated: true }));
  }
  return hydrating;
}

/** Back to "never asked" — the debug onboarding replay uses this so a fresh
 *  run asks the logo question again, like a real first launch. */
export function resetLogoConsent(): void {
  emit({ status: "unset", hydrated: true });
  void AsyncStorage.removeItem(KEY).catch(() => {
    // Best-effort, like every write here.
  });
}

/** Record the user's choice; persists and updates every badge live. */
export function setLogoConsent(on: boolean): void {
  emit({ status: on ? "on" : "off", hydrated: true });
  void AsyncStorage.setItem(KEY, on ? "on" : "off").catch(() => {
    // Best-effort: the in-memory choice already took effect for this session.
  });
}

/** Subscribe a component to the full consent state (status + hydrated). */
export function useLogoConsent(): LogoConsent {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** True only when the user has opted in — the one gate badges fetch behind. */
export function useLogosEnabled(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot).status === "on";
}
