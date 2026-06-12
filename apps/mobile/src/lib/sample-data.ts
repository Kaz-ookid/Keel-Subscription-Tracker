// Debug seed: a realistic household of commitments with REAL history and
// future, built through the same core functions the app uses (accrual fills
// the automatic ledger; manual months are paid/skipped one by one; BNPL plans
// are part-paid). Exercises every state the UI can show: overdue, paid fold,
// skip, pause, ended, finished plan, yearly spikes past and future, and a
// second currency.

import {
  accrueDueOccurrences,
  calendarDate,
  endOfMonth,
  makeAccount,
  makeInstallmentPaymentItem,
  makeRecurringPaymentItem,
  markNextInstallmentPaid,
  now,
  pausePaymentItem,
  recordRecurringPayment,
  skipRecurringPayment,
  today,
  type Account,
  type CalendarDate,
  type NewRecurringInput,
  type PaymentItem,
  type PaymentOccurrence,
} from "@keel/core";
import { randomUUID } from "expo-crypto";

export interface SampleData {
  items: PaymentItem[];
  occurrences: PaymentOccurrence[];
  accounts: Account[];
}

/** `delta` months from today's month, on `day` (clamped to month length). */
function monthShift(asOf: CalendarDate, delta: number, day: number): CalendarDate {
  const total = Number(asOf.slice(0, 4)) * 12 + (Number(asOf.slice(5, 7)) - 1) + delta;
  const y = Math.floor(total / 12);
  const m = String((total % 12) + 1).padStart(2, "0");
  const last = Number(endOfMonth(calendarDate(`${y}-${m}-01`)).slice(8, 10));
  return calendarDate(`${y}-${m}-${String(Math.min(day, last)).padStart(2, "0")}`);
}

