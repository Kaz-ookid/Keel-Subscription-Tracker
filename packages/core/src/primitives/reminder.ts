// A per-subscription reminder preference: "remind me N days before the due
// date." Independent of whether the payment is automatic or manual — it's the
// user's choice per subscription (Bobby's "Rappelez-moi"). Absent = never.
//
// This only models the *preference*; actually firing OS notifications is a
// separate platform concern (deferred).

/** How a rule keeps nudging after its first fire, until the due day. */
export type ReminderRepeat = "daily" | "weekly";

export interface ReminderRule {
  /** Days before the due date to remind. 0 = on the day itself. */
  readonly daysBefore: number;
  /** Local hour (0-23) this reminder fires at. Absent = the app-wide
   *  default hour chosen in the platform's notification settings. */
  readonly hour?: number;
  /** Fire again every day/week from `daysBefore` until the due day.
   *  Absent = a single reminder. */
  readonly repeat?: ReminderRepeat;
}

/** An item's effective reminder rules. `reminders` (the list) wins; the
 *  legacy single `reminder` slot is read when the list is absent — and is
 *  kept mirrored to the first rule by writers, so blobs written by a newer
 *  app still show one reminder on an older one. */
export function reminderRules(source: {
  readonly reminder?: ReminderRule;
  readonly reminders?: readonly ReminderRule[];
}): readonly ReminderRule[] {
  return source.reminders ?? (source.reminder ? [source.reminder] : []);
}
