import { describe, expect, it } from "vitest";
import {
  calendarDate,
  endOfMonth,
  fromMajor,
  makeInstallmentPaymentItem,
  makeRecurringPaymentItem,
  markNextInstallmentPaid,
  monthlyEquivalent,
  now,
  projectCharges,
  projectItemCharges,
  recordRecurringPayment,
  RECURRENCE_PRESETS,
  sumByCurrency,
  summarizeCommitments,
} from "../index";
import type { NewInstallmentInput, NewRecurringInput, PaymentItem } from "../index";

const netflix: NewRecurringInput = {
  name: "Netflix",
  amount: fromMajor(15.99, "EUR"),
  recurrence: RECURRENCE_PRESETS.MONTHLY,
  firstChargeDate: calendarDate("2026-06-15"),
  settlementMode: "automatic",
  accountId: "acc-1",
};

const kPlan: NewInstallmentInput = {
  name: "Sofa (Klarna 3x)",
  totalAmount: fromMajor(300, "EUR"),
  numberOfInstallments: 3,
  recurrence: RECURRENCE_PRESETS.MONTHLY,
  firstInstallmentDate: calendarDate("2026-06-10"),
  settlementMode: "manual",
};

const ids = (prefix: string) => {
  let n = 0;
  return () => `${prefix}-${++n}`;
};

describe("projectItemCharges — recurring", () => {
  it("steps from the cursor through the window", () => {
    const item = makeRecurringPaymentItem(netflix, { id: "r1", now: now() });
    const charges = projectItemCharges(item, calendarDate("2026-08-31"));
    expect(charges.map((c) => c.dueDate)).toEqual(["2026-06-15", "2026-07-15", "2026-08-15"]);
    expect(charges[0]).toMatchObject({
      paymentItemId: "r1",
      name: "Netflix",
      accountId: "acc-1",
      settlementMode: "automatic",
      scheduleType: "RECURRING",
      amount: { amount: 1599, currency: "EUR" },
    });
  });

  it("excludes charges already recorded (the cursor is the lower bound)", () => {
    const item = makeRecurringPaymentItem(netflix, { id: "r1", now: now() });
    const { item: paid } = recordRecurringPayment(item, {
      id: "occ-1",
      paidDate: calendarDate("2026-06-15"),
      now: now(),
    });
    const charges = projectItemCharges(paid, calendarDate("2026-08-31"));
    expect(charges.map((c) => c.dueDate)).toEqual(["2026-07-15", "2026-08-15"]);
  });

  it("surfaces past-due charges of a manual item that fell behind", () => {
    const overdue = makeRecurringPaymentItem(
      { ...netflix, settlementMode: "manual", firstChargeDate: calendarDate("2026-04-01") },
      { id: "r2", now: now() },
    );
    const charges = projectItemCharges(overdue, calendarDate("2026-06-30"));
    expect(charges.map((c) => c.dueDate)).toEqual(["2026-04-01", "2026-05-01", "2026-06-01"]);
  });

  it("stops at the end date and skips non-active items", () => {
    const ending = makeRecurringPaymentItem(
      { ...netflix, endDate: calendarDate("2026-07-31") },
      { id: "r3", now: now() },
    );
    expect(projectItemCharges(ending, calendarDate("2026-12-31")).map((c) => c.dueDate)).toEqual([
      "2026-06-15",
      "2026-07-15",
    ]);

    const paused: PaymentItem = { ...ending, status: "paused" };
    expect(projectItemCharges(paused, calendarDate("2026-12-31"))).toEqual([]);
  });
});

describe("projectItemCharges — installments", () => {
  it("lists only uncovered installments inside the window, with index/count", () => {
    let item = makeInstallmentPaymentItem(kPlan, { id: "p1", now: now(), makeId: ids("i") });
    item = markNextInstallmentPaid(item, { paidDate: calendarDate("2026-06-10"), now: now() });

    const charges = projectItemCharges(item, calendarDate("2026-07-31"));
    expect(charges).toHaveLength(1); // July's; June is paid, August is past the window
    expect(charges[0]).toMatchObject({
      dueDate: "2026-07-10",
      installmentIndex: 2,
      installmentCount: 3,
      amount: { amount: 10000, currency: "EUR" },
    });
  });
});

