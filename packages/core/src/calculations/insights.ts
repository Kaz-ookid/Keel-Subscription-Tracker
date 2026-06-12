// Insights calculations: the "full picture" numbers. Two kinds of truth that
// must never be conflated —
//   REAL:   what actually leaves the pocket in a given month, projected from
//           the schedules (forecastByMonth);
//   THEORY: what life costs per month/year once yearly/quarterly items are
//           spread out (equivalents, cadence groups, yearlyCommitment).
// All pure functions of items + a date, like the rest of the core.

import { money, sumByCurrency, type Money } from "../primitives/money";
import type { RecurrenceRule } from "../primitives/recurrence";
import { addRecurrence, endOfMonth } from "../primitives/schedule-dates";
import { calendarDate, type CalendarDate } from "../primitives/temporal";
import { COVERED_INSTALLMENT_STATUSES } from "../models/installment";
import {
  isInstallmentSchedule,
  isRecurringSchedule,
  type PaymentItem,
  type PriceHistoryEntry,
  type RecurringSchedule,
} from "../models/payment-item";
import { isPaymentItemComplete } from "../models/payment-item-status";
import type { PaymentOccurrence } from "../models/payment-occurrence";
import { monthlyEquivalent, occurrencesPerYear, projectCharges } from "./forecast";

/** Theory: what one recurring item costs per average year. */
export function yearlyEquivalent(amount: Money, rule: RecurrenceRule): Money {
  return money(Math.round(amount.amount * occurrencesPerYear(rule)), amount.currency);
}

export interface MonthBucket {
  /** First day of the bucket's month. */
  monthStart: CalendarDate;
  /** Real projected outflow that month, one total per currency. */
  totals: Money[];
}

/**
 * REAL money month by month: every projected charge from `from`'s month
 * through `months` months, bucketed by due month. Months with nothing due are
 * present with empty totals, so a 12-month chart always has 12 bars.
 */
export function forecastByMonth(
  items: readonly PaymentItem[],
  from: CalendarDate,
  months: number,
): MonthBucket[] {
  const starts: CalendarDate[] = [];
  let start = calendarDate(`${from.slice(0, 7)}-01`);
  for (let i = 0; i < months; i++) {
    starts.push(start);
    start = addRecurrence(start, { unit: "month", interval: 1 });
  }

  const until = endOfMonth(starts[starts.length - 1]);
  const charges = projectCharges(items, until);

  return starts.map((monthStart) => {
    const key = monthStart.slice(0, 7);
    const inMonth = charges.filter((c) => c.dueDate.slice(0, 7) === key);
    return { monthStart, totals: sumByCurrency(inMonth.map((c) => c.amount)) };
  });
}

/**
 * The full picture per month: what was ACTUALLY paid (the occurrence ledger —
 * which survives pausing, editing, even ending an item — plus the covered
 * installments of Pay-in-X plans, whose payments live on the plan itself, not
 * in the ledger) plus what is still owed or upcoming (the projection). The
 * sides can never double-count: the ledger covers everything up to each
 * item's charge cursor, projections start at the cursor, and a covered
 * installment is by definition excluded from the projection. An unpaid
 * manual charge therefore stays visible in the month it was due — as
 * projection — until it's ticked off, when it moves to the actual side of
 * the same bucket.
 */
export function spendingByMonth(
  items: readonly PaymentItem[],
  occurrences: readonly PaymentOccurrence[],
  from: CalendarDate,
  months: number,
): MonthBucket[] {
  const starts: CalendarDate[] = [];
  let start = calendarDate(`${from.slice(0, 7)}-01`);
  for (let i = 0; i < months; i++) {
    starts.push(start);
    start = addRecurrence(start, { unit: "month", interval: 1 });
  }

  const until = endOfMonth(starts[starts.length - 1]);
  const projected = projectCharges(items, until);
  // Money actually moved: refunded/failed events don't count (edge case #8).
  const actuals = occurrences.filter((o) => o.status === "charged");
  const paidInstallments = items.flatMap((item) =>
    isInstallmentSchedule(item.schedule)
      ? item.schedule.installments.filter((i) => COVERED_INSTALLMENT_STATUSES.includes(i.status))
      : [],
  );

  return starts.map((monthStart) => {
    const key = monthStart.slice(0, 7);
    const amounts = [
      ...actuals.filter((o) => o.dueDate.slice(0, 7) === key).map((o) => o.amount),
      ...paidInstallments.filter((i) => i.dueDate.slice(0, 7) === key).map((i) => i.amount),
      ...projected.filter((c) => c.dueDate.slice(0, 7) === key).map((c) => c.amount),
    ];
    return { monthStart, totals: sumByCurrency(amounts) };
  });
}

export interface CadenceGroup {
  /** The shared cadence, e.g. { month, 1 } — label via `describeRecurrence`. */
  recurrence: RecurrenceRule;
  /** How many live recurring items bill on this cadence. */
  count: number;
  /** Theory: the group's per-month equivalent, one total per currency. */
  monthlyTotal: Money[];
  /** Theory: the group's per-year equivalent, one total per currency. */
  yearlyTotal: Money[];
}

