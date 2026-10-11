// How often something repeats, modelled as a composable rule rather than a
// fixed list of named frequencies. A RecurrenceRule is a unit + an interval:
// "monthly" is { month, 1 }, "quarterly" is { month, 3 }, "fortnightly" is
// { week, 2 }. This single shape covers every preset AND arbitrary cadences
// ("every 6 months", "every 10 days") without ever editing an enum.

export type TimeUnit = "day" | "week" | "month" | "year";

/**
 * Anchors a monthly rule to a weekday pattern instead of a date: "every 1st
 * Thursday" rather than "every 4th of the month". `week` is the occurrence
 * within the month; `"last"` counts back from month end. `weekday` follows
 * the JS convention (0 = Sunday).
 */
export interface MonthlyAnchor {
  readonly week: 1 | 2 | 3 | 4 | "last";
  readonly weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

export interface RecurrenceRule {
  readonly unit: TimeUnit;
  /** How many units between occurrences. Must be a positive integer. */
  readonly interval: number;
  /** Optional weekday anchoring — only honored when `unit` is "month".
   *  Absent = the default date-anchored grid (monthly on the Nth, clamped). */
  readonly anchor?: MonthlyAnchor;
}

/** Convenience references for the common cadences a UI offers by default. */
export const RECURRENCE_PRESETS = {
  WEEKLY: { unit: "week", interval: 1 },
  FORTNIGHTLY: { unit: "week", interval: 2 },
  MONTHLY: { unit: "month", interval: 1 },
  QUARTERLY: { unit: "month", interval: 3 },
  YEARLY: { unit: "year", interval: 1 },
} as const satisfies Record<string, RecurrenceRule>;
