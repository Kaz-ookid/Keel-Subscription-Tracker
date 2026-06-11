// State transitions of an existing PaymentItem: edits, manual tick-offs,
// automatic catch-up, installment payments. Kept apart from the factories
// (payment-item-factory.ts) so creation and mutation each read in one sitting.
// Same purity contract: all non-determinism (ids, "now") is injected.

import { addRecurrence, nextDueDate } from "../primitives/schedule-dates";
import { calendarDate, type CalendarDate, type Timestamp } from "../primitives/temporal";
import {
  COVERED_INSTALLMENT_STATUSES,
  type Installment,
  type InstallmentStatus,
} from "./installment";
import {
  makeInstallmentPaymentItem,
  makeRecurringPaymentItem,
  type NewInstallmentInput,
  type NewRecurringInput,
} from "./payment-item-factory";
import type { PaymentItem } from "./payment-item";
import type { PaymentOccurrence } from "./payment-occurrence";

export interface UpdateContext {
  now: Timestamp;
  /**
   * Latest recorded charge date for this item (max `dueDate` from the occurrence
   * ledger). Anchors the recomputed `nextChargeDate` so it never regresses behind
   * a charge that already happened. Omit when nothing has been charged yet.
   */
  lastChargedDate?: CalendarDate;
}

/**
 * Apply edits to a RECURRING item, preserving its `id`/`createdAt` and keeping
 * its derived/linked values consistent: the cached `nextChargeDate` cursor is
 * recomputed from the (possibly new) schedule, and `priceHistory` gains an entry
 * only when the amount actually changed. Throws if `existing` isn't recurring.
 */
export function updateRecurringPaymentItem(
  existing: PaymentItem,
  input: NewRecurringInput,
  ctx: UpdateContext,
): PaymentItem {
  if (existing.schedule.kind !== "RECURRING") {
    throw new TypeError("updateRecurringPaymentItem expects a RECURRING item");
  }
  const previous = existing.schedule;
  const rebuilt = makeRecurringPaymentItem(input, { id: existing.id, now: ctx.now });
  if (rebuilt.schedule.kind !== "RECURRING") {
    throw new TypeError("rebuilt item is not recurring"); // unreachable
  }

  // Recompute the "next charge" cursor: the next occurrence after the last
  // recorded charge, or the first charge itself if nothing has been charged.
  // Recorded charges sit on the schedule grid, so an unchanged schedule yields
  // the same value (no spurious shift) while a changed recurrence/first-date
  // moves it correctly — and it never regresses behind a recorded charge.
  const nextChargeDate = ctx.lastChargedDate
    ? nextDueDate(input.firstChargeDate, input.recurrence, ctx.lastChargedDate)
    : input.firstChargeDate;

  // Keep the price history; append only when the amount changed.
  const lastPrice = previous.priceHistory[previous.priceHistory.length - 1]?.amount;
  const amountChanged =
    !lastPrice ||
    lastPrice.amount !== input.amount.amount ||
    lastPrice.currency !== input.amount.currency;
  const priceHistory = amountChanged
    ? [
        ...previous.priceHistory,
        { amount: input.amount, effectiveFrom: calendarDate(ctx.now.slice(0, 10)) },
      ]
    : previous.priceHistory;

  return {
    ...rebuilt,
    createdAt: existing.createdAt,
    schedule: { ...rebuilt.schedule, nextChargeDate, priceHistory },
  };
}

export interface UpdateInstallmentContext {
  now: Timestamp;
  makeId: () => string;
}

/**
 * Apply edits to an INSTALLMENT item, preserving `id` + `createdAt`. The
 * schedule and its installments are regenerated from the new input, then
 * merged with the old installments by index: ids are kept stable, and a
 * payment already made stays made (status/paidDate/paidFromAccountId carry
 * over). A no-change save round-trips identically. Shrinking the count below
 * the number already paid drops the excess — the derived summary then reads
 * the plan as complete. Throws if `existing` isn't an installment plan.
 */
export function updateInstallmentPaymentItem(
  existing: PaymentItem,
  input: NewInstallmentInput,
  ctx: UpdateInstallmentContext,
): PaymentItem {
  if (existing.schedule.kind !== "INSTALLMENT") {
    throw new TypeError("updateInstallmentPaymentItem expects an INSTALLMENT item");
  }
  const previous = existing.schedule.installments;
  const rebuilt = makeInstallmentPaymentItem(input, {
    id: existing.id,
    now: ctx.now,
    makeId: ctx.makeId,
  });
  if (rebuilt.schedule.kind !== "INSTALLMENT") {
    throw new TypeError("rebuilt item is not an installment plan"); // unreachable
  }

  const installments: Installment[] = rebuilt.schedule.installments.map((inst, i) => {
    const old = previous[i];
    if (!old) return inst;
    const covered = COVERED_INSTALLMENT_STATUSES.includes(old.status);
    return {
      ...inst,
      id: old.id,
      ...(covered && {
        status: old.status,
        paidDate: old.paidDate,
        paidFromAccountId: old.paidFromAccountId,
      }),
    };
  });

  return {
    ...rebuilt,
    createdAt: existing.createdAt,
    schedule: { ...rebuilt.schedule, installments },
  };
}

