import { describe, expect, it } from "vitest";
import {
  accrueDueOccurrences,
  calendarDate,
  canMarkNextInstallmentPaid,
  canMarkPaid,
  fromMajor,
  isInstallmentSchedule,
  isPaymentItemComplete,
  isRecurringSchedule,
  makeInstallmentPaymentItem,
  makeRecurringPaymentItem,
  markNextInstallmentPaid,
  now,
  pausePaymentItem,
  recordRecurringPayment,
  RECURRENCE_PRESETS,
  resumePaymentItem,
  rewindRecurringPayment,
  sumMoney,
  unmarkLastInstallmentPaid,
  updateInstallmentPaymentItem,
  updateRecurringPaymentItem,
} from "../index";
import type { NewInstallmentInput, NewRecurringInput } from "../index";

const input: NewRecurringInput = {
  name: "Netflix",
  amount: fromMajor(15.99, "EUR"),
  recurrence: RECURRENCE_PRESETS.MONTHLY,
  firstChargeDate: calendarDate("2026-01-15"),
  settlementMode: "manual",
};

describe("makeRecurringPaymentItem", () => {
  it("builds an active recurring item, seeding priceHistory and nextChargeDate", () => {
    const item = makeRecurringPaymentItem(input, { id: "item-1", now: now() });

    expect(item.status).toBe("active");
    expect(item.scheduleType).toBe("RECURRING");
    expect(item.settlementMode).toBe("manual");
    expect(item.accountId).toBeUndefined(); // manual → not pre-linked
    if (!isRecurringSchedule(item.schedule)) throw new Error("expected recurring");
    expect(item.schedule.nextChargeDate).toBe("2026-01-15");
    expect(item.schedule.priceHistory).toEqual([
      { amount: { amount: 1599, currency: "EUR" }, effectiveFrom: "2026-01-15" },
    ]);
  });

  it("snaps an off-grid end date down to the latest billing date", () => {
    // Bills monthly on the 15th — the 20th isn't a billing date.
    const item = makeRecurringPaymentItem(
      { ...input, endDate: calendarDate("2026-04-20") },
      { id: "item-1", now: now() },
    );
    if (!isRecurringSchedule(item.schedule)) throw new Error("expected recurring");
    expect(item.schedule.endDate).toBe("2026-04-15");
  });
});

describe("recordRecurringPayment", () => {
  it("logs a charged occurrence and advances the next due date by one cycle", () => {
    const item = makeRecurringPaymentItem(input, { id: "item-1", now: now() });

    const { item: advanced, occurrence } = recordRecurringPayment(item, {
      id: "occ-1",
      paidDate: calendarDate("2026-01-15"),
      now: now(),
      paidFromAccountId: "acc-checking",
    });

    expect(occurrence.status).toBe("charged");
    expect(occurrence.dueDate).toBe("2026-01-15");
    expect(occurrence.paidFromAccountId).toBe("acc-checking");
    expect(occurrence.amount).toEqual({ amount: 1599, currency: "EUR" });
    expect(occurrence.recordedAt).toBeTruthy(); // ledger audit timestamp

    if (!isRecurringSchedule(advanced.schedule)) throw new Error("expected recurring");
    expect(advanced.schedule.nextChargeDate).toBe("2026-02-15");
  });
});

