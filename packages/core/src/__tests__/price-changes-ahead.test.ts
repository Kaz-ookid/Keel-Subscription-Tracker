import { describe, expect, it } from "vitest";

import {
  calendarDate,
  fromMajor,
  makeRecurringPaymentItem,
  now,
  priceChangesAhead,
  RECURRENCE_PRESETS,
  type NewRecurringInput,
} from "../index";

const base: NewRecurringInput = {
  name: "Disney+",
  amount: fromMajor(0, "EUR"),
  recurrence: RECURRENCE_PRESETS.MONTHLY,
  firstChargeDate: calendarDate("2026-10-01"),
  settlementMode: "automatic",
  categoryId: "streaming",
};

describe("priceChangesAhead", () => {
  it("lists trial ends and price moves inside the horizon, soonest first", () => {
    const trial = makeRecurringPaymentItem(
      {
        ...base,
        introOffer: {
          regularAmount: fromMajor(8.99, "EUR"),
          convertsOn: calendarDate("2026-11-20"),
        },
      },
      { id: "trial", now: now() },
    );
    const raise = makeRecurringPaymentItem(
      {
        ...base,
        name: "Netflix",
        amount: fromMajor(13.99, "EUR"),
        introOffer: {
          regularAmount: fromMajor(17.99, "EUR"),
          convertsOn: calendarDate("2026-11-05"),
        },
      },
      { id: "raise", now: now() },
    );
    const far = makeRecurringPaymentItem(
      {
        ...base,
        name: "Later",
        introOffer: { regularAmount: fromMajor(5, "EUR"), convertsOn: calendarDate("2027-06-01") },
      },
      { id: "far", now: now() },
    );
    const plain = makeRecurringPaymentItem({ ...base, name: "Plain" }, { id: "plain", now: now() });
    const ahead = priceChangesAhead([trial, raise, far, plain], calendarDate("2026-11-01"));
    expect(ahead.map((a) => [a.item.id, a.kind, a.on])).toEqual([
      ["raise", "priceChange", "2026-11-05"],
      ["trial", "trialEnd", "2026-11-20"],
    ]);
  });
});
