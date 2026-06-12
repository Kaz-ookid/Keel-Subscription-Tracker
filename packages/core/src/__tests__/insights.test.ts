import { describe, expect, it } from "vitest";
import {
  calendarDate,
  forecastByMonth,
  fromMajor,
  groupByCadence,
  groupByCategory,
  makeInstallmentPaymentItem,
  makeRecurringPaymentItem,
  markNextInstallmentPaid,
  now,
  pausePaymentItem,
  recordRecurringPayment,
  RECURRENCE_PRESETS,
  skipRecurringPayment,
  spendingByMonth,
  summarizePriceChanges,
  updateRecurringPaymentItem,
  yearlyCommitment,
  yearlyEquivalent,
} from "../index";
import type { NewRecurringInput, PaymentOccurrence } from "../index";

const eur = (major: number) => fromMajor(major, "EUR");

const netflix: NewRecurringInput = {
  name: "Netflix",
  amount: eur(15.99),
  recurrence: RECURRENCE_PRESETS.MONTHLY,
  firstChargeDate: calendarDate("2026-01-15"),
  settlementMode: "automatic",
};

const licence: NewRecurringInput = {
  name: "Licence",
  amount: eur(220),
  recurrence: RECURRENCE_PRESETS.YEARLY,
  firstChargeDate: calendarDate("2026-09-01"),
  settlementMode: "manual",
};

const ids = () => {
  let n = 0;
  return () => `i-${++n}`;
};

describe("yearlyEquivalent", () => {
  it("scales by occurrences per year", () => {
    expect(yearlyEquivalent(eur(10), RECURRENCE_PRESETS.MONTHLY)).toEqual(eur(120));
    expect(yearlyEquivalent(eur(220), RECURRENCE_PRESETS.YEARLY)).toEqual(eur(220));
    expect(yearlyEquivalent(eur(50), RECURRENCE_PRESETS.QUARTERLY)).toEqual(eur(200));
    // 10 € weekly → 10 × 365.25/7 = 521.79 €/yr
    expect(yearlyEquivalent(eur(10), RECURRENCE_PRESETS.WEEKLY)).toEqual(eur(521.79));
  });
});

describe("forecastByMonth", () => {
  it("buckets real charges by month, keeping empty months", () => {
    const sub = makeRecurringPaymentItem(netflix, { id: "r1", now: now() });
    const fee = makeRecurringPaymentItem(licence, { id: "r2", now: now() });

    const buckets = forecastByMonth([sub, fee], calendarDate("2026-06-12"), 12);
    expect(buckets).toHaveLength(12);
    expect(buckets[0].monthStart).toBe("2026-06-01");
    expect(buckets[11].monthStart).toBe("2027-05-01");

    // September = Netflix + the yearly licence; other months = Netflix alone.
    const september = buckets.find((b) => b.monthStart === "2026-09-01");
    expect(september?.totals).toEqual([eur(235.99)]);
    const october = buckets.find((b) => b.monthStart === "2026-10-01");
    expect(october?.totals).toEqual([eur(15.99)]);
  });

  it("includes installments in their months and nothing after the plan ends", () => {
    const plan = makeInstallmentPaymentItem(
      {
        name: "Sofa",
        totalAmount: eur(300),
        numberOfInstallments: 3,
        recurrence: RECURRENCE_PRESETS.MONTHLY,
        firstInstallmentDate: calendarDate("2026-07-10"),
        settlementMode: "manual",
      },
      { id: "p1", now: now(), makeId: ids() },
    );

    const buckets = forecastByMonth([plan], calendarDate("2026-06-12"), 6);
    expect(buckets.map((b) => b.totals[0]?.amount ?? 0)).toEqual([0, 10000, 10000, 10000, 0, 0]);
  });
});

