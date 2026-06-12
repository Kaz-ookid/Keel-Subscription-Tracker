// How often something repeats, modelled as a composable rule rather than a
// fixed list of named frequencies. A RecurrenceRule is a unit + an interval:
// "monthly" is { month, 1 }, "quarterly" is { month, 3 }, "fortnightly" is
// { week, 2 }. This single shape covers every preset AND arbitrary cadences
// ("every 6 months", "every 10 days") without ever editing an enum.

import type { DescriptorMap } from "./descriptor";

export type TimeUnit = "day" | "week" | "month" | "year";

/** Singular/plural labels for building human strings like "every 2 weeks". */
export const TIME_UNITS: DescriptorMap<TimeUnit> = {
  day: { label: "day" },
  week: { label: "week" },
  month: { label: "month" },
  year: { label: "year" },
};

const PLURAL: Record<TimeUnit, string> = {
  day: "days",
  week: "weeks",
  month: "months",
  year: "years",
};

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

/** Weekday names for anchored-rule wording (JS convention, 0 = Sunday). */
export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const WEEK_ORDINALS = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", last: "last" } as const;

/** "1st Thursday", "last Friday" — the anchored rule's day phrase. */
export function describeAnchor(anchor: MonthlyAnchor): string {
  return `${WEEK_ORDINALS[anchor.week]} ${WEEKDAY_NAMES[anchor.weekday]}`;
}

/**
 * Human description: { month, 1 } → "monthly", { month, 3 } → "every 3
 * months"; anchored: "every 1st Thursday" / "every 2 months on the last Friday".
 */
export function describeRecurrence(rule: RecurrenceRule): string {
  if (rule.unit === "month" && rule.anchor) {
    return rule.interval === 1
      ? `every ${describeAnchor(rule.anchor)}`
      : `every ${rule.interval} months on the ${describeAnchor(rule.anchor)}`;
  }
  if (rule.interval === 1) {
    switch (rule.unit) {
      case "day":
        return "daily";
      case "week":
        return "weekly";
      case "month":
        return "monthly";
      case "year":
        return "yearly";
    }
  }
  return `every ${rule.interval} ${PLURAL[rule.unit]}`;
}
