// WHERE the trial anchor lives (PROJECT_BRIEF §7.3): the start date is
// written to THREE places and the earliest one found wins, then is written
// back to any leg that was missing — so deleting the app (keychain
// survives) or moving to a new iPhone (iCloud KVS follows the Apple ID)
// never restarts the clock. AsyncStorage is the fast local leg and the only
// one guaranteed to exist: on Expo Go or an older dev client the other two
// probes stay quiet no-ops, exactly like the other optional natives.
//
// This module is storage I/O only; the entitlement store (entitlement.ts)
// owns the state machine and derives trial/locked from what's read here.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { requireOptionalNativeModule } from "expo-modules-core";

import { earliestAnchor, type CalendarDate } from "@keel/core";

const KEY = "keel.trialstart.v1";

// ---------------------------------------------------------------------------
// Leg 1 — keychain (expo-secure-store). Survives app deletion on-device.
// The dynamic import throws where the native half is absent; that means
// "this binary can't help", never an error.

type SecureStoreModule = typeof import("expo-secure-store");
async function secureStore(): Promise<SecureStoreModule | null> {
  try {
    return await import("expo-secure-store");
  } catch {
    return null;
  }
}

async function readKeychain(): Promise<string | null> {
  const store = await secureStore();
  if (!store) return null;
  try {
    return await store.getItemAsync(KEY);
  } catch {
    return null;
  }
}

async function writeKeychain(value: string | null): Promise<void> {
  const store = await secureStore();
  if (!store) return;
  try {
    if (value === null) await store.deleteItemAsync(KEY);
    else await store.setItemAsync(KEY, value, { keychainAccessible: store.AFTER_FIRST_UNLOCK });
  } catch {
    // Best-effort: the AsyncStorage leg still holds the anchor.
  }
}

// ---------------------------------------------------------------------------
// Leg 2 — iCloud key-value store (the vendored KeelTrialAnchor module).
// Follows the Apple ID across devices. Optional probe: silent on binaries
// without the module (dominant-color precedent).

interface TrialAnchorNative {
  getString(key: string): string | null;
  setString(key: string, value: string): void;
  removeString(key: string): void;
}

let kvs: TrialAnchorNative | null | undefined;
function kvStore(): TrialAnchorNative | null {
  if (kvs === undefined) kvs = requireOptionalNativeModule<TrialAnchorNative>("KeelTrialAnchor");
  return kvs;
}

function readCloud(): string | null {
  try {
    return kvStore()?.getString(KEY) ?? null;
  } catch {
    return null;
  }
}

function writeCloud(value: string | null): void {
  try {
    if (value === null) kvStore()?.removeString(KEY);
    else kvStore()?.setString(KEY, value);
  } catch {
    // Best-effort.
  }
}

// ---------------------------------------------------------------------------
// Leg 3 — AsyncStorage, the fast local path.

async function readLocal(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY);
  } catch {
    return null;
  }
}

async function writeLocal(value: string | null): Promise<void> {
  try {
    if (value === null) await AsyncStorage.removeItem(KEY);
    else await AsyncStorage.setItem(KEY, value);
  } catch {
    // Best-effort.
  }
}

// ---------------------------------------------------------------------------

/** Read all three legs, take the EARLIEST valid date, and heal any leg that
 *  disagreed (missing after a reinstall, or later after clock games). */
export async function loadTrialAnchor(): Promise<CalendarDate | null> {
  const [local, keychain] = await Promise.all([readLocal(), readKeychain()]);
  const cloud = readCloud();
  const anchor = earliestAnchor([local, keychain, cloud]);
  if (anchor) {
    if (local !== anchor) void writeLocal(anchor);
    if (keychain !== anchor) void writeKeychain(anchor);
    if (cloud !== anchor) writeCloud(anchor);
  }
  return anchor;
}

/** Stamp the anchor into all three legs. */
export async function saveTrialAnchor(anchor: CalendarDate): Promise<void> {
  writeCloud(anchor);
  await Promise.all([writeLocal(anchor), writeKeychain(anchor)]);
}

/** Forget the anchor everywhere — the debug replay's factory reset. A real
 *  user never reaches this; it exists so testers can relive the first run. */
export async function clearTrialAnchor(): Promise<void> {
  writeCloud(null);
  await Promise.all([writeLocal(null), writeKeychain(null)]);
}