describe("spendingByMonth (ledger actuals + projections)", () => {
  it("keeps past months from the ledger even after the item is paused", () => {
    // Manual sub billing since January, paid Jan-Mar, then paused.
    let item = makeRecurringPaymentItem(
      { ...netflix, settlementMode: "manual", firstChargeDate: calendarDate("2026-01-15") },
      { id: "r1", now: now() },
    );
    const ledger: PaymentOccurrence[] = [];
    for (const d of ["2026-01-15", "2026-02-15", "2026-03-15"]) {
      const { item: advanced, occurrence } = recordRecurringPayment(item, {
        id: `occ-${d}`,
        paidDate: calendarDate(d),
        now: now(),
      });
      item = advanced;
      ledger.push(occurrence);
    }
    const paused = pausePaymentItem(item, { now: now() });

    const buckets = spendingByMonth([paused], ledger, calendarDate("2026-01-01"), 6);
    // Jan-Mar stay exactly as paid; the paused item projects nothing ahead.
    expect(buckets.map((b) => b.totals[0]?.amount ?? 0)).toEqual([1599, 1599, 1599, 0, 0, 0]);
  });

  it("shows an unpaid manual charge in the month it was due, without double-counting paid ones", () => {
    // Billing since April, only April was ticked off — May/June still owed.
    let item = makeRecurringPaymentItem(
      { ...netflix, settlementMode: "manual", firstChargeDate: calendarDate("2026-04-15") },
      { id: "r1", now: now() },
    );
    const { item: advanced, occurrence } = recordRecurringPayment(item, {
      id: "occ-1",
      paidDate: calendarDate("2026-04-15"),
      now: now(),
    });
    item = advanced;

    const buckets = spendingByMonth([item], [occurrence], calendarDate("2026-04-01"), 3);
    // April once (ledger), May and June once each (projection of the overdue).
    expect(buckets.map((b) => b.totals[0]?.amount ?? 0)).toEqual([1599, 1599, 1599]);
  });

  it("keeps a paid installment in its month (plan-side payment, no ledger entry)", () => {
    let plan = makeInstallmentPaymentItem(
      {
        name: "Sofa",
        totalAmount: eur(300),
        numberOfInstallments: 3,
        recurrence: RECURRENCE_PRESETS.MONTHLY,
        firstInstallmentDate: calendarDate("2026-06-10"),
        settlementMode: "manual",
      },
      { id: "p1", now: now(), makeId: ids() },
    );
    plan = markNextInstallmentPaid(plan, { paidDate: calendarDate("2026-06-10"), now: now() });

    const buckets = spendingByMonth([plan], [], calendarDate("2026-06-01"), 3);
    // June stays at 100 (now as a paid installment), July/August projected.
    expect(buckets.map((b) => b.totals[0]?.amount ?? 0)).toEqual([10000, 10000, 10000]);
  });

  it("leaves a skipped cycle out of the totals while later months stay projected", () => {
    // 500/mo "stocks investment" since April; April paid, May deliberately skipped.
    let item = makeRecurringPaymentItem(
      {
        ...netflix,
        name: "Stocks",
        amount: eur(500),
        settlementMode: "manual",
        firstChargeDate: calendarDate("2026-04-15"),
      },
      { id: "r1", now: now() },
    );
    const ledger = [];
    const paid = recordRecurringPayment(item, {
      id: "occ-1",
      paidDate: calendarDate("2026-04-15"),
      now: now(),
    });
    item = paid.item;
    ledger.push(paid.occurrence);
    const skipped = skipRecurringPayment(item, { id: "occ-2", now: now() });
    item = skipped.item;
    ledger.push(skipped.occurrence);

    expect(skipped.occurrence.status).toBe("skipped");
    const buckets = spendingByMonth([item], ledger, calendarDate("2026-04-01"), 3);
    // April spent, May genuinely empty, June projected again.
    expect(buckets.map((b) => b.totals[0]?.amount ?? 0)).toEqual([50000, 0, 50000]);
  });

  it("excludes refunded and failed ledger events", () => {
    const refund: PaymentOccurrence = {
      id: "occ-r",
      paymentItemId: "x",
      dueDate: calendarDate("2026-02-10"),
      recordedAt: now(),
      amount: eur(50),
      status: "refunded",
    };
    const buckets = spendingByMonth([], [refund], calendarDate("2026-02-01"), 1);
    expect(buckets[0].totals).toEqual([]);
  });
});

