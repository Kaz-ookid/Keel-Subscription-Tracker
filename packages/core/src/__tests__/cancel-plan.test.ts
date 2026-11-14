import { describe, expect, it } from "vitest";
import {
  calendarDate,
  cancelDeadline,
  cancelPlansAhead,
  canCancel,
  clearCancelPlan,
  confirmCancellation,
  fromMajor,
  isCancelPlanned,
  isPaymentItemComplete,
  isRecurringSchedule,
  isValidPaymentItem,
  lastChargeOptions,
  makeInstallmentPaymentItem,
  makeRecurringPaymentItem,
  now,
  pausePaymentItem,
  planCancellation,
  plannedReminders,
  RECURRENCE_PRESETS,
  updateRecurringPaymentItem,
} from "../index";
import type { NewRecurringInput, PaymentItem } from "../index";

const input: NewRecurringInput = {
  name: "Netflix",
  amount: fromMajor(15.99, "EUR"),
  recurrence: RECURRENCE_PRESETS.MONTHLY,
  firstChargeDate: calendarDate("2026-01-15"),
  settlementMode: "manual",
};
const today = calendarDate("2026-01-01");
const item = (over: Partial<NewRecurringInput> = {}, id = "r1"): PaymentItem =>
  makeRecurringPaymentItem({ ...input, ...over }, { id, now: now() });
const endDateOf = (i: PaymentItem) =>
  isRecurringSchedule(i.schedule) ? i.schedule.endDate : undefined;

describe("planCancellation", () => {
  it("plans with the day before the next charge as the deadline", () => {
    const planned = planCancellation(item(), { now: now(), today });
    expect(planned.cancelPlan).toEqual({ since: "2026-01-01" });
    expect(isCancelPlanned(planned)).toBe(true);
    expect(cancelDeadline(planned)).toBe("2026-01-14");
  });

  it("takes an explicit deadline, and a change keeps the plan's start", () => {
    const planned = planCancellation(item(), {
      now: now(),
      today,
      cancelBy: calendarDate("2026-11-30"),
    });
    expect(cancelDeadline(planned)).toBe("2026-11-30");
    const moved = planCancellation(planned, { now: now(), today: calendarDate("2026-03-01") });
    expect(moved.cancelPlan).toEqual({ since: "2026-01-01" });
    expect(cancelDeadline(moved)).toBe("2026-01-14");
  });

  it("refuses a split payment and a subscription that already ends", () => {
    const split = makeInstallmentPaymentItem(
      {
        name: "Sofa",
        totalAmount: fromMajor(900, "EUR"),
        numberOfInstallments: 3,
        recurrence: RECURRENCE_PRESETS.MONTHLY,
        firstInstallmentDate: calendarDate("2026-01-15"),
        settlementMode: "manual",
      },
      { id: "s1", now: now(), makeId: () => "i" },
    );
    expect(canCancel(split)).toBe(false);
    expect(planCancellation(split, { now: now(), today })).toBe(split);
    const ending = item({ endDate: calendarDate("2026-06-15") });
    expect(planCancellation(ending, { now: now(), today })).toBe(ending);
  });

  it("lifts an explicit reminder mute: planning is asking to be reminded", () => {
    const muted: PaymentItem = { ...item(), reminders: [] };
    const planned = planCancellation(muted, { now: now(), today });
    expect(planned.reminders).toBeUndefined();
    expect(plannedReminders([planned], calendarDate("2026-01-12"))).toHaveLength(3);
  });

  it("keeps the plan on a paused item but takes it out of the live list", () => {
    const planned = planCancellation(item(), { now: now(), today });
    const paused = pausePaymentItem(planned, { now: now() });
    expect(paused.cancelPlan).toBeDefined();
    expect(isCancelPlanned(paused)).toBe(false);
    expect(cancelPlansAhead([paused], today)).toEqual([]);
  });
});

