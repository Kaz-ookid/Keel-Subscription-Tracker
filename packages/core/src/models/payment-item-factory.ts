// Assembly + mutation logic for recurring payment items, kept in the core so
// the UI never hand-builds (or mis-builds) a PaymentItem. Pure: all
// non-determinism (id generation, "now") is injected via a context object, so
// these are trivially testable and identical across every platform.

import type { BnplProviderId } from "../constants/bnpl-providers";
import { splitMoney, type Money } from "../primitives/money";
import type { RecurrenceRule } from "../primitives/recurrence";
import type { ReminderRule } from "../primitives/reminder";
import { addRecurrence } from "../primitives/schedule-dates";
import type { CalendarDate, Timestamp } from "../primitives/temporal";
import type { Installment } from "./installment";
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
    endDate: input.endDate,
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
  const occurrences: PaymentOccurrence[] = [];

  // CalendarDate is YYYY-MM-DD, so string comparison is chronological.
  while (schedule.nextChargeDate <= asOf) {
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

  if (occurrences.length === 0) {
    return { item, occurrences };
  }

  return { item: { ...item, schedule, updatedAt: ctx.now }, occurrences };
}