export function buildSampleData(): SampleData {
  const asOf = today();
  const items: PaymentItem[] = [];
  const occurrences: PaymentOccurrence[] = [];

  const bcv = makeAccount(
    {
      name: "BCV",
      type: "checking",
      currency: "CHF",
      color: "#16A34A",
      icon: "building.columns.fill",
    },
    { id: randomUUID() },
  );
  const revolut = makeAccount(
    {
      name: "Revolut",
      type: "other",
      currency: "EUR",
      institution: "travel card",
      color: "#3B82F6",
      icon: "creditcard.fill",
    },
    { id: randomUUID() },
  );

  // Automatic items: accrual writes their real past into the ledger.
  const addAuto = (input: NewRecurringInput) => {
    const made = makeRecurringPaymentItem(input, { id: randomUUID(), now: now() });
    const { item, occurrences: accrued } = accrueDueOccurrences(made, asOf, {
      now: now(),
      makeId: randomUUID,
    });
    items.push(item);
    occurrences.push(...accrued);
    return item;
  };

  // Manual items: tick off month by month, exactly like a user would.
  const addManual = (input: NewRecurringInput, actions: ("pay" | "skip" | "stop")[]) => {
    let item = makeRecurringPaymentItem(input, { id: randomUUID(), now: now() });
    for (const action of actions) {
      if (action === "stop") break;
      if (action === "pay") {
        const r = recordRecurringPayment(item, {
          id: randomUUID(),
          paidDate: item.schedule.kind === "RECURRING" ? item.schedule.nextChargeDate : asOf,
          now: now(),
        });
        item = r.item;
        occurrences.push(r.occurrence);
      } else {
        const s = skipRecurringPayment(item, { id: randomUUID(), now: now() });
        item = s.item;
        occurrences.push(s.occurrence);
      }
    }
    items.push(item);
    return item;
  };

  const chf = (major: number) => ({ amount: Math.round(major * 100), currency: "CHF" as const });
  const eur = (major: number) => ({ amount: Math.round(major * 100), currency: "EUR" as const });
  const monthly = { unit: "month" as const, interval: 1 };
  const yearly = { unit: "year" as const, interval: 1 };

  addAuto({
    name: "Netflix",
    amount: chf(18.9),
    recurrence: monthly,
    firstChargeDate: monthShift(asOf, -14, 14),
    settlementMode: "automatic",
    accountId: bcv.id,
    categoryId: "streaming",
    color: "#EF4444",
  });

  addAuto({
    name: "Halle Fitness",
    amount: chf(49),
    recurrence: monthly,
    firstChargeDate: monthShift(asOf, -10, 1),
    settlementMode: "automatic",
    accountId: bcv.id,
    categoryId: "health",
    color: "#22C55E",
  });

  // Yearly, anniversary two months ago → a PAST spike in the chart.
  addAuto({
    name: "Serafe",
    amount: chf(335),
    recurrence: yearly,
    firstChargeDate: monthShift(asOf, -14, 20),
    settlementMode: "automatic",
    accountId: bcv.id,
    categoryId: "utilities",
    color: "#F59E0B",
  });

  // Yearly, due in three months → a FUTURE spike.
  addAuto({
    name: "Adobe Lightroom",
    amount: chf(65),
    recurrence: yearly,
    firstChargeDate: monthShift(asOf, 3, 8),
    settlementMode: "automatic",
    accountId: bcv.id,
    categoryId: "software",
    color: "#8B5CF6",
  });

  // Second currency, on the EUR account.
  addAuto({
    name: "iCloud+",
    amount: eur(2.99),
    recurrence: monthly,
    firstChargeDate: monthShift(asOf, -12, 7),
    settlementMode: "automatic",
    accountId: revolut.id,
    categoryId: "software",
    color: "#60A5FA",
  });

  // Manual, paid every month so far except the current one → due/overdue now.
  addManual(
    {
      name: "Spotify",
      amount: chf(10.9),
      recurrence: monthly,
      firstChargeDate: monthShift(asOf, -8, 3),
      settlementMode: "manual",
      categoryId: "streaming",
      color: "#10B981",
    },
    ["pay", "pay", "pay", "pay", "pay", "pay", "pay", "pay"],
  );

  // The flexible commitment: mostly paid, one month deliberately skipped.
  addManual(
    {
      name: "Stocks investment",
      amount: chf(500),
      recurrence: monthly,
      firstChargeDate: monthShift(asOf, -6, 28),
      settlementMode: "manual",
      categoryId: "other",
      color: "#0B1E3F",
    },
    ["pay", "pay", "skip", "pay", "pay"],
  );

  // BNPL in progress: 2 of 4 paid.
  let iphone = makeInstallmentPaymentItem(
    {
      name: "iPhone 16",
      totalAmount: chf(1199),
      numberOfInstallments: 4,
      recurrence: monthly,
      firstInstallmentDate: monthShift(asOf, -2, 10),
      provider: "other",
      settlementMode: "manual",
      categoryId: "communications",
      color: "#111827",
    },
    { id: randomUUID(), now: now(), makeId: randomUUID },
  );
  iphone = markNextInstallmentPaid(iphone, { paidDate: monthShift(asOf, -2, 10), now: now() });
  iphone = markNextInstallmentPaid(iphone, { paidDate: monthShift(asOf, -1, 10), now: now() });
  items.push(iphone);

  // BNPL finished: shows the "Done" state and counts in past months.
  let sofa = makeInstallmentPaymentItem(
    {
      name: "Sofa",
      totalAmount: chf(900),
      numberOfInstallments: 3,
      recurrence: monthly,
      firstInstallmentDate: monthShift(asOf, -4, 5),
      provider: "other",
      settlementMode: "manual",
      categoryId: "shopping",
      color: "#78350F",
    },
    { id: randomUUID(), now: now(), makeId: randomUUID },
  );
  for (let i = 0; i < 3; i++) {
    sofa = markNextInstallmentPaid(sofa, { paidDate: monthShift(asOf, -4 + i, 5), now: now() });
  }
  items.push(sofa);

  // Paused: kept, parked, excluded from forecasts.
  const gym = makeRecurringPaymentItem(
    {
      name: "Yoga studio",
      amount: chf(39),
      recurrence: monthly,
      firstChargeDate: monthShift(asOf, -5, 12),
      settlementMode: "manual",
      categoryId: "health",
      color: "#EC4899",
    },
    { id: randomUUID(), now: now() },
  );
  items.push(pausePaymentItem(gym, { now: now() }));

  // Ended two months ago: accrual logs its run, then completes it.
  addAuto({
    name: "Canal+",
    amount: chf(29.95),
    recurrence: monthly,
    firstChargeDate: monthShift(asOf, -9, 25),
    endDate: monthShift(asOf, -2, 25),
    settlementMode: "automatic",
    accountId: bcv.id,
    categoryId: "streaming",
    color: "#6B7280",
  });

  return { items, occurrences, accounts: [bcv, revolut] };
}
