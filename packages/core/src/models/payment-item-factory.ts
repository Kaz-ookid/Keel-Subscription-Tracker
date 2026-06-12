// Factories that assemble a brand-new PaymentItem from form input, kept in the
// core so the UI never hand-builds (or mis-builds) one. Pure: all
// non-determinism (id generation, "now") is injected via a context object, so
// these are trivially testable and identical across every platform.
// State transitions of an existing item live in payment-item-mutations.ts.

import type { BnplProviderId } from "../constants/bnpl-providers";
import { splitMoney, type Money } from "../primitives/money";
import type { RecurrenceRule } from "../primitives/recurrence";
import type { ReminderRule } from "../primitives/reminder";
import { addRecurrence, alignToOccurrence, nthWeekdayOfMonth } from "../primitives/schedule-dates";
import type { CalendarDate, Timestamp } from "../primitives/temporal";

/** A weekday-anchored rule's grid must START on the anchor — snap the chosen
 *  first date to its month's anchored day (a no-op when already matching). */
function snapToAnchor(first: CalendarDate, recurrence: RecurrenceRule): CalendarDate {
  return recurrence.unit === "month" && recurrence.anchor
    ? nthWeekdayOfMonth(first, recurrence.anchor)
    : first;
}
import type { Installment } from "./installment";
import type {
  InstallmentSchedule,
  PaymentItem,
  RecurringSchedule,
  SettlementMode,
} from "./payment-item";

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
export function makeRecurringPaymentItem(input: NewRecurringInput, ctx: MakeContext): PaymentItem {
  const firstChargeDate = snapToAnchor(input.firstChargeDate, input.recurrence);
  const schedule: RecurringSchedule = {
    kind: "RECURRING",
    recurrence: input.recurrence,
    amount: input.amount,
    firstChargeDate,
    // The first charge hasn't happened yet, so the next one due IS the first.
    nextChargeDate: firstChargeDate,
    // The end date is a *last billing* date, so it must sit on the billing
    // grid — snap it to the latest occurrence ≤ the supplied date. Updates
    // rebuild through here, so editing the cycle realigns a stored end date.
    endDate: input.endDate
      ? alignToOccurrence(firstChargeDate, input.recurrence, input.endDate)
      : undefined,
    // Seed price history with the opening amount so later changes stay accurate.
    priceHistory: [{ amount: input.amount, effectiveFrom: firstChargeDate }],
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

  const firstInstallmentDate = snapToAnchor(input.firstInstallmentDate, input.recurrence);
  const installments: Installment[] = [];
  let due = firstInstallmentDate;
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
    firstInstallmentDate,
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