describe("accrueDueOccurrences (automatic catch-up)", () => {
  const ids = () => {
    let n = 0;
    return () => `occ-${++n}`;
  };

  it("emits one occurrence per due date that has arrived and advances the schedule", () => {
    // First charge 2026-01-15, monthly, caught up as of 2026-03-20 → Jan, Feb, Mar.
    const item = makeRecurringPaymentItem(input, { id: "item-1", now: now() });
    const { item: advanced, occurrences } = accrueDueOccurrences(item, calendarDate("2026-03-20"), {
      now: now(),
      makeId: ids(),
    });

    expect(occurrences.map((o) => o.dueDate)).toEqual(["2026-01-15", "2026-02-15", "2026-03-15"]);
    expect(occurrences.every((o) => o.status === "charged")).toBe(true);
    if (!isRecurringSchedule(advanced.schedule)) throw new Error("expected recurring");
    expect(advanced.schedule.nextChargeDate).toBe("2026-04-15");
  });

  it("emits nothing when the first charge is still in the future", () => {
    const future: NewRecurringInput = { ...input, firstChargeDate: calendarDate("2026-12-01") };
    const item = makeRecurringPaymentItem(future, { id: "item-2", now: now() });
    const { item: same, occurrences } = accrueDueOccurrences(item, calendarDate("2026-06-08"), {
      now: now(),
      makeId: ids(),
    });

    expect(occurrences).toHaveLength(0);
    expect(same).toBe(item); // untouched
  });

  it("stops accruing at endDate and marks the item completed", () => {
    const item = makeRecurringPaymentItem(
      { ...input, settlementMode: "automatic", endDate: calendarDate("2026-03-31") },
      { id: "item-1", now: now() },
    );
    const { item: done, occurrences } = accrueDueOccurrences(item, calendarDate("2026-12-31"), {
      now: now(),
      makeId: ids(),
    });

    // Charges on Jan/Feb/Mar 15; Apr 15 is past the end date, so it's dropped.
    expect(occurrences.map((o) => o.dueDate)).toEqual(["2026-01-15", "2026-02-15", "2026-03-15"]);
    expect(done.status).toBe("completed");
  });
});

describe("makeInstallmentPaymentItem (BNPL)", () => {
  const ids = () => {
    let n = 0;
    return () => `inst-${++n}`;
  };

  it("generates N installments that step by the recurrence and sum to the total", () => {
    const item = makeInstallmentPaymentItem(
      {
        name: "iPhone (Klarna 3x)",
        totalAmount: fromMajor(300, "EUR"),
        numberOfInstallments: 3,
        recurrence: RECURRENCE_PRESETS.MONTHLY,
        firstInstallmentDate: calendarDate("2026-01-10"),
        provider: "klarna",
        settlementMode: "manual",
      },
      { id: "plan-1", now: now(), makeId: ids() },
    );

    expect(item.scheduleType).toBe("INSTALLMENT");
    if (item.schedule.kind !== "INSTALLMENT") throw new Error("expected installment");
    const s = item.schedule;

    expect(s.installments.map((i) => i.dueDate)).toEqual([
      "2026-01-10",
      "2026-02-10",
      "2026-03-10",
    ]);
    expect(s.installments.map((i) => i.index)).toEqual([1, 2, 3]);
    expect(s.installments.every((i) => i.status === "upcoming")).toBe(true);
    expect(s.installments.every((i) => i.installmentScheduleId === "plan-1")).toBe(true);
    expect(
      sumMoney(
        s.installments.map((i) => i.amount),
        "EUR",
      ),
    ).toEqual(s.totalAmount);
    expect(s.provider).toBe("klarna");
  });
});

