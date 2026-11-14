// What the user means to cancel: every subscription with a live cancel
// plan, with its deadline. One source for the Upcoming section, the row
// tag and the "after cancellations" total, like price-changes-ahead.ts.

import { cancelDeadline, isCancelPlanned } from "../models/cancel-plan";
import type { PaymentItem } from "../models/payment-item";
import type { CalendarDate } from "../primitives/temporal";

export interface CancelPlanAhead {
  item: PaymentItem;
  /** The last day to cancel. */
  deadline: CalendarDate;
  /** The deadline is behind `asOf`: a date the user set and let pass, or a
   *  charge that is already due. */
  passed: boolean;
}

/** Live cancel plans, soonest deadline first (passed ones lead). */
export function cancelPlansAhead(
  items: readonly PaymentItem[],
  asOf: CalendarDate,
): CancelPlanAhead[] {
  const ahead: CancelPlanAhead[] = [];
  for (const item of items) {
    if (!isCancelPlanned(item)) continue;
    const deadline = cancelDeadline(item);
    if (!deadline) continue;
    ahead.push({ item, deadline, passed: deadline < asOf });
  }
  return ahead.sort((a, b) => (a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0));
}
