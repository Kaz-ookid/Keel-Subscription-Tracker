// First-run flags: whether the first-launch tour has been shown, and whether
// the Payments screen's one-time lock card is still on offer. Device-level
// (their own keys, like the theme preference), deliberately NOT part of the
// data blob: restoring a backup on a new phone shouldn't replay the tour.

import AsyncStorage from "@react-native-async-storage/async-storage";

const SEEN_KEY = "keel.onboarding-seen.v1";
const LOCK_NUDGE_KEY = "keel.lock-nudge.v1";

export async function wasOnboardingSeen(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SEEN_KEY)) === "yes";
  } catch {
    return true; // fail closed: never trap a user in onboarding
  }
}

/** Finishing the tour for the FIRST time also puts the lock card on offer.
 *  Someone who set Keel up before the card existed never has the flag, so
 *  an update cannot start nagging them. */
export async function markOnboardingSeen(): Promise<void> {
  try {
    const first = (await AsyncStorage.getItem(SEEN_KEY)) !== "yes";
    await AsyncStorage.setItem(SEEN_KEY, "yes");
    if (first) await AsyncStorage.setItem(LOCK_NUDGE_KEY, "pending");
  } catch {
    // best-effort
  }
}

/** The lock card on Payments shows once: dismissing it or turning the lock
 *  on (there or in Settings) retires it for good. */
export async function isLockNudgePending(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(LOCK_NUDGE_KEY)) === "pending";
  } catch {
    return false; // fail closed: never nag
  }
}

export async function markLockNudgeDone(): Promise<void> {
  try {
    await AsyncStorage.setItem(LOCK_NUDGE_KEY, "done");
  } catch {
    // best-effort
  }
}

/** Debug: forget the tour was ever shown and the lock card offered, so
 *  first-launch can be replayed. */
export async function resetOnboardingSeen(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([SEEN_KEY, LOCK_NUDGE_KEY]);
  } catch {
    // best-effort
  }
}
