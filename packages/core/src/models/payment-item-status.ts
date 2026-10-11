import type { CalendarDate } from "../primitives/temporal";
import { summarizeInstallmentPlan } from "./installment-plan";
import { isInstallmentSchedule, isRecurringSchedule, type PaymentItem } from "./payment-item";

/**
 * Whether an item has run its course — derived, not a stored flag (so it's
 * always correct without something having to remember to set it):
 * - RECURRING: the charge cursor has moved past the end date, i.e. the last
 *   billing was settled (accrued for automatic items, ticked for manual
 *   ones). A passed end date alone is NOT completion: a manual item whose
 *   last charge was never ticked must stay open and overdue, or that charge
 *   could never be marked paid (the projection and this rule must agree).
 * - INSTALLMENT: every payment is covered.
 */
export function isPaymentItemComplete(item: PaymentItem): boolean {
  if (isRecurringSchedule(item.schedule)) {
    const { endDate, nextChargeDate } = item.schedule;
    return endDate !== undefined && nextChargeDate > endDate;
  }
  if (isInstallmentSchedule(item.schedule)) {
    return summarizeInstallmentPlan(item.schedule).isComplete;
  }
  return false;
}

/**
 * Whether an item is no longer part of the RUNNING commitment: complete, or
 * a recurring item whose end date has passed. The money views (what do I pay
 * per month, per year, per cadence) read this one; an overdue last charge of
 * a manual item still shows in Upcoming and can still be ticked, it just no
 * longer counts as a running cost.
 */
export function isPaymentItemEnded(item: PaymentItem, asOf: CalendarDate): boolean {
  if (isPaymentItemComplete(item)) return true;
  return (
    isRecurringSchedule(item.schedule) &&
    item.schedule.endDate !== undefined &&
    item.schedule.endDate < asOf
  );
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
 * shared by recurring subscriptions and Pay-in-X plans alike (what applies to
 * one must apply to the other): the item must be MANUAL (automatic ones debit
 * themselves and are caught up automatically — never hand-ticked), and the
 * payment must be due, overdue, or due later in the current calendar month —
 * never a later month.
 */
export function canMarkPaid(item: PaymentItem, asOf: CalendarDate): boolean {
  if (item.status !== "active" || isPaymentItemComplete(item)) return false;
  if (item.settlementMode !== "manual") return false;
  if (isInstallmentSchedule(item.schedule)) return canMarkNextInstallmentPaid(item, asOf);
  if (isRecurringSchedule(item.schedule)) {
    return withinCurrentMonth(item.schedule.nextChargeDate, asOf);
  }
  return false;
}
