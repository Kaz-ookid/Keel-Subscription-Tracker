import type { CalendarDate } from "../primitives/temporal";
import { summarizeInstallmentPlan } from "./installment-plan";
import { isInstallmentSchedule, isRecurringSchedule, type PaymentItem } from "./payment-item";

/**
 * Whether an item has run its course — derived, not a stored flag (so it's
 * always correct without something having to remember to set it):
 * - RECURRING: its end date has passed (works for manual items too, which
 *   never accrue).
 * - INSTALLMENT: every payment is covered.
 */
export function isPaymentItemComplete(item: PaymentItem, asOf: CalendarDate): boolean {
  if (isRecurringSchedule(item.schedule)) {
    return item.schedule.endDate !== undefined && item.schedule.endDate < asOf;
  }
  if (isInstallmentSchedule(item.schedule)) {
    return summarizeInstallmentPlan(item.schedule).isComplete;
  }
  return false;
}
