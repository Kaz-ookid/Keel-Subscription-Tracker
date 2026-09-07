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

  it("plans one fire per rule when the item carries a reminders list", () => {
    const item = makeRecurringPaymentItem(
      { ...base, reminders: [{ daysBefore: 7 }, { daysBefore: 1, hour: 20 }] },
      { id: "r1", now: now() },
    );
    const planned = plannedReminders([item], calendarDate("2026-07-01"));
    expect(planned.map((p) => p.fireDate)).toEqual(["2026-07-08", "2026-07-14"]);
    expect(planned.map((p) => p.hour)).toEqual([undefined, 20]);
    // Ids are unique and stable.
    expect(new Set(planned.map((p) => p.id)).size).toBe(2);
  });

  it("an explicit empty rules list mutes even the trial safety net", () => {
    const trial = (reminders?: readonly { daysBefore: number }[]) =>
      makeRecurringPaymentItem(
        {
          ...base,
          amount: fromMajor(0, "EUR"),
          reminder: undefined,
          reminders,
          introOffer: {
            regularAmount: fromMajor(12.9, "EUR"),
            convertsOn: calendarDate("2026-07-20"),
          },
          firstChargeDate: calendarDate("2026-07-20"),
        },
        { id: "r1", now: now() },
      );
    // Untouched (undefined): the trial-end reminder fires without any rule.
    expect(plannedReminders([trial(undefined)], calendarDate("2026-07-01"))).toHaveLength(1);
    // Explicit []: the user removed the reminder — full silence.
    expect(plannedReminders([trial([])], calendarDate("2026-07-01"))).toEqual([]);
  });

  it("the reminders list wins over the legacy single slot", () => {
    const item = makeRecurringPaymentItem(
      { ...base, reminder: { daysBefore: 2 }, reminders: [{ daysBefore: 5 }] },
      { id: "r1", now: now() },
    );
    expect(plannedReminders([item], calendarDate("2026-07-01")).map((p) => p.fireDate)).toEqual([
      "2026-07-10",
    ]);
  });

  it("expands a daily repeat into its series and drops past occurrences", () => {
    const item = makeRecurringPaymentItem(
      { ...base, reminders: [{ daysBefore: 3, repeat: "daily" }] },
      { id: "r1", now: now() },
    );
    // Full series: lead day through the due day.
    expect(plannedReminders([item], calendarDate("2026-07-01")).map((p) => p.fireDate)).toEqual([
      "2026-07-12",
      "2026-07-13",
      "2026-07-14",
      "2026-07-15",
    ]);
    // Mid-series: the backlog is dropped, NOT clamped onto today.
    expect(plannedReminders([item], calendarDate("2026-07-14")).map((p) => p.fireDate)).toEqual([
      "2026-07-14",
      "2026-07-15",
    ]);
  });

  it("expands a weekly repeat in 7-day steps", () => {
    const item = makeRecurringPaymentItem(
      { ...base, reminders: [{ daysBefore: 30, repeat: "weekly" }] },
      { id: "r1", now: now() },
    );
    expect(plannedReminders([item], calendarDate("2026-06-14")).map((p) => p.fireDate)).toEqual([
      "2026-06-15",
      "2026-06-22",
      "2026-06-29",
      "2026-07-06",
      "2026-07-13",
    ]);
  });

  it("dedupes same-day fires across rules and sorts the plan chronologically", () => {
    const overlap = makeRecurringPaymentItem(
      { ...base, reminders: [{ daysBefore: 2, repeat: "daily", hour: 9 }, { daysBefore: 1 }] },
      { id: "r1", now: now() },
    );
    const later = makeRecurringPaymentItem(
      { ...base, firstChargeDate: calendarDate("2026-07-05"), reminders: [{ daysBefore: 0 }] },
      { id: "r2", now: now() },
    );
    const planned = plannedReminders([overlap, later], calendarDate("2026-07-01"));
    // r2 fires the 5th (first), r1's series 13/14/15 with the 14th deduped.
    expect(planned.map((p) => `${p.paymentItemId}:${p.fireDate}`)).toEqual([
      "r2:2026-07-05",
      "r1:2026-07-13",
      "r1:2026-07-14",
      "r1:2026-07-15",
    ]);
    // The deduped 14th keeps the FIRST rule's hour.
    expect(planned[2].hour).toBe(9);
  });
});
