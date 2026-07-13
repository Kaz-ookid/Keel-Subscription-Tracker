// Which notification fires when. Pure plan of reminders derived from the
// items' stored reminder rules and their NEXT occurrence — the platform layer
// turns this into actual scheduled notifications and re-derives it on every
// state change, so a paid/paused/edited commitment can never fire stale.

import type { Money } from "../primitives/money";
import { addDays } from "../primitives/schedule-dates";
import type { CalendarDate } from "../primitives/temporal";
import {
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
  paymentItemId: string;
  name: string;
  amount: Money;
  dueDate: CalendarDate;
  /** The day the notification fires (due date minus the rule's daysBefore,
   *  clamped to `asOf` when the window already started). */
  fireDate: CalendarDate;
  /** The rule's per-item hour override; absent = platform default. */
  hour?: number;
  kind: ReminderKind;
}

/** Trial-end reminders always fire even without a per-item charge rule, since
 *  a converting trial is exactly what you don't want to miss. */
const DEFAULT_TRIAL_LEAD_DAYS = 2;

/**
 * The reminders an active commitment warrants:
 *  - a CHARGE reminder for its next payment when the item carries a reminder
 *    rule (`daysBefore` ahead); overdue payments yield nothing — the app shows
 *    overdue loudly in place and notifications don't nag about the past.
 *  - a TRIAL-END reminder when a recurring item is mid-trial, anchored to the
 *    conversion date and announcing the regular price it's about to become.
 */
export function plannedReminders(
  items: readonly PaymentItem[],
  asOf: CalendarDate,
): PlannedReminder[] {
  return items.flatMap((item) => {
    if (item.status !== "active" || isPaymentItemComplete(item, asOf)) return [];
    const reminders: PlannedReminder[] = [];

    // A scheduled price change, anchored to the conversion date and announcing
    // the new price. A free trial (intro price 0) reads as a trial ending; a
    // paid intro reads as a price change — the wording differs per kind.
    if (isRecurringSchedule(item.schedule) && item.schedule.introOffer) {
      const { convertsOn, regularAmount } = item.schedule.introOffer;
      if (convertsOn >= asOf) {
        const lead = item.reminder?.daysBefore ?? DEFAULT_TRIAL_LEAD_DAYS;
        const fireDate = addDays(convertsOn, -lead);
        reminders.push({
          paymentItemId: item.id,
          name: item.name,
          amount: regularAmount,
          dueDate: convertsOn,
          fireDate: fireDate < asOf ? asOf : fireDate,
          hour: item.reminder?.hour,
          kind: item.schedule.amount.amount === 0 ? "trialEnd" : "priceChange",
        });
      }
    }

    // Charge: the next payment, when the item carries a reminder rule.
    if (item.reminder) {
      let dueDate: CalendarDate | undefined;
      let amount: Money | undefined;
      if (isRecurringSchedule(item.schedule)) {
        dueDate = item.schedule.nextChargeDate;
        amount = item.schedule.amount;
      } else if (isInstallmentSchedule(item.schedule)) {
        const next = summarizeInstallmentPlan(item.schedule).nextDue;
        dueDate = next?.dueDate;
        amount = next?.amount;
      }
      // amount > 0 skips a free trial's 0-priced "next charge" — its
      // trial-end reminder above already covers the real upcoming cost.
      if (dueDate && amount && amount.amount > 0 && dueDate >= asOf) {
        const fireDate = addDays(dueDate, -item.reminder.daysBefore);
        reminders.push({
          paymentItemId: item.id,
          name: item.name,
          amount,
          dueDate,
          fireDate: fireDate < asOf ? asOf : fireDate,
          hour: item.reminder.hour,
          kind: "charge",
        });
      }
    }

    return reminders;
  });
}
