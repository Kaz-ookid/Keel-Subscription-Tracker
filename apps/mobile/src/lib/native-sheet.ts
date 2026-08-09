// The app's one way to open a native action sheet. Plain ActionSheetIOS has
// a touch leak: the sheet dismisses on touch-DOWN, so when the user taps the
// dimmed area to cancel, the same tap's touch-UP lands on whatever Pressable
// sits underneath and activates it (tap out of the Language sheet, watch the
// row below open). While a sheet is up, a transparent shield over the RN
// window (see SheetShield, rendered once in the root layout) swallows that
// stray touch; the sheet itself lives in its own native window above and is
// never blocked.

import { ActionSheetIOS } from "react-native";
import { useSyncExternalStore } from "react";

type SheetOptions = Parameters<typeof ActionSheetIOS.showActionSheetWithOptions>[0];

let shieldUp = false;
const listeners = new Set<() => void>();

function emit(up: boolean): void {
  shieldUp = up;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getSnapshot = () => shieldUp;

/** The shield component reads this; nothing else should. */
export function useSheetShieldUp(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** The shield calls this the moment it swallows a touch. */
export function lowerSheetShield(): void {
  emit(false);
}

/** Drop-in for ActionSheetIOS.showActionSheetWithOptions, shielded. */
export function showNativeActionSheet(
  options: SheetOptions,
  onSelect: (index: number) => void,
): void {
  emit(true);
  ActionSheetIOS.showActionSheetWithOptions(options, (index) => {
    // Tap-out cancels produce the stray touch almost immediately and the
    // shield lowers itself on contact; a Cancel-button dismiss produces no
    // touch at all, so this timer is the fallback that clears the shield.
    setTimeout(lowerSheetShield, 400);
    onSelect(index);
  });
}
