// Whether Keel can draw Apple's real Liquid Glass: iOS 26 and later. Below
// that every glass surface falls back to the blur material (ui/Glass). The
// system adapts real glass to Reduce Transparency, Increase Contrast and the
// user's clear/tinted setting by itself, so none of that is read here.
// A debug switch pretends there is none, to look at the fallback on a new
// iPhone (Keel's own controls only: the system bars stay what iOS draws).

import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { useSyncExternalStore } from "react";

// isGlassEffectAPIAvailable guards the iOS 26 betas that lack the API.
const available = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

let pretendNone = false;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Debug only, not stored. */
export function setGlassPretendNone(next: boolean): void {
  pretendNone = next;
  listeners.forEach((listener) => listener());
}

export function useGlassPretendNone(): boolean {
  return useSyncExternalStore(subscribe, () => pretendNone);
}

/** True when a surface should be real Liquid Glass. */
export function useGlass(): boolean {
  return useSyncExternalStore(subscribe, () => available && !pretendNone);
}
