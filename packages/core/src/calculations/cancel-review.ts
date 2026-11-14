// The Cancellations screen's two lists: the subscriptions still running,
// each with what a year of it costs (the number a cancel decision turns on),
// and the ones that stopped, with what a year of them used to cost.

import { canCancel, isCancelPlanned } from "../models/cancel-plan";
import {
  isRecurringSchedule,
  type PaymentItem,
  type RecurringSchedule,
} from "../models/payment-item";
import type { Money } from "../primitives/money";
import type { CalendarDate } from "../primitives/temporal";
import { yearlyEquivalent } from "./insights";

export interface CancelCandidate {
  item: PaymentItem;
  /** A year at the regular price. */
  yearly: Money;
  /** A live cancel plan is set. */
  planned: boolean;
}

export interface StoppedSubscription {
  item: PaymentItem;
  /** What a year of it cost at its regular price. */
  yearly: Money;
  /** The last billing date. */
  endDate: CalendarDate;
  /** False while the last billing is still to come. */
  ended: boolean;
}

export interface CancelReview {
  /** In the order given; the caller sorts (currencies need rates). */
  running: CancelCandidate[];
  /** Latest end first. */
  stopped: StoppedSubscription[];
}

// The regular price, not a trial's: a free month still costs its year.
const yearlyCost = (schedule: RecurringSchedule): Money =>
  yearlyEquivalent(schedule.introOffer?.regularAmount ?? schedule.amount, schedule.recurrence);

/** Active subscriptions without an end, and every subscription with one.
 *  Paused items are in neither list, like in every forecast; split payments
 *  run their course. */
export function cancelReview(items: readonly PaymentItem[], asOf: CalendarDate): CancelReview {
  const running: CancelCandidate[] = [];
  const stopped: StoppedSubscription[] = [];
  for (const item of items) {
    if (!isRecurringSchedule(item.schedule)) continue;
    const yearly = yearlyCost(item.schedule);
    const { endDate } = item.schedule;
    if (endDate !== undefined) {
      stopped.push({ item, yearly, endDate, ended: endDate < asOf });
    } else if (item.status === "active" && canCancel(item)) {
      running.push({ item, yearly, planned: isCancelPlanned(item) });
    }
  }
  stopped.sort((a, b) => (a.endDate < b.endDate ? 1 : a.endDate > b.endDate ? -1 : 0));
  return { running, stopped };
}
