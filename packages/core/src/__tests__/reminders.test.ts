import { describe, expect, it } from "vitest";
import {
  calendarDate,
  fromMajor,
  makeInstallmentPaymentItem,
  makeRecurringPaymentItem,
  markNextInstallmentPaid,
  now,
  pausePaymentItem,
  plannedReminders,
  RECURRENCE_PRESETS,
} from "../index";
import type { NewRecurringInput } from "../index";

const base: NewRecurringInput = {
  name: "Netflix",
  amount: fromMajor(15.99, "EUR"),
  recurrence: RECURRENCE_PRESETS.MONTHLY,
  firstChargeDate: calendarDate("2026-07-15"),
  settlementMode: "manual",
  reminder: { daysBefore: 2 },
};

describe("plannedReminders", () => {
  it("fires daysBefore ahead of the next payment, and on the day for 0", () => {
    const item = makeRecurringPaymentItem(base, { id: "r1", now: now() });
    const [reminder] = plannedReminders([item], calendarDate("2026-07-01"));
    expect(reminder).toMatchObject({
      paymentItemId: "r1",
      name: "Netflix",
      dueDate: "2026-07-15",
      fireDate: "2026-07-13",
      amount: { amount: 1599, currency: "EUR" },
    });

    const onTheDay = makeRecurringPaymentItem(
      { ...base, reminder: { daysBefore: 0 } },
      { id: "r2", now: now() },
    );
    expect(plannedReminders([onTheDay], calendarDate("2026-07-01"))[0].fireDate).toBe("2026-07-15");
  });

  it("clamps to today when the window already started, skips overdue", () => {
    const item = makeRecurringPaymentItem(base, { id: "r1", now: now() });
    // Due the 15th, 2-day window, opened on the 14th → fire today.
    expect(plannedReminders([item], calendarDate("2026-07-14"))[0].fireDate).toBe("2026-07-14");
    // Already overdue → no nagging notification.
    expect(plannedReminders([item], calendarDate("2026-07-20"))).toEqual([]);
  });

  it("passes the rule's hour override through, and leaves it absent otherwise", () => {
    const withHour = makeRecurringPaymentItem(
      { ...base, reminder: { daysBefore: 2, hour: 8 } },
      { id: "r1", now: now() },
    );
    expect(plannedReminders([withHour], calendarDate("2026-07-01"))[0].hour).toBe(8);

    const noHour = makeRecurringPaymentItem(base, { id: "r2", now: now() });
    expect(plannedReminders([noHour], calendarDate("2026-07-01"))[0].hour).toBeUndefined();
  });

  it("skips items without a rule, paused items, and reminds for installments' next due", () => {
    const noRule = makeRecurringPaymentItem(
      { ...base, reminder: undefined },
      { id: "r1", now: now() },
    );
    const paused = pausePaymentItem(makeRecurringPaymentItem(base, { id: "r2", now: now() }), {
      now: now(),
    });
    expect(plannedReminders([noRule, paused], calendarDate("2026-07-01"))).toEqual([]);

    const ids = (() => {
      let n = 0;
      return () => `i-${++n}`;
    })();
    let plan = makeInstallmentPaymentItem(
      {
        name: "Sofa",
        totalAmount: fromMajor(300, "EUR"),
        numberOfInstallments: 3,
        recurrence: RECURRENCE_PRESETS.MONTHLY,
        firstInstallmentDate: calendarDate("2026-07-10"),
        settlementMode: "manual",
        reminder: { daysBefore: 1 },
      },
      { id: "p1", now: now(), makeId: ids },
    );
    plan = markNextInstallmentPaid(plan, { paidDate: calendarDate("2026-07-10"), now: now() });
    // July paid → the reminder targets August's installment.
    const [reminder] = plannedReminders([plan], calendarDate("2026-07-12"));
    expect(reminder).toMatchObject({ dueDate: "2026-08-10", fireDate: "2026-08-09" });
  });
});