describe("update helpers", () => {
  // input: Netflix, 15.99 EUR, monthly, first charge 2026-01-15, manual.

  it("keeps nextChargeDate (and id/createdAt) when the schedule is unchanged", () => {
    const existing = makeRecurringPaymentItem(input, { id: "item-1", now: now() });
    const edited = updateRecurringPaymentItem(
      existing,
      { ...input, name: "Renamed" },
      { now: now(), lastChargedDate: calendarDate("2026-04-15") },
    );
    expect(edited.id).toBe("item-1");
    expect(edited.createdAt).toBe(existing.createdAt);
    if (!isRecurringSchedule(edited.schedule)) throw new Error("expected recurring");
    expect(edited.schedule.nextChargeDate).toBe("2026-05-15"); // first monthly after last charge
  });

  it("moves nextChargeDate when the recurrence changes", () => {
    const existing = makeRecurringPaymentItem(input, { id: "item-1", now: now() });
    const edited = updateRecurringPaymentItem(
      existing,
      { ...input, recurrence: RECURRENCE_PRESETS.WEEKLY },
      { now: now(), lastChargedDate: calendarDate("2026-03-15") },
    );
    if (!isRecurringSchedule(edited.schedule)) throw new Error("expected recurring");
    expect(edited.schedule.nextChargeDate).toBe("2026-03-19"); // next weekly slot after last charge
  });

  it("sets nextChargeDate to the new first billing when nothing has been charged", () => {
    const existing = makeRecurringPaymentItem(input, { id: "item-1", now: now() });
    const edited = updateRecurringPaymentItem(
      existing,
      { ...input, firstChargeDate: calendarDate("2026-08-01") },
      { now: now() },
    );
    if (!isRecurringSchedule(edited.schedule)) throw new Error("expected recurring");
    expect(edited.schedule.nextChargeDate).toBe("2026-08-01");
  });

  it("appends a price-history entry only when the amount changes", () => {
    const existing = makeRecurringPaymentItem(input, { id: "item-1", now: now() });
    if (!isRecurringSchedule(existing.schedule)) throw new Error("expected recurring");
    expect(existing.schedule.priceHistory).toHaveLength(1);

    const renamed = updateRecurringPaymentItem(existing, { ...input, name: "x" }, { now: now() });
    if (!isRecurringSchedule(renamed.schedule)) throw new Error("expected recurring");
    expect(renamed.schedule.priceHistory).toHaveLength(1);

    const repriced = updateRecurringPaymentItem(
      existing,
      { ...input, amount: fromMajor(19.99, "EUR") },
      { now: now() },
    );
    if (!isRecurringSchedule(repriced.schedule)) throw new Error("expected recurring");
    expect(repriced.schedule.priceHistory).toHaveLength(2);
    expect(repriced.schedule.priceHistory[1].amount).toEqual({ amount: 1999, currency: "EUR" });
  });

  it("edits an installment plan, regenerating installments, keeping id + createdAt", () => {
    const ids = () => {
      let n = 0;
      return () => `inst-${++n}`;
    };
    const plan: NewInstallmentInput = {
      name: "Sofa",
      totalAmount: fromMajor(300, "EUR"),
      numberOfInstallments: 3,
      recurrence: RECURRENCE_PRESETS.MONTHLY,
      firstInstallmentDate: calendarDate("2026-01-10"),
      settlementMode: "manual",
    };
    const original = makeInstallmentPaymentItem(plan, { id: "plan-1", now: now(), makeId: ids() });

    const edited = updateInstallmentPaymentItem(
      original,
      { ...plan, numberOfInstallments: 4 },
      { now: now(), makeId: ids() },
    );

    expect(edited.id).toBe("plan-1");
    expect(edited.createdAt).toBe(original.createdAt);
    if (!isInstallmentSchedule(edited.schedule)) throw new Error("expected installment");
    expect(edited.schedule.installments).toHaveLength(4);
    expect(
      sumMoney(
        edited.schedule.installments.map((i) => i.amount),
        "EUR",
      ),
    ).toEqual(edited.schedule.totalAmount);
  });

  it("keeps paid installments (and ids) through a no-change save", () => {
    const ids = (prefix: string) => {
      let n = 0;
      return () => `${prefix}-${++n}`;
    };
    const plan: NewInstallmentInput = {
      name: "Sofa",
      totalAmount: fromMajor(300, "EUR"),
      numberOfInstallments: 3,
      recurrence: RECURRENCE_PRESETS.MONTHLY,
      firstInstallmentDate: calendarDate("2026-01-10"),
      settlementMode: "manual",
    };
    let item = makeInstallmentPaymentItem(plan, { id: "plan-1", now: now(), makeId: ids("a") });
    item = markNextInstallmentPaid(item, { paidDate: calendarDate("2026-01-10"), now: now() });

    const saved = updateInstallmentPaymentItem(item, plan, { now: now(), makeId: ids("b") });
    if (!isInstallmentSchedule(saved.schedule)) throw new Error("expected installment");
    if (!isInstallmentSchedule(item.schedule)) throw new Error("expected installment");
    expect(saved.schedule.installments).toEqual(item.schedule.installments);
  });

  it("keeps payments already made when the plan grows or shrinks", () => {
    const ids = (prefix: string) => {
      let n = 0;
      return () => `${prefix}-${++n}`;
    };
    const plan: NewInstallmentInput = {
      name: "Phone",
      totalAmount: fromMajor(400, "EUR"),
      numberOfInstallments: 4,
      recurrence: RECURRENCE_PRESETS.MONTHLY,
      firstInstallmentDate: calendarDate("2026-01-10"),
      settlementMode: "manual",
    };
    let item = makeInstallmentPaymentItem(plan, { id: "p1", now: now(), makeId: ids("a") });
    item = markNextInstallmentPaid(item, { paidDate: calendarDate("2026-01-10"), now: now() });
    item = markNextInstallmentPaid(item, { paidDate: calendarDate("2026-02-10"), now: now() });

    // Grow 4 → 6: the two payments made stay made.
    const grown = updateInstallmentPaymentItem(
      item,
      { ...plan, numberOfInstallments: 6 },
      { now: now(), makeId: ids("b") },
    );
    if (!isInstallmentSchedule(grown.schedule)) throw new Error("expected installment");
    expect(grown.schedule.installments.filter((i) => i.status === "paid")).toHaveLength(2);
    expect(grown.schedule.installments[0].paidDate).toBe("2026-01-10");

    // Shrink 4 → 2 with 2 already paid: the plan reads as complete.
    const shrunk = updateInstallmentPaymentItem(
      item,
      { ...plan, numberOfInstallments: 2 },
      { now: now(), makeId: ids("c") },
    );
    expect(isPaymentItemComplete(shrunk, calendarDate("2026-02-15"))).toBe(true);
  });
});

