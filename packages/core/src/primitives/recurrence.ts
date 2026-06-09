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

export interface RecurrenceRule {
  readonly unit: TimeUnit;
  /** How many units between occurrences. Must be a positive integer. */
  readonly interval: number;
}

/** Convenience references for the common cadences a UI offers by default. */
export const RECURRENCE_PRESETS = {
  WEEKLY: { unit: "week", interval: 1 },
  FORTNIGHTLY: { unit: "week", interval: 2 },
  MONTHLY: { unit: "month", interval: 1 },
  QUARTERLY: { unit: "month", interval: 3 },
  YEARLY: { unit: "year", interval: 1 },
} as const satisfies Record<string, RecurrenceRule>;

/** Human description: { month, 1 } → "monthly", { month, 3 } → "every 3 months". */
export function describeRecurrence(rule: RecurrenceRule): string {
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