export interface MarkInstallmentContext {
  paidDate: CalendarDate;
  now: Timestamp;
  paidFromAccountId?: string;
}

/**
 * Mark the earliest not-yet-covered installment of a plan as `paid`. Returns the
 * item unchanged if it isn't an installment plan or every installment is already
 * covered. (Payment lives on the installment itself; `summarizeInstallmentPlan`
 * and `isPaymentItemComplete` read it.)
 */
export function markNextInstallmentPaid(
  item: PaymentItem,
  ctx: MarkInstallmentContext,
): PaymentItem {
  if (item.schedule.kind !== "INSTALLMENT") return item;
  const schedule = item.schedule;
  const idx = schedule.installments.findIndex(
    (i) => !COVERED_INSTALLMENT_STATUSES.includes(i.status),
  );
  if (idx === -1) return item;

  const installments: Installment[] = schedule.installments.map((inst, i) =>
    i === idx
      ? {
          ...inst,
          status: "paid" as InstallmentStatus,
          paidDate: ctx.paidDate,
          paidFromAccountId: ctx.paidFromAccountId ?? inst.paidFromAccountId,
        }
      : inst,
  );

  return { ...item, updatedAt: ctx.now, schedule: { ...schedule, installments } };
}

export interface RecordPaymentContext {
  id: string;
  paidDate: CalendarDate;
  now: Timestamp;
  paidFromAccountId?: string;
}

/**
 * Mark the running occurrence of a recurring item as paid (the manual
 * tick-off). Returns a NEW item with its `nextChargeDate` advanced one cycle,
 * plus the `PaymentOccurrence` to log. Throws if the item isn't recurring.
 */
export function recordRecurringPayment(
  item: PaymentItem,
  ctx: RecordPaymentContext,
): { item: PaymentItem; occurrence: PaymentOccurrence } {
  if (item.schedule.kind !== "RECURRING") {
    throw new TypeError("recordRecurringPayment expects a RECURRING item");
  }
  const schedule = item.schedule;

  const occurrence: PaymentOccurrence = {
    id: ctx.id,
    paymentItemId: item.id,
    dueDate: schedule.nextChargeDate,
    chargedDate: ctx.paidDate,
    paidDate: ctx.paidDate,
    paidFromAccountId: ctx.paidFromAccountId,
    recordedAt: ctx.now,
    amount: schedule.amount,
    status: "charged",
  };

  const advanced: PaymentItem = {
    ...item,
    updatedAt: ctx.now,
    schedule: {
      ...schedule,
      nextChargeDate: addRecurrence(schedule.nextChargeDate, schedule.recurrence),
    },
  };

  return { item: advanced, occurrence };
}

export interface AccrueContext {
  now: Timestamp;
  /** Produces a fresh unique id for each generated occurrence. */
  makeId: () => string;
}

/**
 * Automatic catch-up: for a RECURRING item, log a `charged` occurrence for every
 * due date that has arrived (≤ `asOf`), advancing `nextChargeDate` one cycle
 * each time. Returns the advanced item plus the occurrences to append to the
 * ledger. Emits nothing if the next charge is still in the future. Non-recurring
 * items pass through untouched. Pure — id/clock are injected.
 */
export function accrueDueOccurrences(
  item: PaymentItem,
  asOf: CalendarDate,
  ctx: AccrueContext,
): { item: PaymentItem; occurrences: PaymentOccurrence[] } {
  if (item.schedule.kind !== "RECURRING") {
    return { item, occurrences: [] };
  }

  let schedule = item.schedule;
  const { endDate } = schedule;
  // Never accrue past the subscription's end date.
  const limit = endDate && endDate < asOf ? endDate : asOf;
  const occurrences: PaymentOccurrence[] = [];

  // CalendarDate is YYYY-MM-DD, so string comparison is chronological.
  while (schedule.nextChargeDate <= limit) {
    const due = schedule.nextChargeDate;
    occurrences.push({
      id: ctx.makeId(),
      paymentItemId: item.id,
      dueDate: due,
      chargedDate: due,
      paidDate: due,
      paidFromAccountId: item.accountId,
      recordedAt: ctx.now,
      amount: schedule.amount,
      status: "charged",
    });
    schedule = { ...schedule, nextChargeDate: addRecurrence(due, schedule.recurrence) };
  }

  // The plan is finished once the cursor has moved past its end date.
  const completed = endDate !== undefined && schedule.nextChargeDate > endDate;

  if (occurrences.length === 0 && !completed) {
    return { item, occurrences };
  }

  return {
    item: {
      ...item,
      schedule,
      updatedAt: ctx.now,
      status: completed ? "completed" : item.status,
    },
    occurrences,
  };
}
