import { describe, expect, it } from "vitest";
import {
  accrueDueOccurrences,
  calendarDate,
  fromMajor,
  isRecurringSchedule,
  makeRecurringPaymentItem,
  now,
  recordRecurringPayment,
  RECURRENCE_PRESETS,
} from "../index";
import type { NewRecurringInput } from "../index";

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
    const { item: advanced, occurrences } = accrueDueOccurrences(
      item,
      calendarDate("2026-03-20"),
      { now: now(), makeId: ids() },
    );

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
});