describe("completion lifecycle", () => {
  const ids = () => {
    let n = 0;
    return () => `i-${++n}`;
  };

  it("marks a recurring item complete once its end date has passed", () => {
    const item = makeRecurringPaymentItem(
      { ...input, endDate: calendarDate("2026-03-31") },
      { id: "r1", now: now() },
    );
    expect(isPaymentItemComplete(item, calendarDate("2026-03-15"))).toBe(false);
    expect(isPaymentItemComplete(item, calendarDate("2026-04-01"))).toBe(true);
  });

  it("never completes a recurring item without an end date", () => {
    const item = makeRecurringPaymentItem(input, { id: "r2", now: now() });
    expect(isPaymentItemComplete(item, calendarDate("2030-01-01"))).toBe(false);
  });

  it("completes once the last billing is paid, even before the end date arrives", () => {
    // Monthly on the 15th, ending 2026-03-15 → three billings: Jan, Feb, Mar.
    let item = makeRecurringPaymentItem(
      { ...input, endDate: calendarDate("2026-03-15") },
      { id: "r3", now: now() },
    );
    const pay = (n: number) =>
      recordRecurringPayment(item, {
        id: `occ-${n}`,
        paidDate: calendarDate("2026-01-20"),
        now: now(),
      }).item;

    item = pay(1);
    item = pay(2);
    expect(isPaymentItemComplete(item, calendarDate("2026-03-01"))).toBe(false);

    item = pay(3); // the March 15 billing — cursor moves past the end date
    if (!isRecurringSchedule(item.schedule)) throw new Error("expected recurring");
    expect(item.schedule.nextChargeDate).toBe("2026-04-15");
    expect(isPaymentItemComplete(item, calendarDate("2026-03-01"))).toBe(true);
  });

  it("marks the next installment paid and completes the plan after the last", () => {
    const plan: NewInstallmentInput = {
      name: "TV",
      totalAmount: fromMajor(300, "EUR"),
      numberOfInstallments: 3,
      recurrence: RECURRENCE_PRESETS.MONTHLY,
      firstInstallmentDate: calendarDate("2026-01-10"),
      settlementMode: "manual",
    };
    let item = makeInstallmentPaymentItem(plan, { id: "p1", now: now(), makeId: ids() });
    const today = calendarDate("2026-06-01");
    expect(isPaymentItemComplete(item, today)).toBe(false);

    item = markNextInstallmentPaid(item, { paidDate: today, now: now() });
    if (!isInstallmentSchedule(item.schedule)) throw new Error("expected installment");
    expect(item.schedule.installments.filter((i) => i.status === "paid")).toHaveLength(1);

    item = markNextInstallmentPaid(item, { paidDate: today, now: now() });
    item = markNextInstallmentPaid(item, { paidDate: today, now: now() });
    expect(isPaymentItemComplete(item, today)).toBe(true);

    // A further mark is a no-op once everything is covered.
    const same = markNextInstallmentPaid(item, { paidDate: today, now: now() });
    expect(same).toBe(item);
  });
});

