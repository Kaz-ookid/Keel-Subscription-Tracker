// What is about to cost more: every active subscription whose price
// changes on a known date inside the horizon, a free trial ending or a
// scheduled increase. One source, the intro offer the import and the form
// both write, so the Upcoming screen and the reminders agree.

import { isPaymentItemComplete } from "../models/payment-item-status";
import { isRecurringSchedule, type PaymentItem } from "../models/payment-item";
import type { Money } from "../primitives/money";
import { addDays } from "../primitives/schedule-dates";
import type { CalendarDate } from "../primitives/temporal";

export interface PriceChangeAhead {
  item: PaymentItem;
  on: CalendarDate;
  from: Money;
  to: Money;
  /** A free trial converting, or a paid price moving. */
  kind: "trialEnd" | "priceChange";
}

/** Price changes due within `horizonDays` of `asOf`, soonest first. */
export function priceChangesAhead(
  items: readonly PaymentItem[],
  asOf: CalendarDate,
  horizonDays = 90,
): PriceChangeAhead[] {
  const until = addDays(asOf, horizonDays);
  const ahead: PriceChangeAhead[] = [];
  for (const item of items) {
    if (item.status !== "active" || isPaymentItemComplete(item)) continue;
    if (!isRecurringSchedule(item.schedule) || !item.schedule.introOffer) continue;
    const { convertsOn, regularAmount } = item.schedule.introOffer;
    if (convertsOn < asOf || convertsOn > until) continue;
    ahead.push({
      item,
      on: convertsOn,
      from: item.schedule.amount,
      to: regularAmount,
      kind: item.schedule.amount.amount === 0 ? "trialEnd" : "priceChange",
    });
  }
  return ahead.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0));
}