describe("projectCharges", () => {
  it("merges items chronologically", () => {
    const sub = makeRecurringPaymentItem(netflix, { id: "r1", now: now() });
    const plan = makeInstallmentPaymentItem(kPlan, { id: "p1", now: now(), makeId: ids("i") });
    const charges = projectCharges([sub, plan], calendarDate("2026-07-31"));
    expect(charges.map((c) => `${c.dueDate} ${c.name}`)).toEqual([
      "2026-06-10 Sofa (Klarna 3x)",
      "2026-06-15 Netflix",
      "2026-07-10 Sofa (Klarna 3x)",
      "2026-07-15 Netflix",
    ]);
  });
});

describe("monthlyEquivalent", () => {
  const eur = (major: number) => fromMajor(major, "EUR");

  it("keeps plain monthly amounts exact", () => {
    expect(monthlyEquivalent(eur(15.99), RECURRENCE_PRESETS.MONTHLY)).toEqual(eur(15.99));
  });

  it("divides yearly by 12 and every-2-months by 2", () => {
    expect(monthlyEquivalent(eur(120), RECURRENCE_PRESETS.YEARLY)).toEqual(eur(10));
    expect(monthlyEquivalent(eur(50), { unit: "month", interval: 2 })).toEqual(eur(25));
  });

  it("uses calendar averages for weekly (≈4.35 weeks per month)", () => {
    // 10 € weekly → 10 × (365.25 / 7) / 12 = 43.48 €/month
    expect(monthlyEquivalent(eur(10), RECURRENCE_PRESETS.WEEKLY)).toEqual(eur(43.48));
  });
});

describe("sumByCurrency", () => {
  it("totals per currency in first-seen order", () => {
    expect(
      sumByCurrency([fromMajor(10, "EUR"), fromMajor(5, "USD"), fromMajor(2.5, "EUR")]),
    ).toEqual([fromMajor(12.5, "EUR"), fromMajor(5, "USD")]);
  });
});

describe("summarizeCommitments", () => {
  it("normalises live recurring spend and sums BNPL remainder", () => {
    const sub = makeRecurringPaymentItem(netflix, { id: "r1", now: now() });
    const yearly = makeRecurringPaymentItem(
      {
        ...netflix,
        name: "Licence",
        amount: fromMajor(120, "EUR"),
        recurrence: RECURRENCE_PRESETS.YEARLY,
      },
      { id: "r2", now: now() },
    );
    let plan = makeInstallmentPaymentItem(kPlan, { id: "p1", now: now(), makeId: ids("i") });
    plan = markNextInstallmentPaid(plan, { paidDate: calendarDate("2026-06-10"), now: now() });

    const summary = summarizeCommitments([sub, yearly, plan], calendarDate("2026-06-12"));
    expect(summary.monthly).toEqual([fromMajor(25.99, "EUR")]); // 15.99 + 120/12
    expect(summary.bnplOutstanding).toEqual([fromMajor(200, "EUR")]); // 1 of 3 paid

    // An ended subscription drops out of the commitment.
    const ended = makeRecurringPaymentItem(
      {
        ...netflix,
        endDate: calendarDate("2026-01-31"),
        firstChargeDate: calendarDate("2025-06-15"),
      },
      { id: "r3", now: now() },
    );
    const without = summarizeCommitments([sub, ended], calendarDate("2026-06-12"));
    expect(without.monthly).toEqual([fromMajor(15.99, "EUR")]);
  });
});

describe("endOfMonth", () => {
  it("returns the month's last day, February included", () => {
    expect(endOfMonth(calendarDate("2026-06-12"))).toBe("2026-06-30");
    expect(endOfMonth(calendarDate("2026-02-01"))).toBe("2026-02-28");
    expect(endOfMonth(calendarDate("2028-02-10"))).toBe("2028-02-29");
  });
});
