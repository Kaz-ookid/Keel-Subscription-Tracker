// The iCloud backup bridge: the whole persisted blob rides to the app's
// iCloud container as ONE file with a timestamp, last-writer-wins. A BACKUP
// that follows the account, not a sync engine (PROJECT_BRIEF §9): the
// Data screen's switch turns it on and picks a side when a copy already
// exists, app-state uploads after every local save and adopts a newer
// cloud copy at launch (backing the local state up first). Offline, signed
// out or in Expo Go every function quietly reports "unavailable".

import AsyncStorage from "@react-native-async-storage/async-storage";

import { parsePersistedState, type PersistedState } from "./storage";

/** The Settings toggle's key (owned by app/data.tsx until wiring step 3). */
export const ICLOUD_ENABLED_KEY = "keel.icloud.enabled.v1";

/** One file, whole blob, in the app's own (hidden) container space. */
const CLOUD_FILE_PATH = "/keel-backup-v1.json";

/** Device-side memory of the last envelope we uploaded, so launch can tell
 *  "the cloud moved past us" from "the cloud is just our own last write". */
const LAST_UPLOAD_KEY = "keel.icloud.lastUpload.v1";

export interface CloudEnvelope {
  version: 1;
  /** When this state was uploaded (ISO); the whole last-writer-wins clock. */
  savedAt: string;
  state: PersistedState;
}

/** The lazy native door. Structural type only; verify at wiring step 2. */
async function cloud(): Promise<{
  isCloudAvailable(): Promise<boolean>;
  writeFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
  unlink(path: string): Promise<void>;
} | null> {
  try {
    // Lazy so the native module is only touched where it exists.
    const lib = (await import("react-native-cloud-storage")) as {
      CloudStorage: {
        isCloudAvailable(): Promise<boolean>;
        writeFile(path: string, content: string): Promise<void>;
        readFile(path: string): Promise<string>;
        exists(path: string): Promise<boolean>;
        unlink(path: string): Promise<void>;
      };
    };
    return lib.CloudStorage;
  } catch {
    return null; // Expo Go / package missing: iCloud simply stays off.
  }
}

/** True when the device has an iCloud account this app can write to. */
export async function isICloudAvailable(): Promise<boolean> {
  try {
    const store = await cloud();
    return store !== null && (await store.isCloudAvailable());
  } catch {
    return false;
  }
}

/** Stamp and upload the whole state; false when iCloud is unreachable. */
export async function uploadToICloud(state: PersistedState): Promise<boolean> {
  try {
    const store = await cloud();
    if (!store) return false;
    const envelope: CloudEnvelope = {
      version: 1,
      savedAt: new Date().toISOString(),
      state,
    };
    await store.writeFile(CLOUD_FILE_PATH, JSON.stringify(envelope));
    await AsyncStorage.setItem(LAST_UPLOAD_KEY, envelope.savedAt);
    return true;
  } catch {
    return false;
  }
}

/** Remove the cloud copy: the switch going off must be able to take the
 *  data with it, or "delete the app to erase its data" is false. False when
 *  iCloud is unreachable (the copy then stays, and the user is told). */
export async function deleteFromICloud(): Promise<boolean> {
  try {
    const store = await cloud();
    if (!store) return false;
    if (await store.exists(CLOUD_FILE_PATH)) await store.unlink(CLOUD_FILE_PATH);
    await AsyncStorage.removeItem(LAST_UPLOAD_KEY);
    return true;
  } catch {
    return false;
  }
}

/** The cloud copy, validated through the same lenient parser every other
 *  restore path uses; null when absent, unreadable, or not ours. */
export async function downloadFromICloud(): Promise<CloudEnvelope | null> {
  try {
    const store = await cloud();
    if (!store || !(await store.exists(CLOUD_FILE_PATH))) return null;
    const raw = JSON.parse(await store.readFile(CLOUD_FILE_PATH)) as {
      version?: unknown;
      savedAt?: unknown;
      state?: unknown;
    };
    if (raw.version !== 1 || typeof raw.savedAt !== "string") return null;
    const state = parsePersistedState(JSON.stringify(raw.state));
    if (!state) return null;
    return { version: 1, savedAt: raw.savedAt, state };
  } catch {
    return null;
  }
}

/** Last-writer-wins, decided at launch: adopt the cloud copy only when it
 *  is newer than the last envelope THIS device uploaded (a cloud file we
 *  wrote ourselves is not news). Pure decision, easy to reason about:
 *  callers hydrate from the returned state. */
export async function chooseNewerState(
  local: PersistedState,
  remote: CloudEnvelope | null,
): Promise<{ state: PersistedState; adoptedCloud: boolean }> {
  if (!remote) return { state: local, adoptedCloud: false };
  try {
    const lastUpload = (await AsyncStorage.getItem(LAST_UPLOAD_KEY)) ?? "";
    if (remote.savedAt > lastUpload) return { state: remote.state, adoptedCloud: true };
  } catch {
    // Unreadable marker: err on keeping the local state.
  }
  return { state: local, adoptedCloud: false };
}
