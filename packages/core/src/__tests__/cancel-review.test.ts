import { describe, expect, it } from "vitest";
import {
  calendarDate,
  cancelReview,
  fromMajor,
  makeInstallmentPaymentItem,
  makeRecurringPaymentItem,
  now,
  pausePaymentItem,
  planCancellation,
  RECURRENCE_PRESETS,
} from "../index";
import type { NewRecurringInput, PaymentItem } from "../index";

const today = calendarDate("2026-06-01");
const sub = (id: string, over: Partial<NewRecurringInput> = {}): PaymentItem =>
  makeRecurringPaymentItem(
    {
      name: id,
      amount: fromMajor(10, "CHF"),
      recurrence: RECURRENCE_PRESETS.MONTHLY,
      firstChargeDate: calendarDate("2026-01-15"),
      settlementMode: "automatic",
      ...over,
    },
    { id, now: now() },
  );

describe("cancelReview", () => {
  it("lists running subscriptions with their yearly cost and their plan", () => {
    const planned = planCancellation(sub("gym", { amount: fromMajor(65, "CHF") }), {
      now: now(),
      today,
    });
    const yearly = sub("domain", {
      amount: fromMajor(24, "EUR"),
      recurrence: RECURRENCE_PRESETS.YEARLY,
    });
    const { running, stopped } = cancelReview([sub("music"), planned, yearly], today);
    expect(running.map((r) => [r.item.id, r.yearly, r.planned])).toEqual([
      ["music", fromMajor(120, "CHF"), false],
      ["gym", fromMajor(780, "CHF"), true],
      ["domain", fromMajor(24, "EUR"), false],
    ]);
    expect(stopped).toEqual([]);
  });

  it("puts every subscription with an end in the stopped list, latest end first", () => {
    const past = sub("old", { endDate: calendarDate("2026-03-15") });
    const coming = sub("leaving", { endDate: calendarDate("2026-07-15") });
    const { running, stopped } = cancelReview([past, coming], today);
    expect(running).toEqual([]);
    expect(stopped.map((s) => [s.item.id, s.endDate, s.ended, s.yearly])).toEqual([
      ["leaving", "2026-07-15", false, fromMajor(120, "CHF")],
      ["old", "2026-03-15", true, fromMajor(120, "CHF")],
    ]);
  });

  it("leaves out paused subscriptions and split payments", () => {
    const paused = pausePaymentItem(sub("paused"), { now: now() });
    const split = makeInstallmentPaymentItem(
      {
        name: "Sofa",
        totalAmount: fromMajor(900, "CHF"),
        numberOfInstallments: 3,
        recurrence: RECURRENCE_PRESETS.MONTHLY,
        firstInstallmentDate: calendarDate("2026-05-15"),
        settlementMode: "manual",
      },
      { id: "s1", now: now(), makeId: () => "i" },
    );
    expect(cancelReview([paused, split], today)).toEqual({ running: [], stopped: [] });
  });

  it("counts a trial at its regular price", () => {
    const trial = sub("trial", {
      amount: fromMajor(0, "CHF"),
      introOffer: {
        convertsOn: calendarDate("2026-07-15"),
        regularAmount: fromMajor(12, "CHF"),
      },
    });
    const [row] = cancelReview([trial], today).running;
    expect(row.price).toEqual(fromMajor(12, "CHF"));
    expect(row.yearly).toEqual(fromMajor(144, "CHF"));
  });
});
