// Device-level experiment flags (DESIGN.md §3.7 B): the Harbor view ships
// behind a debug toggle until it proves itself on real data. Same pattern as
// the app lock config — AsyncStorage + an in-memory subscriber, never part of
// the backup blob.

import AsyncStorage from "@react-native-async-storage/async-storage";

const HARBOR_KEY = "keel.experiment.harbor.v1";

type Listener = (enabled: boolean) => void;
const listeners = new Set<Listener>();

export async function loadHarborEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(HARBOR_KEY)) === "true";
}

export async function setHarborEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(HARBOR_KEY, String(enabled));
  listeners.forEach((l) => l(enabled));
}

/** Subscribe to toggle flips (Settings flips it, the Payments tab listens). */
export function onHarborChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
