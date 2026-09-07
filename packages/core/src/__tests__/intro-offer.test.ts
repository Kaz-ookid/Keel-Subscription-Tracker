// Trial / intro offers: a recurring price that changes on a date. Covers the
// one helper (effectiveRecurringAmount), the price-aware projection + the
// committed-monthly weighting, the stored "graduation" once a charge crosses
// the conversion date, and the trial-end reminder.

import { describe, expect, it } from "vitest";
import {
  accrueDueOccurrences,
  calendarDate,
  effectiveRecurringAmount,
  fromMajor,
  isRecurringSchedule,
  makeRecurringPaymentItem,
  now,
  plannedReminders,
  projectItemCharges,
  recordRecurringPayment,
  RECURRENCE_PRESETS,
  summarizeCommitments,
} from "../index";
import type { IntroOffer, NewRecurringInput } from "../index";

const eur = (major: number) => fromMajor(major, "EUR");
const ids = () => {
  let n = 0;
  return () => `o-${++n}`;
};

const offer: IntroOffer = { regularAmount: eur(12.9), convertsOn: calendarDate("2026-07-20") };

// A free trial: intro price 0 until conversion, billing grid anchored at the
// conversion date (the UI default — no zero-charges before it).
const freeTrial: NewRecurringInput = {
  name: "Disney+",
  amount: eur(0),
  recurrence: RECURRENCE_PRESETS.MONTHLY,
  firstChargeDate: calendarDate("2026-07-20"),
  settlementMode: "automatic",
  introOffer: offer,
};

function recurring(item: ReturnType<typeof makeRecurringPaymentItem>) {
  if (!isRecurringSchedule(item.schedule)) throw new Error("expected recurring");
  return item.schedule;
}

describe("effectiveRecurringAmount", () => {
  it("returns the intro price before conversion and the regular price on/after", () => {
    const s = recurring(makeRecurringPaymentItem(freeTrial, { id: "r1", now: now() }));
    expect(effectiveRecurringAmount(s, calendarDate("2026-07-19"))).toEqual(eur(0));
    expect(effectiveRecurringAmount(s, calendarDate("2026-07-20"))).toEqual(eur(12.9));
    expect(effectiveRecurringAmount(s, calendarDate("2026-08-20"))).toEqual(eur(12.9));
  });

  it("returns the flat amount unchanged when there is no offer", () => {
    const s = recurring(
      makeRecurringPaymentItem(
        { ...freeTrial, amount: eur(9), introOffer: undefined },
        { id: "r1", now: now() },
      ),
    );
    expect(effectiveRecurringAmount(s, calendarDate("2030-01-01"))).toEqual(eur(9));
  });
});

describe("projectItemCharges with an intro offer", () => {
  it("surfaces no charge during a free trial, then the regular price", () => {
    const item = makeRecurringPaymentItem(freeTrial, { id: "r1", now: now() });
    const charges = projectItemCharges(item, calendarDate("2026-09-30"));
    expect(charges.map((c) => [c.dueDate, c.amount.amount])).toEqual([
      ["2026-07-20", 1290],
      ["2026-08-20", 1290],
      ["2026-09-20", 1290],
    ]);
  });

  it("charges the intro price until conversion, then the regular price", () => {
    const introPrice = makeRecurringPaymentItem(
      {
        ...freeTrial,
        amount: eur(5),
        firstChargeDate: calendarDate("2026-07-01"),
        introOffer: { regularAmount: eur(12.9), convertsOn: calendarDate("2026-09-01") },
      },
      { id: "r1", now: now() },
    );
    const charges = projectItemCharges(introPrice, calendarDate("2026-10-31"));
    expect(charges.map((c) => [c.dueDate, c.amount.amount])).toEqual([
      ["2026-07-01", 500],
      ["2026-08-01", 500],
      ["2026-09-01", 1290],
      ["2026-10-01", 1290],
    ]);
  });
});

describe("summarizeCommitments with a live free trial", () => {
  it("weighs a not-yet-converted free trial at 0, the regular price once converted", () => {
    const item = makeRecurringPaymentItem(freeTrial, { id: "r1", now: now() });
    expect(summarizeCommitments([item], calendarDate("2026-07-01")).monthly[0].amount).toBe(0);
    expect(summarizeCommitments([item], calendarDate("2026-07-20")).monthly[0].amount).toBe(1290);
  });
});

