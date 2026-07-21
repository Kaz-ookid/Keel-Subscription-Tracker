// Direct binding to the KeelExtensionStorage native module. Import this ONLY
// through src/lib/widgets.ts: requireNativeModule throws where the native
// half doesn't exist (Expo Go), and that lib catches it and stays a loudly
// logged no-op instead.

import { requireNativeModule } from "expo-modules-core";

export interface KeelExtensionStorageNative {
  /** Write a string under `key` in the App Group's shared UserDefaults. */
  setString(key: string, value: string, group: string): void;
  /** What the suite actually holds (null when absent) — the write probe. */
  getString(key: string, group: string): string | null;
  /** Reload every WidgetKit timeline. */
  reloadWidgets(): void;
}

export default requireNativeModule<KeelExtensionStorageNative>("KeelExtensionStorage");