describe("clearCancelPlan / confirmCancellation", () => {
  it("clears the plan and leaves the subscription running", () => {
    const planned = planCancellation(item(), { now: now(), today });
    const kept = clearCancelPlan(planned, { now: now() });
    expect(kept.cancelPlan).toBeUndefined();
    expect(endDateOf(kept)).toBeUndefined();
  });

  it("ends today when nothing more is to pay, with or without a plan", () => {
    const planned = planCancellation(item(), { now: now(), today });
    for (const start of [planned, item()]) {
      const done = confirmCancellation(start, { now: now(), today });
      expect(done.cancelPlan).toBeUndefined();
      expect(endDateOf(done)).toBe("2026-01-01");
      expect(isPaymentItemComplete(done)).toBe(true);
    }
  });

  it("runs until a later last billing", () => {
    const done = confirmCancellation(item(), {
      now: now(),
      today,
      lastChargeDate: calendarDate("2026-03-15"),
    });
    expect(endDateOf(done)).toBe("2026-03-15");
    expect(isPaymentItemComplete(done)).toBe(false);
  });

  it("ends a paused subscription without owing the paused months", () => {
    const paused = pausePaymentItem(item(), { now: now() });
    const done = confirmCancellation(paused, { now: now(), today: calendarDate("2026-06-20") });
    expect(done.status).toBe("active");
    expect(isPaymentItemComplete(done)).toBe(true);
  });

  it("offers the next billing dates as a last payment", () => {
    expect(lastChargeOptions(item())).toEqual(["2026-01-15", "2026-02-15", "2026-03-15"]);
    expect(lastChargeOptions(item({ endDate: calendarDate("2026-06-15") }))).toEqual([]);
  });

  it("leaves an unpaid charge already due open to tick", () => {
    const done = confirmCancellation(item(), { now: now(), today: calendarDate("2026-01-20") });
    expect(isPaymentItemComplete(done)).toBe(false);
  });
});

describe("an edit", () => {
  it("keeps a pause and a cancel plan", () => {
    const planned = planCancellation(item(), { now: now(), today });
    const paused = pausePaymentItem(planned, { now: now() });
    const edited = updateRecurringPaymentItem(
      paused,
      { ...input, name: "Netflix 4K" },
      { now: now() },
    );
    expect(edited.status).toBe("paused");
    expect(edited.cancelPlan).toEqual(planned.cancelPlan);
  });

  it("settles the plan when it sets an end date", () => {
    const planned = planCancellation(item(), { now: now(), today });
    const edited = updateRecurringPaymentItem(
      planned,
      { ...input, endDate: calendarDate("2026-04-15") },
      { now: now() },
    );
    expect(edited.cancelPlan).toBeUndefined();
  });
});

describe("cancelPlansAhead", () => {
  it("lists live plans by deadline and flags a passed one", () => {
    const a = planCancellation(item({}, "a"), { now: now(), today });
    const b = planCancellation(item({ name: "Gym" }, "b"), {
      now: now(),
      today,
      cancelBy: calendarDate("2026-01-05"),
    });
    const ahead = cancelPlansAhead([a, b, item({}, "c")], calendarDate("2026-01-10"));
    expect(ahead.map((p) => [p.item.id, p.deadline, p.passed])).toEqual([
      ["b", "2026-01-05", true],
      ["a", "2026-01-14", false],
    ]);
  });
});

describe("cancel reminders", () => {
  it("count down daily over the last three days and the deadline itself", () => {
    const planned = planCancellation(item(), { now: now(), today });
    const reminders = plannedReminders([planned], today);
    expect(reminders.map((r) => [r.kind, r.fireDate, r.dueDate])).toEqual([
      ["cancelBy", "2026-01-11", "2026-01-14"],
      ["cancelBy", "2026-01-12", "2026-01-14"],
      ["cancelBy", "2026-01-13", "2026-01-14"],
      ["cancelBy", "2026-01-14", "2026-01-14"],
    ]);
    expect(reminders[0].amount).toEqual(fromMajor(15.99, "EUR"));
  });

  it("replace the item's charge reminder on the same day, and stop once passed", () => {
    const planned = planCancellation(item({ reminder: { daysBefore: 2 } }), { now: now(), today });
    const kinds = plannedReminders([planned], today).map((r) => `${r.kind}:${r.fireDate}`);
    // The 2-day charge reminder would fire on the 13th: the cancel one holds that day.
    expect(kinds).toEqual([
      "cancelBy:2026-01-11",
      "cancelBy:2026-01-12",
      "cancelBy:2026-01-13",
      "cancelBy:2026-01-14",
    ]);
    const late = planCancellation(item(), {
      now: now(),
      today,
      cancelBy: calendarDate("2026-01-05"),
    });
    expect(plannedReminders([late], calendarDate("2026-01-10"))).toEqual([]);
  });
});

describe("restore guard", () => {
  it("accepts a cancel plan and rejects a malformed one", () => {
    const planned = planCancellation(item(), { now: now(), today });
    expect(isValidPaymentItem(planned)).toBe(true);
    expect(isValidPaymentItem({ ...planned, cancelPlan: { since: "soon" } })).toBe(false);
  });
});
