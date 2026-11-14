// The App Store rating prompt: asked ONCE, after real use, right after the
// user ticks a payment (a moment the app just did its job). Never during
// setup, never in read-only mode. Apple's own dialog; Apple may still decide
// not to show it. The About screen keeps a manual "Rate Keel" row.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { today } from "@keel/core";
import * as StoreReview from "expo-store-review";
import { useCallback } from "react";

import { daysUntil } from "../i18n/dates";
import { useAppData } from "../state/app-state";
import { useEntitlement } from "./entitlement";

const ASKED_KEY = "keel.rating-asked.v1";
const MIN_ITEMS = 3;
/** Days since the first commitment (the trial anchor). */
const MIN_DAYS = 7;
/** Lets the mark-paid haptic and row animation finish first. */
const DELAY_MS = 1500;

let asking = false;

/** Returns the function to call after a payment was marked paid. */
export function useRatingPrompt(): () => void {
  const { items } = useAppData();
  const { anchor, locked } = useEntitlement();
  const itemCount = items.length;
  return useCallback(() => {
    if (asking || locked || itemCount < MIN_ITEMS || !anchor) return;
    if (daysUntil(today(), anchor) < MIN_DAYS) return;
    asking = true;
    void (async () => {
      try {
        if ((await AsyncStorage.getItem(ASKED_KEY)) === "yes") return;
        if (!(await StoreReview.isAvailableAsync())) return;
        // Marked BEFORE asking: a crash or a dismissed dialog must never
        // turn into asking again.
        await AsyncStorage.setItem(ASKED_KEY, "yes");
        await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
        await StoreReview.requestReview();
      } catch {
        // best-effort: a rating prompt must never get in the way
      } finally {
        asking = false;
      }
    })();
  }, [anchor, itemCount, locked]);
}
