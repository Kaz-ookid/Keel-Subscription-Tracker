// The calendar grid's data derivation, kept apart from the rendering: one
// month's charges on their due days (the list view's three sources — ledger,
// covered installments, projection — never double-counted) and the
// Monday-first week rows. Pure functions of core data; no React.

import {
  calendarDate,
  COVERED_INSTALLMENT_STATUSES,
  isInstallmentSchedule,
  projectCharges,
  type CalendarDate,
  type Money,
  type PaymentItem,
  type PaymentOccurrence,
} from "@keel/core";

export interface DayCharge {
  key: string;
  paymentItemId: string;
  name: string;
  dueDate: CalendarDate;
  amount: Money;
  domain?: string;
  color?: string;
  icon?: string;
  categoryId?: string;
  paid: boolean;
  overdue: boolean;
  installmentIndex?: number;
  installmentCount?: number;
  /** The grid date a weekend shift moved this charge from. */
  shiftedFrom?: CalendarDate;
}

/** Every charge of one month on its due day — the list view's three sources
 *  (ledger, covered installments, projection), never double-counted. */
export function monthCharges(
  items: readonly PaymentItem[],
  occurrences: readonly PaymentOccurrence[],
  monthKey: string,
  monthEnd: CalendarDate,
  asOf: CalendarDate,
): DayCharge[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return [
    ...occurrences.flatMap((o) => {
      if (o.status !== "charged" || o.dueDate.slice(0, 7) !== monthKey) return [];
      const item = byId.get(o.paymentItemId);
      if (!item) return [];
      return [
        {
          key: o.id,
          paymentItemId: item.id,
          name: item.name,
          dueDate: o.dueDate,
          amount: o.amount,
          domain: item.domain,
          color: item.color,
          icon: item.icon,
          categoryId: item.categoryId,
          paid: true,
          overdue: false,
        },
      ];
    }),
    ...items.flatMap((item) => {
      if (!isInstallmentSchedule(item.schedule)) return [];
      const count = item.schedule.installments.length;
      return item.schedule.installments
        .filter(
          (inst) =>
            COVERED_INSTALLMENT_STATUSES.includes(inst.status) &&
            inst.dueDate.slice(0, 7) === monthKey,
        )
        .map((inst) => ({
          key: inst.id,
          paymentItemId: item.id,
          name: item.name,
          dueDate: inst.dueDate,
          amount: inst.amount,
          domain: item.domain,
          color: item.color,
          icon: item.icon,
          categoryId: item.categoryId,
          paid: true,
          overdue: false,
          installmentIndex: inst.index,
          installmentCount: count,
        }));
    }),
    ...projectCharges(items, monthEnd)
      .filter((c) => c.dueDate.slice(0, 7) === monthKey)
      .map((c) => ({
        key: `${c.paymentItemId}-${c.dueDate}-${c.installmentIndex ?? 0}`,
        paymentItemId: c.paymentItemId,
        name: c.name,
        dueDate: c.dueDate,
        amount: c.amount,
        domain: c.domain,
        color: c.color,
        icon: c.icon,
        categoryId: c.categoryId,
        paid: false,
        overdue: c.dueDate < asOf,
        installmentIndex: c.installmentIndex,
        shiftedFrom: c.shiftedFrom,
        installmentCount: c.installmentCount,
      })),
  ];
}

/** Monday-first grid rows for a month: leading blanks, then every day. */
export function monthWeeks(
  monthStart: CalendarDate,
  monthEnd: CalendarDate,
): (CalendarDate | null)[][] {
  const y = Number(monthStart.slice(0, 4));
  const m = Number(monthStart.slice(5, 7));
  const monthKey = monthStart.slice(0, 7);
  const daysInMonth = Number(monthEnd.slice(8, 10));
  const leading = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const cells: (CalendarDate | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      calendarDate(`${monthKey}-${String(i + 1).padStart(2, "0")}`),
    ),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (CalendarDate | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}
