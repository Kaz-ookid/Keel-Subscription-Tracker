// Insights calculations: the "full picture" numbers. Two kinds of truth that
// must never be conflated —
//   REAL:   what actually leaves the pocket in a given month, projected from
//           the schedules (spendingByMonth);
//   THEORY: what life costs per month/year once yearly/quarterly items are
//           spread out (equivalents, cadence groups, yearlyCommitment).
// All pure functions of items + a date, like the rest of the core.

import { money, sumByCurrency, type Money } from "../primitives/money";
import type { RecurrenceRule } from "../primitives/recurrence";
import { addRecurrence, endOfMonth } from "../primitives/schedule-dates";
import { calendarDate, type CalendarDate } from "../primitives/temporal";
import { COVERED_INSTALLMENT_STATUSES } from "../models/installment";
import {
  effectiveRecurringAmount,
  isInstallmentSchedule,
  isRecurringSchedule,
  type PaymentItem,
  type PriceHistoryEntry,
  type RecurringSchedule,
} from "../models/payment-item";
import { isPaymentItemEnded } from "../models/payment-item-status";
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

export interface CategorySpendingItem {
  paymentItemId: string;
  name: string;
  color?: string;
  domain?: string;
  icon?: string;
  /** This item's real money in the window, one total per currency. */
  totals: Money[];
}

export interface CategorySpending {
  categoryId?: string;
  /** The category's real money in the window, one total per currency. */
  totals: Money[];
  /** Who contributed, largest first (by primary-currency amount). */
  items: CategorySpendingItem[];
}

/**
 * REAL money per category over a date window — the same three sources as
 * `spendingByMonth` (ledger actuals + covered installments + projections, by
 * construction never double-counting), attributed to each item's category.
 * Pay-in-X installments land in their item's own category: the donut answers
 * "where does the money GO", and a financed purchase is still that purchase —
 * the financing mechanism has its own card elsewhere. Categories and the
 * items inside them come back largest-first.
 */
export function spendingByCategory(
  items: readonly PaymentItem[],
  occurrences: readonly PaymentOccurrence[],
  from: CalendarDate,
  until: CalendarDate,
): CategorySpending[] {
  const inWindow = (date: CalendarDate) => date >= from && date <= until;
  const byId = new Map(items.map((i) => [i.id, i]));

  // Every real amount in the window, attributed to its item.
  const contributions: { item: PaymentItem; amount: Money }[] = [
    ...occurrences.flatMap((o) => {
      if (o.status !== "charged" || !inWindow(o.dueDate)) return [];
      const item = byId.get(o.paymentItemId);
      return item ? [{ item, amount: o.amount }] : [];
    }),
    ...items.flatMap((item) =>
      isInstallmentSchedule(item.schedule)
        ? item.schedule.installments
            .filter((i) => COVERED_INSTALLMENT_STATUSES.includes(i.status) && inWindow(i.dueDate))
            .map((i) => ({ item, amount: i.amount }))
        : [],
    ),
    ...projectCharges(items, until).flatMap((c) => {
      if (!inWindow(c.dueDate)) return [];
      const item = byId.get(c.paymentItemId);
      return item ? [{ item, amount: c.amount }] : [];
    }),
  ];

  const perItem = new Map<string, { item: PaymentItem; amounts: Money[] }>();
  for (const { item, amount } of contributions) {
    const entry = perItem.get(item.id);
    if (entry) entry.amounts.push(amount);
    else perItem.set(item.id, { item, amounts: [amount] });
  }

  const groups = new Map<string, CategorySpending>();
  for (const { item, amounts } of perItem.values()) {
    const key = item.categoryId ?? "";
    const itemEntry: CategorySpendingItem = {
      paymentItemId: item.id,
      name: item.name,
      color: item.color,
      domain: item.domain,
      icon: item.icon,
      totals: sumByCurrency(amounts),
    };
    const group = groups.get(key);
    if (group) {
      group.items.push(itemEntry);
      group.totals = sumByCurrency([...group.totals, ...itemEntry.totals]);
    } else {
      groups.set(key, {
        categoryId: item.categoryId,
        totals: itemEntry.totals,
        items: [itemEntry],
      });
    }
  }

  const primary = (totals: Money[]) => totals[0]?.amount ?? 0;
  const result = Array.from(groups.values());
  for (const g of result) g.items.sort((a, b) => primary(b.totals) - primary(a.totals));
  return result.sort((a, b) => primary(b.totals) - primary(a.totals));
}