describe("canMarkNextInstallmentPaid (current-cycle cap)", () => {
  const ids = () => {
    let n = 0;
    return () => `i-${++n}`;
  };
  const plan = {
    name: "TV",
    totalAmount: fromMajor(300, "EUR"),
    numberOfInstallments: 3,
    recurrence: RECURRENCE_PRESETS.MONTHLY,
    firstInstallmentDate: calendarDate("2026-06-10"),
    settlementMode: "manual" as const,
  };

  it("allows due, overdue and same-month payments — never a later month", () => {
    let item = makeInstallmentPaymentItem(plan, { id: "p1", now: now(), makeId: ids() });

    // Early in the month, the 10th is later this same month → markable.
    expect(canMarkNextInstallmentPaid(item, calendarDate("2026-06-01"))).toBe(true);
    // Overdue → still markable.
    expect(canMarkNextInstallmentPaid(item, calendarDate("2026-06-20"))).toBe(true);

    // Pay June: July's installment belongs to next month…
    item = markNextInstallmentPaid(item, { paidDate: calendarDate("2026-06-01"), now: now() });
    expect(canMarkNextInstallmentPaid(item, calendarDate("2026-06-01"))).toBe(false);
    expect(canMarkNextInstallmentPaid(item, calendarDate("2026-06-30"))).toBe(false);
    // …and unlocks once July starts.
    expect(canMarkNextInstallmentPaid(item, calendarDate("2026-07-01"))).toBe(true);
  });

  it("is false for complete plans, paused items and recurring items", () => {
    let item = makeInstallmentPaymentItem(
      { ...plan, numberOfInstallments: 1 },
      { id: "p2", now: now(), makeId: ids() },
    );
    item = markNextInstallmentPaid(item, { paidDate: calendarDate("2026-06-10"), now: now() });
    expect(canMarkNextInstallmentPaid(item, calendarDate("2026-06-10"))).toBe(false); // complete

    const paused = pausePaymentItem(
      makeInstallmentPaymentItem(plan, { id: "p3", now: now(), makeId: ids() }),
      { now: now() },
    );
    expect(canMarkNextInstallmentPaid(paused, calendarDate("2026-06-01"))).toBe(false);

    const sub = makeRecurringPaymentItem(input, { id: "r1", now: now() });
    expect(canMarkNextInstallmentPaid(sub, calendarDate("2026-06-01"))).toBe(false);
  });
});

describe("canMarkPaid (unified cycle cap)", () => {
  it("caps manual recurring subscriptions exactly like installments", () => {
    // Manual, monthly on the 15th.
    const item = makeRecurringPaymentItem(input, { id: "r1", now: now() });

    // Later this month, or overdue → markable.
    expect(canMarkPaid(item, calendarDate("2026-01-02"))).toBe(true);
    expect(canMarkPaid(item, calendarDate("2026-02-01"))).toBe(true);

    // Pay January: February's billing is a later month for the rest of January…
    const { item: paid } = recordRecurringPayment(item, {
      id: "occ-1",
      paidDate: calendarDate("2026-01-15"),
      now: now(),
    });
    expect(canMarkPaid(paid, calendarDate("2026-01-16"))).toBe(false);
    expect(canMarkPaid(paid, calendarDate("2026-01-31"))).toBe(false);
    // …and unlocks once February starts.
    expect(canMarkPaid(paid, calendarDate("2026-02-01"))).toBe(true);
  });

  it("never allows automatic, paused or ended items", () => {
    const auto = makeRecurringPaymentItem(
      { ...input, settlementMode: "automatic" },
      { id: "r2", now: now() },
    );
    expect(canMarkPaid(auto, calendarDate("2026-01-02"))).toBe(false);

    const paused = pausePaymentItem(makeRecurringPaymentItem(input, { id: "r3", now: now() }), {
      now: now(),
    });
    expect(canMarkPaid(paused, calendarDate("2026-01-02"))).toBe(false);

    const ended = makeRecurringPaymentItem(
      { ...input, endDate: calendarDate("2026-02-15") },
      { id: "r4", now: now() },
    );
    expect(canMarkPaid(ended, calendarDate("2026-03-01"))).toBe(false);
  });
});

