import { describe, expect, it } from "vitest";
import {
  calendarDate,
  forecastByMonth,
  fromMajor,
  groupByCadence,
  makeInstallmentPaymentItem,
  makeRecurringPaymentItem,
  now,
  RECURRENCE_PRESETS,
  yearlyCommitment,
  yearlyEquivalent,
} from "../index";
import type { NewRecurringInput } from "../index";

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
