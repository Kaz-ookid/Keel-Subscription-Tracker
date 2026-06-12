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

export interface PlannedReminder {
  paymentItemId: string;
  name: string;
  amount: Money;
  dueDate: CalendarDate;
  /** The day the notification fires (due date minus the rule's daysBefore,
   *  clamped to `asOf` when the window already started). */
  fireDate: CalendarDate;
}

/**
 * One reminder per active commitment that carries a reminder rule: its next
 * payment, `daysBefore` days ahead. Overdue payments yield nothing — the app
 * shows overdue loudly in place; notifications don't nag about the past.
 */
export function plannedReminders(
  items: readonly PaymentItem[],
  asOf: CalendarDate,
): PlannedReminder[] {
  return items.flatMap((item) => {
    if (item.status !== "active" || !item.reminder) return [];
    if (isPaymentItemComplete(item, asOf)) return [];

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
    if (!dueDate || !amount || dueDate < asOf) return [];

    const fireDate = addDays(dueDate, -item.reminder.daysBefore);
    return [
      {
        paymentItemId: item.id,
        name: item.name,
        amount,
        dueDate,
        // The window already started → remind now rather than never.
        fireDate: fireDate < asOf ? asOf : fireDate,
      },
    ];
  });
}
