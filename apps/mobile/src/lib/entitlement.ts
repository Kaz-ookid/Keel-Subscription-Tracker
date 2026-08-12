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
import { router } from "expo-router";
import { useSyncExternalStore } from "react";
import { Alert, AppState } from "react-native";

import {
  addDays,
  formatCalendarDate,
  today,
  TRIAL_DAYS,
  trialStatus,
  type CalendarDate,
  type TrialState,
} from "@keel/core";

import i18n from "../i18n";
import { clearTrialAnchor, loadTrialAnchor, saveTrialAnchor } from "./trial";

const FULL_KEY = "keel.fullkeel.v1";
/** The retired read meter's key — removed on hydrate so no trace lingers. */
const LEGACY_READS_KEY = "keel.aiReadsUsed.v1";
/** Set once the expiry sheet has been presented, so it never nags twice. */
const LOCK_SHOWN_KEY = "keel.lockshown.v1";
/** The lowest warning threshold already shown (see maybeWarnExpiry). */
const WARN_KEY = "keel.trialwarn.v1";

/** Warn when this few trial days remain. Buckets, not dates: whichever is
 *  the lowest crossed threshold fires ONCE, with the real days-left number
 *  — someone opening the app for the first time at day 6 gets exactly one
 *  popup, not a queue of stale ones. */
const WARN_THRESHOLDS = [15, 7];

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
        void maybeWarnExpiry();
      });
      void maybeWarnExpiry();
    })();
  }
  return hydrating;
}

/** The final-stretch warnings (§7.3 no-surprises): once per threshold
 *  bucket, always with the REAL days-left number, most urgent bucket wins.
 *  Self-guarding via WARN_KEY, so calling it often is free. */
async function maybeWarnExpiry(): Promise<void> {
  if (state.owned || state.state !== "trial") return;
  const crossed = WARN_THRESHOLDS.filter((d) => state.daysLeft <= d).pop();
  if (crossed === undefined) return;
  try {
    const warnedRaw = await AsyncStorage.getItem(WARN_KEY);
    const warned = warnedRaw === null ? Number.POSITIVE_INFINITY : Number(warnedRaw);
    if (warned <= crossed) return;
    await AsyncStorage.setItem(WARN_KEY, String(crossed));
  } catch {
    return; // Can't record it — better silent than nagging every launch.
  }
  Alert.alert(i18n.t("trial.daysLeft", { count: state.daysLeft }), i18n.t("trial.warnBody"), [
    // Red "Close" (destructive style): dismissing reads as walking past the
    // deal, not as completing something.
    { text: i18n.t("common.close"), style: "destructive" },
    { text: i18n.t("fullkeel.cta"), onPress: () => router.push("/fullkeel") },
  ]);
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
  // Day-one honesty, at the exact moment it becomes true (user decision
  // 2026-08-12): one clear popup when the clock actually starts — with the
  // real end date — restating what read-only will and won't mean. This
  // branch runs ONCE per trial ever (the anchor guard above), so it can
  // never nag. Owners skip it: their clock is decorative.
  if (!state.owned) {
    const endsOn = formatCalendarDate(addDays(anchor, TRIAL_DAYS - 1));
    Alert.alert(i18n.t("trial.startedTitle"), i18n.t("trial.startedBody", { date: endsOn }), [
      { text: i18n.t("common.done") },
    ]);
  }
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
    await AsyncStorage.multiRemove([FULL_KEY, LOCK_SHOWN_KEY, WARN_KEY]);
  } catch {
    // Best-effort.
  }
  await clearTrialAnchor();
}

// ---------------------------------------------------------------------------
// Debug clock-benders (the gated drawer only). Earliest-anchor-wins means
// only EARLIER stamps stick — which is exactly what these are; going back
// to "fresh" is debugResetTrialClock's job.

/** Re-stamp the anchor so exactly `daysLeft` trial days remain (0 = expired
 *  now, read-only unless owned). Fires the expiry warning path too, so the
 *  popups can be QA'd without waiting a month. */
export async function debugSetTrialDaysLeft(daysLeft: number): Promise<void> {
  await hydrateEntitlement();
  const anchor = addDays(today(), -(TRIAL_DAYS - daysLeft));
  state = derive(state.owned, anchor, true);
  emit();
  await saveTrialAnchor(anchor);
  void maybeWarnExpiry();
}

/** Back to "fresh" (no anchor, warnings forgotten) WITHOUT touching data —
 *  the QA loop's rewind lever. */
export async function debugResetTrialClock(): Promise<void> {
  await clearTrialAnchor();
  try {
    await AsyncStorage.multiRemove([WARN_KEY, LOCK_SHOWN_KEY]);
  } catch {
    // Best-effort.
  }
  state = derive(state.owned, null, true);
  emit();
}

/** True EXACTLY ONCE when the app is locked and the expiry sheet hasn't been
 *  presented yet — the "clear screen at expiry" without a nag loop. */
export async function shouldPresentLockOnce(): Promise<boolean> {
  await hydrateEntitlement();
  if (!state.locked) return false;
  try {
    if ((await AsyncStorage.getItem(LOCK_SHOWN_KEY)) === "true") return false;
    await AsyncStorage.setItem(LOCK_SHOWN_KEY, "true");
    return true;
  } catch {
    return false;
  }
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