describe("graduation once a charge crosses the conversion date", () => {
  it("accrual logs the regular price and finalizes the stored schedule", () => {
    const item = makeRecurringPaymentItem(freeTrial, { id: "r1", now: now() });
    const { item: graduated, occurrences } = accrueDueOccurrences(
      item,
      calendarDate("2026-08-25"),
      {
        now: now(),
        makeId: ids(),
      },
    );
    // Two real charges (Jul 20, Aug 20), both at the regular price.
    expect(occurrences.map((o) => o.amount.amount)).toEqual([1290, 1290]);
    const s = recurring(graduated);
    expect(s.amount).toEqual(eur(12.9));
    expect(s.introOffer).toBeUndefined();
    expect(s.priceHistory[s.priceHistory.length - 1]).toEqual({
      amount: eur(12.9),
      effectiveFrom: "2026-07-20",
    });
  });

  it("accrual skips a free trial's pre-conversion zero occurrences", () => {
    const item = makeRecurringPaymentItem(
      { ...freeTrial, firstChargeDate: calendarDate("2026-07-01") },
      { id: "r1", now: now() },
    );
    const { occurrences } = accrueDueOccurrences(item, calendarDate("2026-08-25"), {
      now: now(),
      makeId: ids(),
    });
    // Jul 1 is free (skipped); only Aug 1, after conversion, is a real charge.
    expect(occurrences.map((o) => o.dueDate)).toEqual(["2026-08-01"]);
  });

  it("a manual tick-off at conversion graduates the item", () => {
    const item = makeRecurringPaymentItem(
      { ...freeTrial, settlementMode: "manual" },
      { id: "r1", now: now() },
    );
    const { item: graduated, occurrence } = recordRecurringPayment(item, {
      id: "o1",
      paidDate: calendarDate("2026-07-20"),
      now: now(),
    });
    expect(occurrence.amount).toEqual(eur(12.9));
    expect(recurring(graduated).introOffer).toBeUndefined();
    expect(recurring(graduated).amount).toEqual(eur(12.9));
  });
});

describe("trial-end reminder", () => {
  it("fires before conversion, announcing the regular price, even without a rule", () => {
    const item = makeRecurringPaymentItem(freeTrial, { id: "r1", now: now() });
    const reminders = plannedReminders([item], calendarDate("2026-07-01"));
    expect(reminders).toEqual([
      {
        id: "r1:trialEnd:2026-07-18",
        paymentItemId: "r1",
        name: "Disney+",
        amount: eur(12.9),
        dueDate: "2026-07-20",
        fireDate: "2026-07-18", // default 2-day lead
        hour: undefined,
        kind: "trialEnd",
      },
    ]);
  });

  it("uses the item's reminder lead when set, and skips the 0-priced charge", () => {
    const item = makeRecurringPaymentItem(
      { ...freeTrial, reminder: { daysBefore: 5 } },
      { id: "r1", now: now() },
    );
    const reminders = plannedReminders([item], calendarDate("2026-07-01"));
    // Only the trial-end reminder — the intro charge is free, so no charge nag.
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({ kind: "trialEnd", fireDate: "2026-07-15" });
  });

  it("flags a paid price change (non-zero intro) as priceChange, not trialEnd", () => {
    // CHF 100 now, rising to 170 on conversion — a scheduled price change.
    const priceChange = makeRecurringPaymentItem(
      {
        name: "Demi-tarif",
        amount: fromMajor(100, "CHF"),
        recurrence: RECURRENCE_PRESETS.YEARLY,
        firstChargeDate: calendarDate("2026-12-26"),
        settlementMode: "manual",
        introOffer: {
          regularAmount: fromMajor(170, "CHF"),
          convertsOn: calendarDate("2027-12-26"),
        },
      },
      { id: "r1", now: now() },
    );
    const [reminder] = plannedReminders([priceChange], calendarDate("2027-12-01"));
    expect(reminder).toMatchObject({
      kind: "priceChange",
      amount: { amount: 17000, currency: "CHF" },
      dueDate: "2027-12-26",
    });
  });
});
