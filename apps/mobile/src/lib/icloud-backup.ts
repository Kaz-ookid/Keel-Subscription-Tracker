// The iCloud backup bridge — DORMANT until the dev-build era (nothing
// imports this file yet; Expo Go has no iCloud entitlement, so every
// function below quietly reports "unavailable" there).
//
// Scope, deliberately small (BACKLOG "Dev-build era unlocks" #1): the whole
// persisted blob rides to the app's iCloud container as ONE file with a
// timestamp, last-writer-wins. This is a BACKUP that follows the account,
// not a sync engine; true multi-device merge stays a later project
// (PROJECT_BRIEF §9). The Settings switch already stores the preference
// (keel.icloud.enabled.v1 in app/data.tsx) and its footnote already
// promises exactly this.
//
// WIRING (dev-build era):
//   1. npx expo install react-native-cloud-storage; add the iCloud
//      entitlements to app.json ios.entitlements:
//        "com.apple.developer.icloud-container-identifiers":
//          ["iCloud.ch.keelapp.keel"],
//        "com.apple.developer.icloud-services": ["CloudDocuments"],
//        "com.apple.developer.ubiquity-container-identifiers":
//          ["iCloud.ch.keelapp.keel"]
//      and register the container in the Apple Developer portal.
//   2. Delete the @ts-expect-error below once the package exists, and check
//      the structural type against the installed version's API (written
//      blind, like the widget bridge was).
//   3. app/data.tsx: move ICLOUD_KEY here (export below), and on toggle-ON
//      call uploadToICloud(exportData()) so the first backup exists
//      immediately; surface isICloudAvailable() === false as a footnote
//      ("sign in to iCloud on this iPhone").
//   4. src/state/app-state.tsx: in the hydration effect, when the
//      preference is on, call chooseNewerState(local, await
//      downloadFromICloud()) and hydrate from the winner; in the persist
//      effect, after saveState(...), fire-and-forget uploadToICloud(state)
//      (it stamps savedAt itself).
//   5. On-device QA: two devices on one Apple ID; edit on A, relaunch B
//      (B adopts A's state); edit both while offline, relaunch (newest
//      write wins and the loser's changes are gone: that is last-writer-
//      wins, and the local daily backups remain the safety net).

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
} | null> {
  try {
    // Lazy so the native module is only touched where it exists.
    const lib = (await import("react-native-cloud-storage")) as {
      CloudStorage: {
        isCloudAvailable(): Promise<boolean>;
        writeFile(path: string, content: string): Promise<void>;
        readFile(path: string): Promise<string>;
        exists(path: string): Promise<boolean>;
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
