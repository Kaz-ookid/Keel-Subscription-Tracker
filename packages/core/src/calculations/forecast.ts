// The forecast engine — the §7 calculation work. Pure projections of FUTURE
// money movement from the schedules (the occurrence ledger covers the past;
// "today" divides the two). Everything here is a pure function of items + a
// date, so every surface (timeline, per-account needs, headline numbers)
// derives from one source of truth and can never drift.

import { money, sumByCurrency, type Money } from "../primitives/money";
import type { RecurrenceRule } from "../primitives/recurrence";
import { addRecurrence } from "../primitives/schedule-dates";
import type { CalendarDate } from "../primitives/temporal";
import { COVERED_INSTALLMENT_STATUSES } from "../models/installment";
import {
  isInstallmentSchedule,
  isRecurringSchedule,
  type PaymentItem,
  type ScheduleType,
  type SettlementMode,
} from "../models/payment-item";
import { isPaymentItemComplete } from "../models/payment-item-status";
import { summarizeInstallmentPlan } from "../models/installment-plan";

/**
 * One charge a schedule says is still owed. Denormalised enough that a UI row
 * renders without lookups; ids are kept for actions.
 */
export interface ProjectedCharge {
  paymentItemId: string;
  name: string;
  dueDate: CalendarDate;
  amount: Money;
  accountId?: string;
  categoryId?: string;
  color?: string;
  settlementMode: SettlementMode;
  scheduleType: ScheduleType;
  /** For installments: "payment 3 of 4". */
  installmentIndex?: number;
  installmentCount?: number;
}

/**
 * Every charge `item` still owes up to and including `until`.
 *
 * RECURRING items step from the `nextChargeDate` cursor — the cursor is the
 * natural lower bound, so charges already recorded are excluded and an
 * unticked manual item naturally surfaces past-due (overdue) charges.
 * INSTALLMENT plans list their not-yet-covered installments. Non-active items
 * (paused/cancelled/completed) are never forecast (edge case #7).
 */
export function projectItemCharges(item: PaymentItem, until: CalendarDate): ProjectedCharge[] {
  if (item.status !== "active") return [];

  const base = {
    paymentItemId: item.id,
    name: item.name,
    accountId: item.accountId,
    categoryId: item.categoryId,
    color: item.color,
    settlementMode: item.settlementMode,
    scheduleType: item.scheduleType,
  };

  if (isRecurringSchedule(item.schedule)) {
    const { recurrence, amount, endDate } = item.schedule;
    const limit = endDate && endDate < until ? endDate : until;
    const charges: ProjectedCharge[] = [];
    let due = item.schedule.nextChargeDate;
    while (due <= limit) {
      charges.push({ ...base, dueDate: due, amount });
      due = addRecurrence(due, recurrence);
    }
    return charges;
  }

  if (isInstallmentSchedule(item.schedule)) {
    const count = item.schedule.installments.length;
    return item.schedule.installments
      .filter((i) => !COVERED_INSTALLMENT_STATUSES.includes(i.status) && i.dueDate <= until)
      .map((i) => ({
        ...base,
        dueDate: i.dueDate,
        amount: i.amount,
        installmentIndex: i.index,
        installmentCount: count,
      }));
  }

  // ONE_TIME_ANNUAL projection lands with the M3 smoothing work.
  return [];
}

/** All charges still owed across `items` up to `until`, chronologically. */
export function projectCharges(
  items: readonly PaymentItem[],
  until: CalendarDate,
): ProjectedCharge[] {
  return items
    .flatMap((item) => projectItemCharges(item, until))
    .sort((a, b) =>
      a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.name.localeCompare(b.name),
    );
}

// Average occurrences per year for each recurrence unit (calendar averages,
// so weekly ≈ 4.35/month rather than a naive 4).
const OCCURRENCES_PER_YEAR: Record<RecurrenceRule["unit"], number> = {
  day: 365.25,
  week: 365.25 / 7,
  month: 12,
  year: 1,
};

/**
 * Normalise a recurring amount to its per-month equivalent — the basis of the
 * "committed €X/month" headline and the M3 budget-smoothing view. Exact for
 * plain monthly; calendar-average rounding elsewhere.
 */
export function monthlyEquivalent(amount: Money, rule: RecurrenceRule): Money {
  const perYear = OCCURRENCES_PER_YEAR[rule.unit] / rule.interval;
  return money(Math.round((amount.amount * perYear) / 12), amount.currency);
}

export interface CommitmentSummary {
  /** Ongoing recurring spend, normalised per month, one total per currency. */
  monthly: Money[];
  /** What Pay-in-X plans still owe in total, one total per currency. */
  bnplOutstanding: Money[];
}

/** The two headline numbers: monthly commitment + BNPL still owed. */
export function summarizeCommitments(
  items: readonly PaymentItem[],
  asOf: CalendarDate,
): CommitmentSummary {
  const live = items.filter((i) => i.status === "active" && !isPaymentItemComplete(i, asOf));

  const monthly = sumByCurrency(
    live
      .filter((i) => isRecurringSchedule(i.schedule))
      .map((i) => {
        const s = i.schedule;
        if (!isRecurringSchedule(s)) throw new TypeError("unreachable");
        return monthlyEquivalent(s.amount, s.recurrence);
      }),
  );

  const bnplOutstanding = sumByCurrency(
    live
      .filter((i) => isInstallmentSchedule(i.schedule))
      .map((i) => {
        const s = i.schedule;
        if (!isInstallmentSchedule(s)) throw new TypeError("unreachable");
        return summarizeInstallmentPlan(s).remainingAmount;
      }),
  );

  return { monthly, bnplOutstanding };
}
