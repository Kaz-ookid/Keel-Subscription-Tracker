// Which notification fires when. Pure plan of reminders derived from the
// items' stored reminder rules and their NEXT occurrence — the platform layer
// turns this into actual scheduled notifications and re-derives it on every
// state change, so a paid/paused/edited commitment can never fire stale.

import type { Money } from "../primitives/money";
import { reminderRules, type ReminderRule } from "../primitives/reminder";
import { addDays, shiftOffWeekend } from "../primitives/schedule-dates";
import type { CalendarDate } from "../primitives/temporal";
import {
  effectiveRecurringAmount,
  isInstallmentSchedule,
  isRecurringSchedule,
  type PaymentItem,
} from "../models/payment-item";
import { isPaymentItemComplete } from "../models/payment-item-status";
import { summarizeInstallmentPlan } from "../models/installment-plan";

/** What a reminder is about — the platform localizes the body per kind:
 *  - `charge`: a payment is due ("X is due").
 *  - `trialEnd`: a FREE trial converts ("your trial ends, you'll be charged X").
 *  - `priceChange`: a paid price changes on a date ("price changes to X"). */
export type ReminderKind = "charge" | "trialEnd" | "priceChange";

export interface PlannedReminder {
  /** Stable per-notification handle (`item:kind:fireDate`) — unique within a
   *  plan because same-day fires of one item+kind are deduped. */
  id: string;
  paymentItemId: string;
  name: string;
  amount: Money;
  dueDate: CalendarDate;
  /** The day the notification fires (due date minus the rule's daysBefore;
   *  a one-shot whose window already started clamps to `asOf`). */
  fireDate: CalendarDate;
  /** The rule's per-item hour override; absent = platform default. */
  hour?: number;
  kind: ReminderKind;
}

/** Trial-end reminders always fire even without a per-item charge rule, since
 *  a converting trial is exactly what you don't want to miss. */
const DEFAULT_TRIAL_LEAD_DAYS = 2;

/** The fire dates one rule produces for a due date: one for a plain rule
 *  (clamped to `asOf` so a late-set reminder still nudges once), a series
 *  for a repeating rule (every 1/7 days from the lead until the due day,
 *  past occurrences dropped — a series never dumps its backlog on today). */
function fireDates(rule: ReminderRule, dueDate: CalendarDate, asOf: CalendarDate): CalendarDate[] {
  const first = addDays(dueDate, -rule.daysBefore);
  if (!rule.repeat) return [first < asOf ? asOf : first];
  const step = rule.repeat === "daily" ? 1 : 7;
  const dates: CalendarDate[] = [];
  for (let date = first; date <= dueDate; date = addDays(date, step)) {
    if (date >= asOf) dates.push(date);
  }
  return dates;
}

/**
 * The reminders an active commitment warrants, sorted chronologically:
 *  - CHARGE reminders for its next payment, one per stored rule (and per
 *    repeat occurrence); overdue payments yield nothing — the app shows
 *    overdue loudly in place and notifications don't nag about the past.
 *  - a TRIAL-END reminder when a recurring item is mid-trial, anchored to the
 *    conversion date and announcing the regular price it's about to become.
 * The chronological order is load-bearing: the platform schedules from the
 * front and stops at the OS pending-notification ceiling, so the nearest
 * reminders must come first.
 */
export function plannedReminders(
  items: readonly PaymentItem[],
  asOf: CalendarDate,
): PlannedReminder[] {
  const planned = items.flatMap((item) => {
    if (item.status !== "active" || isPaymentItemComplete(item)) return [];
    const rules = reminderRules(item);
    const primary: ReminderRule | undefined = rules[0];
    const reminders: PlannedReminder[] = [];

    // An EXPLICIT empty rules list is the user's opt-out ("remove reminder"
    // in the notification center): it silences even the trial warning.
    // An ABSENT list (never touched) keeps the trial safety net below.
    const muted = item.reminders !== undefined && item.reminders.length === 0;

    // A scheduled price change, anchored to the conversion date and announcing
    // the new price. A free trial (intro price 0) reads as a trial ending; a
    // paid intro reads as a price change — the wording differs per kind.
    if (isRecurringSchedule(item.schedule) && item.schedule.introOffer && !muted) {
      const { convertsOn, regularAmount } = item.schedule.introOffer;
      if (convertsOn >= asOf) {
        const lead = primary?.daysBefore ?? DEFAULT_TRIAL_LEAD_DAYS;
        const fireDate = addDays(convertsOn, -lead);
        const clamped = fireDate < asOf ? asOf : fireDate;
        reminders.push({
          id: `${item.id}:${item.schedule.amount.amount === 0 ? "trialEnd" : "priceChange"}:${clamped}`,
          paymentItemId: item.id,
          name: item.name,
          amount: regularAmount,
          dueDate: convertsOn,
          fireDate: clamped,
          hour: primary?.hour,
          kind: item.schedule.amount.amount === 0 ? "trialEnd" : "priceChange",
        });
      }
    }

    // Charge: the next payment, one fire per rule (and repeat occurrence).
    if (rules.length > 0) {
      let dueDate: CalendarDate | undefined;
      let amount: Money | undefined;
      if (isRecurringSchedule(item.schedule)) {
        dueDate = item.schedule.nextChargeDate;
        // The amount that will actually bill on that day (post-intro price);
        // a free trial keeps its 0 so the trial-end reminder stays the only one.
        amount =
          item.schedule.amount.amount > 0
            ? effectiveRecurringAmount(item.schedule, dueDate)
            : item.schedule.amount;
      } else if (isInstallmentSchedule(item.schedule)) {
        const next = summarizeInstallmentPlan(item.schedule).nextDue;
        dueDate = next?.dueDate;
        amount = next?.amount;
      }
      // The reminder is about the day the money MOVES: a Saturday charge
      // shifted to Monday must count its "days before" from Monday, or a
      // 3-day lead would fire five days early.
      if (dueDate) dueDate = shiftOffWeekend(dueDate, item.weekendShift);
      // amount > 0 skips a free trial's 0-priced "next charge" — its
      // trial-end reminder above already covers the real upcoming cost.
      if (dueDate && amount && amount.amount > 0 && dueDate >= asOf) {
        // Two rules landing on the same day collapse into one notification
        // (rule order wins the hour), or a 7d-daily plus a 2d one-shot
        // would double-buzz through the overlap.
        const seen = new Set<CalendarDate>();
        for (const rule of rules) {
          for (const fireDate of fireDates(rule, dueDate, asOf)) {
            if (seen.has(fireDate)) continue;
            seen.add(fireDate);
            reminders.push({
              id: `${item.id}:charge:${fireDate}`,
              paymentItemId: item.id,
              name: item.name,
              amount,
              dueDate,
              fireDate,
              hour: rule.hour,
              kind: "charge",
            });
          }
        }
      }
    }

    return reminders;
  });

  // CalendarDate strings compare lexicographically = chronologically.
  return planned.sort((a, b) => (a.fireDate < b.fireDate ? -1 : a.fireDate > b.fireDate ? 1 : 0));
}
