// The app-trial clock (PROJECT_BRIEF §7.3): everything unlocked for 45 days
// from the FIRST COMMITMENT SAVED, then read-only until the one-time
// purchase. This module owns only the arithmetic — pure functions over an
// injected "today", unit-tested like every other calculation. The UI layer
// owns WHERE the anchor is stored (keychain, iCloud key-value store,
// AsyncStorage) and what "locked" blocks.

import { isCalendarDate, type CalendarDate } from "../primitives/temporal";
import { daysBetween } from "../primitives/schedule-dates";

/** Six weeks: long enough to live through a second billing cycle — where a
 *  reminder fires, a renewal gets caught, and the habit forms. */
export const TRIAL_DAYS = 45;

export type TrialState = "fresh" | "trial" | "expired";

export interface TrialStatus {
  state: TrialState;
  /** Whole trial days still available, counting today: TRIAL_DAYS on the
   *  anchor day, 1 on the last valid day, 0 once expired. "fresh" reports
   *  the full allowance (nothing has started). */
  daysLeft: number;
}

/**
 * The EARLIEST valid anchor among the storage legs — the §7.3 enforcement
 * rule: deleting and reinstalling can never restart the clock as long as any
 * leg (keychain, iCloud, AsyncStorage) still remembers. Missing or corrupted
 * legs are skipped; nothing valid anywhere means no trial has started.
 */
export function earliestAnchor(
  candidates: readonly (string | null | undefined)[],
): CalendarDate | null {
  let earliest: CalendarDate | null = null;
  for (const candidate of candidates) {
    if (!candidate || !isCalendarDate(candidate)) continue;
    if (earliest === null || candidate < earliest) earliest = candidate;
  }
  return earliest;
}

/**
 * Where the trial stands `today`. No anchor = "fresh": nothing has been
 * committed yet, so no clock runs (an empty Keel has no value to withhold).
 * The anchor day itself counts as day one. An anchor in the future (a device
 * clock rolled backward) reads as day one rather than punishing the anomaly.
 */
export function trialStatus(anchor: CalendarDate | null, today: CalendarDate): TrialStatus {
  if (anchor === null) return { state: "fresh", daysLeft: TRIAL_DAYS };
  const elapsed = Math.max(0, daysBetween(anchor, today));
  if (elapsed >= TRIAL_DAYS) return { state: "expired", daysLeft: 0 };
  return { state: "trial", daysLeft: TRIAL_DAYS - elapsed };
}
