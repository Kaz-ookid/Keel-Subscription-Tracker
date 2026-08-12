// The Full Keel entitlement (PROJECT_BRIEF §7.3): one gate, and it is time.
// Everything is unlocked for 45 days from the first commitment saved
// ("fresh" until then — an empty Keel has no value to withhold), then the
// app is read-only ("expired") until the one-time purchase flips `owned`.
// The old free-AI-reads meter is retired; its storage key is swept here.
//
// House external-store idiom: module state + listeners + hydrate from the
// root layout. The clock math lives in @keel/core (trial-clock, unit
// tested); the anchor's three-way storage lives in ./trial.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";

import { today, trialStatus, type CalendarDate, type TrialState } from "@keel/core";

import { clearTrialAnchor, loadTrialAnchor, saveTrialAnchor } from "./trial";

const FULL_KEY = "keel.fullkeel.v1";
/** The retired read meter's key — removed on hydrate so no trace lingers. */
const LEGACY_READS_KEY = "keel.aiReadsUsed.v1";

export interface Entitlement {
  hydrated: boolean;
  /** Full Keel purchased (or the debug switch, until launch). */
  owned: boolean;
  anchor: CalendarDate | null;
  state: TrialState;
  /** Whole trial days left, counting today (see core trialStatus). */
  daysLeft: number;
  /** THE gate: trial expired and not owned — the app is read-only. */
  locked: boolean;
}

function derive(owned: boolean, anchor: CalendarDate | null, hydrated: boolean): Entitlement {
  const status = trialStatus(anchor, today());
  return {
    hydrated,
    owned,
    anchor,
    state: status.state,
    daysLeft: status.daysLeft,
    locked: status.state === "expired" && !owned,
  };
}

let state: Entitlement = derive(false, null, false);
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Read ownership + the three-way anchor once, at launch (root layout).
 *  Also re-derives whenever the app returns to the foreground, so a trial
 *  that expires overnight locks without needing a data change. */
let hydrating: Promise<void> | null = null;
export function hydrateEntitlement(): Promise<void> {
  if (!hydrating) {
    hydrating = (async () => {
      try {
        const [owned, anchor] = await Promise.all([
          AsyncStorage.getItem(FULL_KEY),
          loadTrialAnchor(),
        ]);
        state = derive(owned === "true", anchor, true);
      } catch {
        state = { ...state, hydrated: true };
      }
      emit();
      void AsyncStorage.removeItem(LEGACY_READS_KEY).catch(() => {
        // The meter is gone either way.
      });
      AppState.addEventListener("change", (next) => {
        if (next !== "active") return;
        const rederived = derive(state.owned, state.anchor, state.hydrated);
        if (rederived.state !== state.state || rederived.daysLeft !== state.daysLeft) {
          state = rederived;
          emit();
        }
      });
    })();
  }
  return hydrating;
}

/**
 * Start the 45-day clock — called when a commitment is saved (add form, AI
 * import confirm, assistant additions, backup restore) and by the migration
 * for data that predates the trial (items exist, no anchor anywhere: the
 * update grants the full 45 days from that moment). Idempotent: an existing
 * anchor always wins, so calling this often is free.
 */
export async function markTrialStarted(): Promise<void> {
  await hydrateEntitlement();
  if (state.anchor) return;
  const anchor = today();
  state = derive(state.owned, anchor, true);
  emit();
  await saveTrialAnchor(anchor);
}

/** Flip ownership: the purchase/restore success handler, and the debug
 *  switch (the tester escape hatch, gated out of production builds). */
export async function setFullKeel(next: boolean): Promise<void> {
  await hydrateEntitlement();
  state = derive(next, state.anchor, true);
  emit();
  try {
    await AsyncStorage.setItem(FULL_KEY, String(next));
  } catch {
    // Best-effort; the in-memory state already moved.
  }
}

/** Back to the factory state (debug onboarding replay): not owned, no
 *  anchor on ANY leg — the next first commitment starts a fresh trial. */
export async function resetEntitlement(): Promise<void> {
  state = derive(false, null, true);
  emit();
  try {
    await AsyncStorage.removeItem(FULL_KEY);
  } catch {
    // Best-effort.
  }
  await clearTrialAnchor();
}

/** The current snapshot for non-React call sites (reminder sync, widgets). */
export function entitlementSnapshot(): Entitlement {
  return state;
}

/** Change signal for non-React consumers (same contract as subscribe). */
export function onEntitlementChange(listener: () => void): () => void {
  return subscribe(listener);
}

/** Live entitlement for screens: re-renders on purchase, expiry, hydrate. */
export function useEntitlement(): Entitlement {
  return useSyncExternalStore(subscribe, () => state);
}
