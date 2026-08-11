// The weekend-shift contract: the recurrence GRID stays canonical (the 1st
// shifts to the 3rd, but next month is still the 1st) while every
// externalized date — projections, the accrual's charged/paid stamps, the
// reminder countdown — moves off Saturday/Sunday per the item's rule.

import { describe, expect, it } from "vitest";
import {
  accrueDueOccurrences,
  calendarDate,
  fromMajor,
  isValidPaymentItem,
  makeRecurringPaymentItem,
  now,
  plannedReminders,
  projectItemCharges,
  RECURRENCE_PRESETS,
  shiftOffWeekend,
  updateRecurringPaymentItem,
} from "../index";
import type { NewRecurringInput } from "../index";

// 2026-08-01 is a Saturday, 2026-08-02 a Sunday (verified).
const SAT = calendarDate("2026-08-01");
const SUN = calendarDate("2026-08-02");

const base: NewRecurringInput = {
  name: "Rent",
  amount: fromMajor(1200, "CHF"),
  recurrence: RECURRENCE_PRESETS.MONTHLY,
  firstChargeDate: SAT,
  settlementMode: "automatic",
  weekendShift: "after",
};

const ids = (prefix: string) => {
  let n = 0;
  return () => `${prefix}-${++n}`;
};

describe("shiftOffWeekend", () => {
  it("moves Saturday and Sunday off the weekend, both directions", () => {
    expect(shiftOffWeekend(SAT, "before")).toBe("2026-07-31"); // Friday
    expect(shiftOffWeekend(SAT, "after")).toBe("2026-08-03"); // Monday
    expect(shiftOffWeekend(SUN, "before")).toBe("2026-07-31");
    expect(shiftOffWeekend(SUN, "after")).toBe("2026-08-03");
  });

  it("leaves weekdays and unshifted items alone", () => {
    expect(shiftOffWeekend(calendarDate("2026-08-05"), "after")).toBe("2026-08-05");
    expect(shiftOffWeekend(SAT, undefined)).toBe(SAT);
  });
});

describe("projection with a weekend shift", () => {
  it("emits shifted due dates while the grid stays anchored", () => {
    const item = makeRecurringPaymentItem(base, { id: "w1", now: now() });
    const charges = projectItemCharges(item, calendarDate("2026-11-30"));
    // Grid: Aug 1 (Sat) / Sep 1 (Tue) / Oct 1 (Thu) / Nov 1 (Sun) — only the
    // weekend ones move, and Nov stays anchored on the 1st despite August's
    // shift (banks don't drift).
    expect(charges.map((c) => c.dueDate)).toEqual([
      "2026-08-03",
      "2026-09-01",
      "2026-10-01",
      "2026-11-02",
    ]);
    // The projection is pure: the cursor still sits on the grid.
    if (item.schedule.kind !== "RECURRING") throw new Error("expected recurring");
    expect(item.schedule.nextChargeDate).toBe(SAT);
  });

  it("marks moved charges with the grid date they left", () => {
    const item = makeRecurringPaymentItem(base, { id: "w7", now: now() });
    const charges = projectItemCharges(item, calendarDate("2026-09-30"));
    // August was shifted (carries its origin); September was not (carries none).
    expect(charges[0].shiftedFrom).toBe(SAT);
    expect(charges[1].shiftedFrom).toBeUndefined();
  });
});

describe("accrual with a weekend shift", () => {
  it("waits for the shifted date, then stamps grid dueDate + shifted chargedDate", () => {
    const made = makeRecurringPaymentItem(base, { id: "w2", now: now() });
    // Saturday: the bank hasn't debited yet — nothing accrues.
    const saturday = accrueDueOccurrences(made, SAT, { now: now(), makeId: ids("a") });
    expect(saturday.occurrences).toHaveLength(0);
    // Monday: the money moved. The ledger keeps the GRID due date (month
    // attribution, rewind) and records the real debit day alongside.
    const monday = accrueDueOccurrences(made, calendarDate("2026-08-03"), {
      now: now(),
      makeId: ids("b"),
    });
    expect(monday.occurrences).toHaveLength(1);
    expect(monday.occurrences[0].dueDate).toBe(SAT);
    expect(monday.occurrences[0].chargedDate).toBe("2026-08-03");
    expect(monday.occurrences[0].paidDate).toBe("2026-08-03");
    if (monday.item.schedule.kind !== "RECURRING") throw new Error("expected recurring");
    expect(monday.item.schedule.nextChargeDate).toBe("2026-09-01");
  });

  it("a 'before' shift debits on the Friday", () => {
    const made = makeRecurringPaymentItem(
      { ...base, weekendShift: "before" },
      {
        id: "w3",
        now: now(),
      },
    );
    const friday = accrueDueOccurrences(made, calendarDate("2026-07-31"), {
      now: now(),
      makeId: ids("c"),
    });
    expect(friday.occurrences).toHaveLength(1);
    expect(friday.occurrences[0].dueDate).toBe(SAT);
    expect(friday.occurrences[0].chargedDate).toBe("2026-07-31");
  });
});

describe("reminders with a weekend shift", () => {
  it("counts the lead back from the shifted date", () => {
    const item = makeRecurringPaymentItem(
      { ...base, settlementMode: "manual", reminder: { daysBefore: 2 } },
      { id: "w4", now: now() },
    );
    const planned = plannedReminders([item], calendarDate("2026-07-28"));
    expect(planned).toHaveLength(1);
    expect(planned[0].dueDate).toBe("2026-08-03");
    expect(planned[0].fireDate).toBe("2026-08-01");
  });
});

describe("the rule survives edits and validation", () => {
  it("rides through updateRecurringPaymentItem", () => {
    const item = makeRecurringPaymentItem(base, { id: "w5", now: now() });
    const edited = updateRecurringPaymentItem(item, { ...base, name: "Rent v2" }, { now: now() });
    expect(edited.weekendShift).toBe("after");
  });

  it("validates the enum, rejects anything else", () => {
    const item = makeRecurringPaymentItem(base, { id: "w6", now: now() });
    expect(isValidPaymentItem(item)).toBe(true);
    expect(isValidPaymentItem({ ...item, weekendShift: "sometimes" })).toBe(false);
  });
});