describe("groupByCadence", () => {
  it("groups live recurring items by cadence with both equivalents, sorted by yearly weight", () => {
    const a = makeRecurringPaymentItem(netflix, { id: "r1", now: now() });
    const b = makeRecurringPaymentItem(
      { ...netflix, name: "Spotify", amount: eur(9.99) },
      { id: "r2", now: now() },
    );
    const c = makeRecurringPaymentItem(licence, { id: "r3", now: now() });

    const groups = groupByCadence([a, b, c], calendarDate("2026-06-12"));
    expect(groups).toHaveLength(2);
    // Monthly group (25.98/mo → 311.76/yr) outweighs the yearly licence (220/yr).
    expect(groups[0].recurrence).toEqual(RECURRENCE_PRESETS.MONTHLY);
    expect(groups[0].count).toBe(2);
    expect(groups[0].monthlyTotal).toEqual([eur(25.98)]);
    expect(groups[0].yearlyTotal).toEqual([eur(311.76)]);
    expect(groups[1].recurrence).toEqual(RECURRENCE_PRESETS.YEARLY);
    expect(groups[1].monthlyTotal).toEqual([eur(18.33)]);
  });

  it("excludes ended and paused items", () => {
    const ended = makeRecurringPaymentItem(
      {
        ...netflix,
        firstChargeDate: calendarDate("2025-01-15"),
        endDate: calendarDate("2026-01-15"),
      },
      { id: "r1", now: now() },
    );
    const paused = {
      ...makeRecurringPaymentItem(netflix, { id: "r2", now: now() }),
      status: "paused" as const,
    };
    expect(groupByCadence([ended, paused], calendarDate("2026-06-12"))).toEqual([]);
  });
});

describe("groupByCategory", () => {
  it("splits theory spend per category, uncategorised in its own bucket", () => {
    const a = makeRecurringPaymentItem(
      { ...netflix, categoryId: "streaming" },
      { id: "r1", now: now() },
    );
    const b = makeRecurringPaymentItem(
      { ...netflix, name: "Spotify", amount: eur(9.99), categoryId: "streaming" },
      { id: "r2", now: now() },
    );
    const c = makeRecurringPaymentItem(
      { ...licence, categoryId: undefined },
      { id: "r3", now: now() },
    );

    const groups = groupByCategory([a, b, c], calendarDate("2026-06-12"));
    expect(groups).toHaveLength(2);
    expect(groups[0].categoryId).toBe("streaming"); // 25.98/mo outweighs 18.33/mo
    expect(groups[0].count).toBe(2);
    expect(groups[0].monthlyTotal).toEqual([eur(25.98)]);
    expect(groups[1].categoryId).toBeUndefined();
    expect(groups[1].yearlyTotal).toEqual([eur(220)]);
  });
});

describe("summarizePriceChanges", () => {
  it("measures the drift from signup price, worst first", () => {
    const base = makeRecurringPaymentItem(netflix, { id: "r1", now: now() });
    // 15.99 → 19.99: two edits, one of which changes the price.
    const renamed = updateRecurringPaymentItem(
      base,
      { ...netflix, name: "Netflix 4K" },
      { now: now() },
    );
    const raised = updateRecurringPaymentItem(
      renamed,
      { ...netflix, name: "Netflix 4K", amount: eur(19.99) },
      { now: now() },
    );
    const stable = makeRecurringPaymentItem(
      { ...netflix, name: "Spotify", amount: eur(9.99) },
      { id: "r2", now: now() },
    );

    const changes = summarizePriceChanges([raised, stable], calendarDate("2026-06-12"));
    expect(changes).toHaveLength(1); // unchanged prices don't appear
    expect(changes[0].name).toBe("Netflix 4K");
    expect(changes[0].changes).toBe(1);
    expect(changes[0].original).toEqual(eur(15.99));
    expect(changes[0].current).toEqual(eur(19.99));
    expect(changes[0].changeRatio).toBeCloseTo(0.25, 2);
    expect(changes[0].monthlyCurrent).toEqual(eur(19.99));
  });
});

describe("yearlyCommitment", () => {
  it("sums yearly equivalents per currency", () => {
    const a = makeRecurringPaymentItem(netflix, { id: "r1", now: now() });
    const c = makeRecurringPaymentItem(licence, { id: "r2", now: now() });
    const usd = makeRecurringPaymentItem(
      { ...netflix, name: "iCloud", amount: fromMajor(2.99, "USD") },
      { id: "r3", now: now() },
    );

    expect(yearlyCommitment([a, c, usd], calendarDate("2026-06-12"))).toEqual([
      eur(411.88), // 15.99×12 + 220
      fromMajor(35.88, "USD"),
    ]);
  });
});
