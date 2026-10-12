// The app lock's storage and biometric plumbing. Device-level settings (own
// keys, like the onboarding flag), deliberately NOT part of the backup blob:
// a restored backup must never lock a new phone with someone else's setting.
// The lock itself defers entirely to the OS (Face ID / Touch ID with the
// device passcode as fallback) — nothing to remember, nothing stored by us.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import { useSyncExternalStore } from "react";

const ENABLED_KEY = "keel.applock.enabled.v1";
const GRACE_KEY = "keel.applock.grace.v1";

export interface AppLockConfig {
  enabled: boolean;
  /** Seconds the app may stay in the background before re-locking.
   *  0 = immediately (also the default). */
  graceSeconds: number;
}

export const GRACE_OPTIONS = [0, 60, 300] as const;

const DEFAULT_CONFIG: AppLockConfig = { enabled: false, graceSeconds: 0 };

// Any writer notifies, every reader reacts — a tiny in-memory pub/sub avoids
// polling, and a snapshot on top makes it an external store so components
// (Settings, the onboarding nudge) render the SAME state instead of keeping
// per-screen copies that drift (same pattern as logo-consent).
type Listener = (config: AppLockConfig) => void;
const listeners = new Set<Listener>();
let snapshot: AppLockConfig = DEFAULT_CONFIG;

export function onAppLockChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(config: AppLockConfig) {
  snapshot = config;
  listeners.forEach((listener) => listener(config));
}

// Read the stored config once, at startup (called from the root layout, like
// hydrateLogoConsent). The locked-off default renders safely until then.
let hydrating: Promise<void> | null = null;
export function hydrateAppLock(): Promise<void> {
  if (!hydrating) hydrating = loadAppLockConfig().then(notify);
  return hydrating;
}

const subscribe = (listener: () => void) => onAppLockChange(() => listener());
const getSnapshot = () => snapshot;

/** Live app-lock config for components; updates wherever it was changed. */
export function useAppLockConfig(): AppLockConfig {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** The config as of now, for non-React callers (the widget snapshot writer:
 *  a Face-ID-locked app must not push amounts onto the home screen). */
export function appLockConfigSnapshot(): AppLockConfig {
  return snapshot;
}

export async function loadAppLockConfig(): Promise<AppLockConfig> {
  try {
    const [enabled, grace] = await Promise.all([
      AsyncStorage.getItem(ENABLED_KEY),
      AsyncStorage.getItem(GRACE_KEY),
    ]);
    const graceSeconds = Number(grace);
    return {
      enabled: enabled === "yes",
      graceSeconds: Number.isFinite(graceSeconds) && graceSeconds >= 0 ? graceSeconds : 0,
    };
  } catch {
    return DEFAULT_CONFIG; // fail open: never lock someone out over storage
  }
}

async function writeConfig(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // best-effort
  }
  notify(await loadAppLockConfig());
}

export const setAppLockEnabled = (enabled: boolean): Promise<void> =>
  writeConfig(ENABLED_KEY, enabled ? "yes" : "no");

export const setAppLockGrace = (graceSeconds: number): Promise<void> =>
  writeConfig(GRACE_KEY, String(graceSeconds));

export type AuthKind = "faceId" | "touchId" | "generic" | "unavailable";

/** What the device can lock with — drives the Settings row's wording. */
export async function getAuthKind(): Promise<AuthKind> {
  try {
    const [hasHardware, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    // A device passcode alone still works (authenticateAsync falls back to
    // it), so only a device with nothing at all is "unavailable".
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    if (level === LocalAuthentication.SecurityLevel.NONE) return "unavailable";
    if (!hasHardware || !enrolled) return "generic";
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return "faceId";
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return "touchId";
    return "generic";
  } catch {
    return "unavailable";
  }
}

/** One OS authentication round: biometrics first, device passcode fallback. */
export async function authenticate(promptMessage: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}
