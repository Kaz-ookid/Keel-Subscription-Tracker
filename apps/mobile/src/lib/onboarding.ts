// Whether the first-launch tour has been shown — a device-level flag (its
// own key, like the theme preference), deliberately NOT part of the data
// blob: restoring a backup on a new phone shouldn't replay the tour.

import AsyncStorage from "@react-native-async-storage/async-storage";

const SEEN_KEY = "keel.onboarding-seen.v1";

export async function wasOnboardingSeen(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SEEN_KEY)) === "yes";
  } catch {
    return true; // fail closed: never trap a user in onboarding
  }
}

export async function markOnboardingSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(SEEN_KEY, "yes");
  } catch {
    // best-effort
  }
}
