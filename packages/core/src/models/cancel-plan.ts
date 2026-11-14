// Cancelling a subscription, in two steps the user controls: PLAN ("remind
// me to cancel") and CONFIRM ("I've cancelled it"). Keel never cancels
// anything itself. A plan is metadata on a running item; a confirmed
// cancellation is the existing end-date mechanism, so history, completion
// and every money view keep working unchanged.

import { addDays, nextOnGrid } from "../primitives/schedule-dates";
import type { CalendarDate, Timestamp } from "../primitives/temporal";
import { isRecurringSchedule, type PaymentItem } from "./payment-item";
import { resumePaymentItem } from "./payment-item-mutations";
import { isPaymentItemComplete } from "./payment-item-status";

/** A cancellation can be planned or confirmed on a subscription that has
 *  no end yet. Split payments run their course; an ending item is settled. */
export function canCancel(item: PaymentItem): boolean {
  return (
    isRecurringSchedule(item.schedule) &&
    item.schedule.endDate === undefined &&
    (item.status === "active" || item.status === "paused")
  );
}

/** Whether the plan is LIVE: the lists, the totals and the reminders read
 *  this one. A paused item keeps its plan but stays out of them, like it
 *  stays out of every forecast. */
export function isCancelPlanned(item: PaymentItem): boolean {
  return (
    item.cancelPlan !== undefined &&
    item.status === "active" &&
    canCancel(item) &&
    !isPaymentItemComplete(item)
  );
}

/** The last day to cancel: the date the user set, else the day before the
 *  next charge. Undefined without a plan. */
export function cancelDeadline(item: PaymentItem): CalendarDate | undefined {
  if (!item.cancelPlan || !isRecurringSchedule(item.schedule)) return undefined;
  return item.cancelPlan.cancelBy ?? addDays(item.schedule.nextChargeDate, -1);
}

export interface PlanCancellationContext {
  now: Timestamp;
  today: CalendarDate;
  /** An explicit last day to cancel; omit for "before the next charge". */
  cancelBy?: CalendarDate;
}

/**
 * Plan a cancellation, or change the deadline of an existing plan (which
 * keeps its `since`). Planning is a request to be reminded, so it lifts an
 * explicit reminder mute (`reminders: []`). No-op when `canCancel` is false.
 */
export function planCancellation(item: PaymentItem, ctx: PlanCancellationContext): PaymentItem {
  if (!canCancel(item)) return item;
  const muted = item.reminders !== undefined && item.reminders.length === 0;
  const next: PaymentItem = {
    ...item,
    cancelPlan: {
      since: item.cancelPlan?.since ?? ctx.today,
      ...(ctx.cancelBy !== undefined && { cancelBy: ctx.cancelBy }),
    },
    updatedAt: ctx.now,
  };
  if (muted) delete next.reminders;
  return next;
}

/** "Keep it": drop the plan, the item runs on as before. */
export function clearCancelPlan(item: PaymentItem, ctx: { now: Timestamp }): PaymentItem {
  if (!item.cancelPlan) return item;
  const next: PaymentItem = { ...item, updatedAt: ctx.now };
  delete next.cancelPlan;
  return next;
}

export interface ConfirmCancellationContext {
  now: Timestamp;
  today: CalendarDate;
  /** The last billing still to come (a date on the billing grid). Omit for
   *  "nothing more to pay": the subscription ends today. */
  lastChargeDate?: CalendarDate;
}

/**
 * "I've cancelled it": end the subscription and drop the plan. Works with or
 * without a plan. A paused item resumes first WITHOUT logging the paused
 * months, so it ends cleanly instead of owing them. An unpaid manual charge
 * already due stays open to tick or skip. No-op when `canCancel` is false.
 */
export function confirmCancellation(
  item: PaymentItem,
  ctx: ConfirmCancellationContext,
): PaymentItem {
  if (!canCancel(item)) return item;
  const running = resumePaymentItem(item, { now: ctx.now, asOf: ctx.today });
  if (!isRecurringSchedule(running.schedule)) return item; // unreachable
  const next: PaymentItem = {
    ...running,
    schedule: { ...running.schedule, endDate: ctx.lastChargeDate ?? ctx.today },
    updatedAt: ctx.now,
  };
  delete next.cancelPlan;
  return next;
}

/** The billing dates a confirmed cancellation may still run to: the next
 *  charges on the grid, soonest first. Empty when `canCancel` is false. */
export function lastChargeOptions(item: PaymentItem, count = 3): CalendarDate[] {
  if (!canCancel(item) || !isRecurringSchedule(item.schedule)) return [];
  const { firstChargeDate, recurrence, nextChargeDate } = item.schedule;
  const dates = [nextChargeDate];
  while (dates.length < count) {
    dates.push(nextOnGrid(firstChargeDate, recurrence, dates[dates.length - 1]));
  }
  return dates;
}