function liveRecurring(
  items: readonly PaymentItem[],
  asOf: CalendarDate,
): { item: PaymentItem; schedule: RecurringSchedule }[] {
  return items.flatMap((item) => {
    if (item.status !== "active" || isPaymentItemComplete(item, asOf)) return [];
    if (!isRecurringSchedule(item.schedule)) return [];
    return [{ item, schedule: item.schedule }];
  });
}

/**
 * THEORY: the repartition of recurring spend by billing cadence — "Monthly ×6,
 * Yearly ×2, Every 3 months ×1" — with each group's monthly and yearly
 * equivalents. Sorted by yearly weight (largest first).
 */
export function groupByCadence(items: readonly PaymentItem[], asOf: CalendarDate): CadenceGroup[] {
  const groups = new Map<string, CadenceGroup>();

  for (const { schedule } of liveRecurring(items, asOf)) {
    const { recurrence, amount } = schedule;
    const key = `${recurrence.interval}-${recurrence.unit}`;
    const monthly = monthlyEquivalent(amount, recurrence);
    const yearly = yearlyEquivalent(amount, recurrence);
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.monthlyTotal = sumByCurrency([...existing.monthlyTotal, monthly]);
      existing.yearlyTotal = sumByCurrency([...existing.yearlyTotal, yearly]);
    } else {
      groups.set(key, {
        recurrence,
        count: 1,
        monthlyTotal: [monthly],
        yearlyTotal: [yearly],
      });
    }
  }

  return Array.from(groups.values()).sort(
    (a, b) => (b.yearlyTotal[0]?.amount ?? 0) - (a.yearlyTotal[0]?.amount ?? 0),
  );
}

/** THEORY: what a year of all live recurring items costs, per currency. */
export function yearlyCommitment(items: readonly PaymentItem[], asOf: CalendarDate): Money[] {
  return sumByCurrency(
    liveRecurring(items, asOf).map(({ schedule }) =>
      yearlyEquivalent(schedule.amount, schedule.recurrence),
    ),
  );
}

export interface CategoryGroup {
  /** Undefined = the uncategorised bucket. */
  categoryId?: string;
  count: number;
  /** Theory: the category's per-month equivalent, one total per currency. */
  monthlyTotal: Money[];
  /** Theory: the category's per-year equivalent, one total per currency. */
  yearlyTotal: Money[];
}

/**
 * THEORY: where the recurring money goes — per category, with monthly and
 * yearly equivalents. Sorted by yearly weight (largest first); items without
 * a category share one bucket at the end of wherever their weight lands.
 */
export function groupByCategory(
  items: readonly PaymentItem[],
  asOf: CalendarDate,
): CategoryGroup[] {
  const groups = new Map<string, CategoryGroup>();

  for (const { item, schedule } of liveRecurring(items, asOf)) {
    const key = item.categoryId ?? "";
    const monthly = monthlyEquivalent(schedule.amount, schedule.recurrence);
    const yearly = yearlyEquivalent(schedule.amount, schedule.recurrence);
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.monthlyTotal = sumByCurrency([...existing.monthlyTotal, monthly]);
      existing.yearlyTotal = sumByCurrency([...existing.yearlyTotal, yearly]);
    } else {
      groups.set(key, {
        categoryId: item.categoryId,
        count: 1,
        monthlyTotal: [monthly],
        yearlyTotal: [yearly],
      });
    }
  }

  return Array.from(groups.values()).sort(
    (a, b) => (b.yearlyTotal[0]?.amount ?? 0) - (a.yearlyTotal[0]?.amount ?? 0),
  );
}

export interface PriceChangeSummary {
  paymentItemId: string;
  name: string;
  categoryId?: string;
  color?: string;
  /** When the commitment started billing (the first price's effective date). */
  since: CalendarDate;
  /** How many times the price changed. */
  changes: number;
  original: Money;
  current: Money;
  /** Per-month equivalents of original/current — the creep in budget terms. */
  monthlyOriginal: Money;
  monthlyCurrent: Money;
  /** (current − original) / original; 0.24 = 24% more than at signup. */
  changeRatio: number;
  history: PriceHistoryEntry[];
}

/**
 * Price creep: every live recurring item whose price ever changed, with how
 * far it drifted from what the user signed up for. The data is `priceHistory`,
 * which edits append to — nothing extra is recorded for this. Sorted by drift
 * (worst first).
 */
export function summarizePriceChanges(
  items: readonly PaymentItem[],
  asOf: CalendarDate,
): PriceChangeSummary[] {
  return liveRecurring(items, asOf)
    .filter(({ schedule }) => schedule.priceHistory.length > 1)
    .map(({ item, schedule }) => {
      const history = schedule.priceHistory;
      const original = history[0].amount;
      const current = schedule.amount;
      return {
        paymentItemId: item.id,
        name: item.name,
        categoryId: item.categoryId,
        color: item.color,
        since: history[0].effectiveFrom,
        changes: history.length - 1,
        original,
        current,
        monthlyOriginal: monthlyEquivalent(original, schedule.recurrence),
        monthlyCurrent: monthlyEquivalent(current, schedule.recurrence),
        changeRatio: original.amount > 0 ? (current.amount - original.amount) / original.amount : 0,
        history: [...history],
      };
    })
    .sort((a, b) => b.changeRatio - a.changeRatio);
}
