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

/** Due, overdue, or due later within `asOf`'s calendar month. */
function withinCurrentMonth(dueDate: CalendarDate, asOf: CalendarDate): boolean {
  return dueDate <= asOf || dueDate.slice(0, 7) === asOf.slice(0, 7);
}

/**
 * Whether the plan's next installment may be marked paid right now: only one
 * that is due, overdue, or due later this same month. Caps repeated taps from
 * racing into future months.
 */
export function canMarkNextInstallmentPaid(item: PaymentItem, asOf: CalendarDate): boolean {
  if (item.status !== "active" || !isInstallmentSchedule(item.schedule)) return false;
  const next = summarizeInstallmentPlan(item.schedule).nextDue;
  return next !== undefined && withinCurrentMonth(next.dueDate, asOf);
}

/**
 * The ONE rule for "can this item's running payment be ticked off now",
 * shared by recurring manual subscriptions and Pay-in-X plans alike (what
 * applies to one must apply to the other): the payment must be due, overdue,
 * or due later in the current calendar month — never a later month.
 * Automatic recurring items are never hand-ticked.
 */
export function canMarkPaid(item: PaymentItem, asOf: CalendarDate): boolean {
  if (item.status !== "active" || isPaymentItemComplete(item, asOf)) return false;
  if (isInstallmentSchedule(item.schedule)) return canMarkNextInstallmentPaid(item, asOf);
  if (isRecurringSchedule(item.schedule)) {
    if (item.settlementMode !== "manual") return false;
    return withinCurrentMonth(item.schedule.nextChargeDate, asOf);
  }
  return false;
}
