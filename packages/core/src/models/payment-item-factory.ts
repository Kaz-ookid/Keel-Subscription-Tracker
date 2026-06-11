// Assembly + mutation logic for recurring payment items, kept in the core so
// the UI never hand-builds (or mis-builds) a PaymentItem. Pure: all
// non-determinism (id generation, "now") is injected via a context object, so
// these are trivially testable and identical across every platform.

import type { BnplProviderId } from "../constants/bnpl-providers";
import { splitMoney, type Money } from "../primitives/money";
import type { RecurrenceRule } from "../primitives/recurrence";
import type { ReminderRule } from "../primitives/reminder";
import { addRecurrence, alignToOccurrence, nextDueDate } from "../primitives/schedule-dates";
import { calendarDate, type CalendarDate, type Timestamp } from "../primitives/temporal";
import {
  COVERED_INSTALLMENT_STATUSES,
  type Installment,
  type InstallmentStatus,
} from "./installment";
import type {
  InstallmentSchedule,
  PaymentItem,
  RecurringSchedule,
  SettlementMode,
} from "./payment-item";
import type { PaymentOccurrence } from "./payment-occurrence";

/** The user-supplied shape behind the "new subscription" form. */
export interface NewRecurringInput {
  name: string;
  amount: Money;
  recurrence: RecurrenceRule;
  firstChargeDate: CalendarDate;
  settlementMode: SettlementMode;
  accountId?: string;
  categoryId?: string;
  color?: string;
  reminder?: ReminderRule;
  notes?: string;
  endDate?: CalendarDate;
}

export interface MakeContext {
  id: string;
  now: Timestamp;
}

/** Build a valid, active RECURRING PaymentItem from form input. */
export function makeRecurringPaymentItem(
  input: NewRecurringInput,
  ctx: MakeContext,
): PaymentItem {
  const schedule: RecurringSchedule = {
    kind: "RECURRING",
    recurrence: input.recurrence,
    amount: input.amount,
    firstChargeDate: input.firstChargeDate,
    // The first charge hasn't happened yet, so the next one due IS the first.
    nextChargeDate: input.firstChargeDate,
    // The end date is a *last billing* date, so it must sit on the billing
    // grid — snap it to the latest occurrence ≤ the supplied date. Updates
    // rebuild through here, so editing the cycle realigns a stored end date.
    endDate: input.endDate
      ? alignToOccurrence(input.firstChargeDate, input.recurrence, input.endDate)
      : undefined,
    // Seed price history with the opening amount so later changes stay accurate.
    priceHistory: [{ amount: input.amount, effectiveFrom: input.firstChargeDate }],
  };

  return {
    id: ctx.id,
    name: input.name,
    settlementMode: input.settlementMode,
    accountId: input.accountId,
    categoryId: input.categoryId,
    color: input.color,
    reminder: input.reminder,
    notes: input.notes,
    scheduleType: "RECURRING",
    schedule,
    status: "active",
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
}

/** The user-supplied shape behind the "Pay in X" (BNPL) form. */
export interface NewInstallmentInput {
  name: string;
  totalAmount: Money;
  numberOfInstallments: number;
  recurrence: RecurrenceRule;
  firstInstallmentDate: CalendarDate;
  provider?: BnplProviderId;
  settlementMode: SettlementMode;
  accountId?: string;
  categoryId?: string;
  color?: string;
  reminder?: ReminderRule;
  notes?: string;
}

export interface MakeInstallmentContext {
  id: string;
  now: Timestamp;
  /** Produces a fresh unique id for each generated installment. */
  makeId: () => string;
}

/**
 * Build an active INSTALLMENT (BNPL) PaymentItem from form input. Generates the
 * N individual installments up front — the explicit list is what makes
 * "following the X payments" easy. Amounts are an even `splitMoney` of the
 * total (summing back exactly); due dates step from the first by the recurrence.
 */
export function makeInstallmentPaymentItem(
  input: NewInstallmentInput,
  ctx: MakeInstallmentContext,
): PaymentItem {
  const n = Math.max(1, Math.floor(input.numberOfInstallments));
  const parts = splitMoney(input.totalAmount, n);

  const installments: Installment[] = [];
  let due = input.firstInstallmentDate;
  for (let i = 0; i < n; i++) {
    installments.push({
      id: ctx.makeId(),
      installmentScheduleId: ctx.id,
      index: i + 1,
      dueDate: due,
      amount: parts[i],
      status: "upcoming",
    });
    due = addRecurrence(due, input.recurrence);
  }

  const schedule: InstallmentSchedule = {
    kind: "INSTALLMENT",
    totalAmount: input.totalAmount,
    numberOfInstallments: n,
    recurrence: input.recurrence,
    firstInstallmentDate: input.firstInstallmentDate,
    installments,
    provider: input.provider,
  };

  return {
    id: ctx.id,
    name: input.name,
    settlementMode: input.settlementMode,
    accountId: input.accountId,
    categoryId: input.categoryId,
    color: input.color,
    reminder: input.reminder,
    notes: input.notes,
    scheduleType: "INSTALLMENT",
    schedule,
    status: "active",
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
}

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
 * Apply edits to an INSTALLMENT item, preserving `id` + `createdAt`. The schedule
 * and its installments are regenerated from the new input (fine while no
 * installment is marked paid). Throws if `existing` isn't an installment plan.
 */
export function updateInstallmentPaymentItem(
  existing: PaymentItem,
  input: NewInstallmentInput,
  ctx: UpdateInstallmentContext,
): PaymentItem {
  if (existing.schedule.kind !== "INSTALLMENT") {
    throw new TypeError("updateInstallmentPaymentItem expects an INSTALLMENT item");
  }
  const rebuilt = makeInstallmentPaymentItem(input, {
    id: existing.id,
    now: ctx.now,
    makeId: ctx.makeId,
  });
  return { ...rebuilt, createdAt: existing.createdAt };
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
