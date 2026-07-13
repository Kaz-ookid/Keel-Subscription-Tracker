// A per-subscription reminder preference: "remind me N days before the due
// date." Independent of whether the payment is automatic or manual — it's the
// user's choice per subscription (Bobby's "Rappelez-moi"). Absent = never.
//
// This only models the *preference*; actually firing OS notifications is a
// separate platform concern (deferred).

export interface ReminderRule {
  /** Days before the due date to remind. 0 = on the day itself. */
  readonly daysBefore: number;
  /** Local hour (0-23) this reminder fires at. Absent = the app-wide
   *  default hour chosen in the platform's notification settings. */
  readonly hour?: number;
}

export const REMINDER_PRESETS = {
  SAME_DAY: { daysBefore: 0 },
  ONE_DAY: { daysBefore: 1 },
  TWO_DAYS: { daysBefore: 2 },
  ONE_WEEK: { daysBefore: 7 },
} as const satisfies Record<string, ReminderRule>;

/** Human label, including the "never" case when no rule is set. */
export function describeReminder(rule?: ReminderRule): string {
  if (!rule) return "Never";
  if (rule.daysBefore === 0) return "On the day";
  if (rule.daysBefore === 1) return "1 day before";
  if (rule.daysBefore === 7) return "1 week before";
  return `${rule.daysBefore} days before`;
}
