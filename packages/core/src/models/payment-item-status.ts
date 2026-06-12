import { addRecurrence } from "../primitives/schedule-dates";
import type { CalendarDate } from "../primitives/temporal";
import { summarizeInstallmentPlan } from "./installment-plan";
import { isInstallmentSchedule, isRecurringSchedule, type PaymentItem } from "./payment-item";

/**
 * Whether an item has run its course — derived, not a stored flag (so it's
 * always correct without something having to remember to set it):
 * - RECURRING: its end date has passed (works for manual items too, which
 *   never accrue), or the charge cursor has moved past the end date — i.e.
 *   the last billing was already paid, even if its date hasn't arrived yet.
 * - INSTALLMENT: every payment is covered.
 */
export function isPaymentItemComplete(item: PaymentItem, asOf: CalendarDate): boolean {
  if (isRecurringSchedule(item.schedule)) {
    const { endDate, nextChargeDate } = item.schedule;
    return endDate !== undefined && (endDate < asOf || nextChargeDate > endDate);
  }
  if (isInstallmentSchedule(item.schedule)) {
    return summarizeInstallmentPlan(item.schedule).isComplete;
  }
  return false;
}

/**
 * Whether the plan's next installment may be marked paid right now: only the
 * one falling within the current billing cycle — due, overdue, or coming up
 * within one recurrence step of `asOf`. Caps repeated taps from racing months
 * ahead (works for weekly/quarterly plans too, not just monthly).
 */
export function canMarkNextInstallmentPaid(item: PaymentItem, asOf: CalendarDate): boolean {
  if (item.status !== "active" || !isInstallmentSchedule(item.schedule)) return false;
  const next = summarizeInstallmentPlan(item.schedule).nextDue;
  return next !== undefined && next.dueDate < addRecurrence(asOf, item.schedule.recurrence);
}
