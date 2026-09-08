// Screenshot mode: quadruple-tap anywhere to hide the dock, so App Store
// captures get the full clean screen; four more taps bring it back. A
// capture tool, not a feature: it exists only where the debug drawer does
// (dev clients and TestFlight beta builds), never in the App Store binary,
// and it never persists — a relaunch always starts with the dock on.
//
// Detection rides the root view's onTouchStart (it fires for touches
// anywhere in the subtree without claiming them), so no gesture handler
// wraps the app and nothing can interfere with real gestures.

import { useSyncExternalStore } from "react";

import { hapticSelection } from "./haptics";

const ENABLED = __DEV__ || process.env.EXPO_PUBLIC_DEBUG_TOOLS === "1";

/** Four taps, each within this many ms of the previous one. */
const TAP_WINDOW_MS = 350;
const TAPS_TO_TOGGLE = 4;

let hidden = false;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Whether chrome (the dock) is hidden for a clean capture. */
export function useScreenshotMode(): boolean {
  return useSyncExternalStore(subscribe, () => hidden);
}

let tapCount = 0;
let lastTapAt = 0;

/** Wired to the root view's onTouchStart: counts rapid taps and toggles
 *  the mode on the fourth. */
export function noteScreenshotTap(): void {
  if (!ENABLED) return;
  const at = Date.now();
  tapCount = at - lastTapAt <= TAP_WINDOW_MS ? tapCount + 1 : 1;
  lastTapAt = at;
  if (tapCount >= TAPS_TO_TOGGLE) {
    tapCount = 0;
    hidden = !hidden;
    hapticSelection();
    listeners.forEach((listener) => listener());
  }
}
