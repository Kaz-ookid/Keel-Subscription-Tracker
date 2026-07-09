// The app lock's storage and biometric plumbing. Device-level settings (own
// keys, like the onboarding flag), deliberately NOT part of the backup blob:
// a restored backup must never lock a new phone with someone else's setting.
// The lock itself defers entirely to the OS (Face ID / Touch ID with the
// device passcode as fallback) — nothing to remember, nothing stored by us.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";

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

// Settings writes, the gate reacts — a tiny in-memory pub/sub avoids polling.
type Listener = (config: AppLockConfig) => void;
const listeners = new Set<Listener>();

export function onAppLockChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(config: AppLockConfig) {
  listeners.forEach((listener) => listener(config));
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

export async function setAppLockEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(ENABLED_KEY, enabled ? "yes" : "no");
  } catch {
    // best-effort
  }
  notify(await loadAppLockConfig());
}

export async function setAppLockGrace(graceSeconds: number): Promise<void> {
  try {
    await AsyncStorage.setItem(GRACE_KEY, String(graceSeconds));
  } catch {
    // best-effort
  }
  notify(await loadAppLockConfig());
}

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