describe("rewindRecurringPayment", () => {
  it("steps the cursor back to the undone due date, never forward", () => {
    const item = makeRecurringPaymentItem(input, { id: "r1", now: now() });
    const { item: paid } = recordRecurringPayment(item, {
      id: "occ-1",
      paidDate: calendarDate("2026-01-15"),
      now: now(),
    });

    const undone = rewindRecurringPayment(paid, {
      toDueDate: calendarDate("2026-01-15"),
      now: now(),
    });
    if (!isRecurringSchedule(undone.schedule)) throw new Error("expected recurring");
    expect(undone.schedule.nextChargeDate).toBe("2026-01-15");

    // Forward "rewinds" are refused.
    expect(
      rewindRecurringPayment(paid, { toDueDate: calendarDate("2026-06-15"), now: now() }),
    ).toBe(paid);
  });
});

describe("unmarkLastInstallmentPaid", () => {
  const ids = () => {
    let n = 0;
    return () => `i-${++n}`;
  };

  it("reverts the most recent payment, clearing its paid fields", () => {
    let item = makeInstallmentPaymentItem(
      {
        name: "TV",
        totalAmount: fromMajor(300, "EUR"),
        numberOfInstallments: 3,
        recurrence: RECURRENCE_PRESETS.MONTHLY,
        firstInstallmentDate: calendarDate("2026-06-10"),
        settlementMode: "manual",
      },
      { id: "p1", now: now(), makeId: ids() },
    );
    item = markNextInstallmentPaid(item, { paidDate: calendarDate("2026-06-10"), now: now() });
    item = markNextInstallmentPaid(item, { paidDate: calendarDate("2026-07-10"), now: now() });

    const undone = unmarkLastInstallmentPaid(item, { now: now() });
    if (!isInstallmentSchedule(undone.schedule)) throw new Error("expected installment");
    expect(undone.schedule.installments.map((i) => i.status)).toEqual([
      "paid",
      "upcoming",
      "upcoming",
    ]);
    expect(undone.schedule.installments[1].paidDate).toBeUndefined();

    // Nothing covered → no-op.
    const fresh = unmarkLastInstallmentPaid(unmarkLastInstallmentPaid(undone, { now: now() }), {
      now: now(),
    });
    expect(unmarkLastInstallmentPaid(fresh, { now: now() })).toBe(fresh);
  });
});

describe("pause / resume", () => {
  it("pauses an active item and resumes without back-charging the gap", () => {
    const item = makeRecurringPaymentItem(input, { id: "r1", now: now() });
    const paused = pausePaymentItem(item, { now: now() });
    expect(paused.status).toBe("paused");

    // Paused Jan→June; resuming must NOT owe Feb–June: the cursor jumps to
    // the next grid date after asOf (bills on the 15th → 2026-07-15).
    const resumed = resumePaymentItem(paused, { now: now(), asOf: calendarDate("2026-06-20") });
    expect(resumed.status).toBe("active");
    if (!isRecurringSchedule(resumed.schedule)) throw new Error("expected recurring");
    expect(resumed.schedule.nextChargeDate).toBe("2026-07-15");

    // A cursor already in the future stays put.
    const pausedEarly = pausePaymentItem(item, { now: now() });
    const resumedEarly = resumePaymentItem(pausedEarly, {
      now: now(),
      asOf: calendarDate("2026-01-01"),
    });
    if (!isRecurringSchedule(resumedEarly.schedule)) throw new Error("expected recurring");
    expect(resumedEarly.schedule.nextChargeDate).toBe("2026-01-15");

    // Guards: pause is a no-op on non-active, resume on non-paused.
    expect(pausePaymentItem(paused, { now: now() })).toBe(paused);
    expect(resumePaymentItem(item, { now: now(), asOf: calendarDate("2026-06-20") })).toBe(item);
  });
});
