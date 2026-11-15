// First-run flags: whether the first-launch tour has been shown, and whether
// the one-time cards it puts on offer are still up (Payments' lock card,
// Settings' "Discover Keel"). Device-level (their own keys, like the theme
// preference), deliberately NOT part of the data blob: restoring a backup on
// a new phone shouldn't replay the tour.

import AsyncStorage from "@react-native-async-storage/async-storage";

const SEEN_KEY = "keel.onboarding-seen.v1";
const NUDGE_KEYS = { lock: "keel.lock-nudge.v1", tour: "keel.tour-nudge.v1" } as const;
export type Nudge = keyof typeof NUDGE_KEYS;

export async function wasOnboardingSeen(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SEEN_KEY)) === "yes";
  } catch {
    return true; // fail closed: never trap a user in onboarding
  }
}

/** Finishing the tour for the FIRST time also puts the cards on offer.
 *  Someone who set Keel up before a card existed never has its flag, so an
 *  update cannot start nagging them. */
export async function markOnboardingSeen(): Promise<void> {
  try {
    const first = (await AsyncStorage.getItem(SEEN_KEY)) !== "yes";
    await AsyncStorage.setItem(SEEN_KEY, "yes");
    if (first) {
      await AsyncStorage.multiSet(Object.values(NUDGE_KEYS).map((key) => [key, "pending"]));
    }
  } catch {
    // best-effort
  }
}

/** A card shows once: dismissing it or doing what it offers retires it for
 *  good. */
export async function isNudgePending(nudge: Nudge): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(NUDGE_KEYS[nudge])) === "pending";
  } catch {
    return false; // fail closed: never nag
  }
}

export async function markNudgeDone(nudge: Nudge): Promise<void> {
  try {
    await AsyncStorage.setItem(NUDGE_KEYS[nudge], "done");
  } catch {
    // best-effort
  }
}

/** Debug: forget the tour was ever shown and the cards offered, so
 *  first-launch can be replayed. */
export async function resetOnboardingSeen(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([SEEN_KEY, ...Object.values(NUDGE_KEYS)]);
  } catch {
    // best-effort
  }
}