/** The three billing-cadence buckets shown in Insights. */
export type CadenceKind = "monthly" | "yearly" | "other";

/** Classify a recurrence into a bucket: plain monthly, plain yearly, or
 *  everything else ("other" — every 2 months, weekly, quarterly…). Shared by
 *  groupByCadence and the UI so members bucket identically. */
export function cadenceBucket(recurrence: RecurrenceRule): CadenceKind {
  if (recurrence.interval === 1 && recurrence.unit === "month") return "monthly";
  if (recurrence.interval === 1 && recurrence.unit === "year") return "yearly";
  return "other";
}

export interface CadenceGroup {
  /** Which cadence bucket this is — drives the section label. */
  kind: CadenceKind;
  /** How many live recurring items fall in this bucket. */
  count: number;
  /** The bucket's per-month equivalent, one total per currency. */
  monthlyTotal: Money[];
  /** The bucket's per-year equivalent, one total per currency. */
  yearlyTotal: Money[];
}

function liveRecurring(
  items: readonly PaymentItem[],
  asOf: CalendarDate,
): { item: PaymentItem; schedule: RecurringSchedule }[] {
  return items.flatMap((item) => {
    if (item.status !== "active" || isPaymentItemEnded(item, asOf)) return [];
    if (!isRecurringSchedule(item.schedule)) return [];
    return [{ item, schedule: item.schedule }];
  });
}

/**
 * Recurring spend grouped into three billing-cadence buckets — Monthly, Yearly
 * and Other (everything else) — with each bucket's monthly and yearly
 * equivalents, in that fixed order. Empty buckets are omitted. Pay-in-X is
 * surfaced separately by the UI.
 */
export function groupByCadence(items: readonly PaymentItem[], asOf: CalendarDate): CadenceGroup[] {
  const groups = new Map<CadenceKind, CadenceGroup>();

  for (const { schedule } of liveRecurring(items, asOf)) {
    const { recurrence } = schedule;
    // The price in force today, not the intro price a trial started at.
    const amount = effectiveRecurringAmount(schedule, asOf);
    const kind = cadenceBucket(recurrence);
    const monthly = monthlyEquivalent(amount, recurrence);
    const yearly = yearlyEquivalent(amount, recurrence);
    const existing = groups.get(kind);
    if (existing) {
      existing.count += 1;
      existing.monthlyTotal = sumByCurrency([...existing.monthlyTotal, monthly]);
      existing.yearlyTotal = sumByCurrency([...existing.yearlyTotal, yearly]);
    } else {
      groups.set(kind, { kind, count: 1, monthlyTotal: [monthly], yearlyTotal: [yearly] });
    }
  }

  const order: CadenceKind[] = ["monthly", "yearly", "other"];
  return order.flatMap((kind) => {
    const group = groups.get(kind);
    return group ? [group] : [];
  });
}

/** THEORY: what a year of all live recurring items costs, per currency. */
export function yearlyCommitment(items: readonly PaymentItem[], asOf: CalendarDate): Money[] {
  return sumByCurrency(
    liveRecurring(items, asOf).map(({ schedule }) =>
      yearlyEquivalent(effectiveRecurringAmount(schedule, asOf), schedule.recurrence),
    ),
  );
}

export interface PriceChangeSummary {
  paymentItemId: string;
  name: string;
  categoryId?: string;
  color?: string;
  domain?: string;
  icon?: string;
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
      const current = effectiveRecurringAmount(schedule, asOf);
      return {
        paymentItemId: item.id,
        name: item.name,
        categoryId: item.categoryId,
        color: item.color,
        domain: item.domain,
        icon: item.icon,
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
