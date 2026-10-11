import { describe, expect, it } from "vitest";
import {
  addRecurrence,
  alignToOccurrence,
  anchorFromDate,
  calendarDate,
  listOccurrenceDates,
  nextDueDate,
  nextOnGrid,
  nthWeekdayOfMonth,
  RECURRENCE_PRESETS,
  type RecurrenceRule,
} from "../index";

describe("addRecurrence", () => {
  it("adds days and weeks exactly", () => {
    expect(addRecurrence(calendarDate("2026-01-01"), { unit: "day", interval: 10 })).toBe(
      "2026-01-11",
    );
    expect(addRecurrence(calendarDate("2026-01-01"), RECURRENCE_PRESETS.FORTNIGHTLY)).toBe(
      "2026-01-15",
    );
  });

  it("clamps end-of-month when adding months", () => {
    // Jan 31 + 1 month → Feb 28, not an overflow into March.
    expect(addRecurrence(calendarDate("2026-01-31"), RECURRENCE_PRESETS.MONTHLY)).toBe(
      "2026-02-28",
    );
  });

  it("respects leap years", () => {
    // 2028 is a leap year, so Jan 31 + 1 month → Feb 29.
    expect(addRecurrence(calendarDate("2028-01-31"), RECURRENCE_PRESETS.MONTHLY)).toBe(
      "2028-02-29",
    );
  });

  it("rolls the year over and handles yearly", () => {
    expect(addRecurrence(calendarDate("2026-11-15"), RECURRENCE_PRESETS.QUARTERLY)).toBe(
      "2027-02-15",
    );
    expect(addRecurrence(calendarDate("2026-06-08"), RECURRENCE_PRESETS.YEARLY)).toBe("2027-06-08");
  });
});

describe("nextDueDate", () => {
  it("returns the first occurrence strictly after asOf", () => {
    const first = calendarDate("2026-01-15");
    expect(nextDueDate(first, RECURRENCE_PRESETS.MONTHLY, calendarDate("2026-03-20"))).toBe(
      "2026-04-15",
    );
  });

  it("returns the first charge unchanged when it's still in the future", () => {
    const first = calendarDate("2026-12-01");
    expect(nextDueDate(first, RECURRENCE_PRESETS.MONTHLY, calendarDate("2026-06-08"))).toBe(
      "2026-12-01",
    );
  });
});

describe("listOccurrenceDates", () => {
  it("returns the first N dates of the schedule grid", () => {
    expect(listOccurrenceDates(calendarDate("2026-01-05"), RECURRENCE_PRESETS.MONTHLY, 4)).toEqual([
      "2026-01-05",
      "2026-02-05",
      "2026-03-05",
      "2026-04-05",
    ]);
  });

  it("comes back to the anchor day after a short month instead of drifting", () => {
    expect(listOccurrenceDates(calendarDate("2026-01-31"), RECURRENCE_PRESETS.MONTHLY, 4)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
    expect(
      nextDueDate(
        calendarDate("2026-01-31"),
        RECURRENCE_PRESETS.MONTHLY,
        calendarDate("2026-02-28"),
      ),
    ).toBe("2026-03-31");
    // A leap-day yearly plan: Feb 28 in common years, Feb 29 when it exists.
    expect(listOccurrenceDates(calendarDate("2028-02-29"), RECURRENCE_PRESETS.YEARLY, 5)).toEqual([
      "2028-02-29",
      "2029-02-28",
      "2030-02-28",
      "2031-02-28",
      "2032-02-29",
    ]);
  });

  it("steps a cursor on its grid even when the cursor itself sits on a clamped day", () => {
    expect(
      nextOnGrid(
        calendarDate("2026-01-31"),
        RECURRENCE_PRESETS.MONTHLY,
        calendarDate("2026-02-28"),
      ),
    ).toBe("2026-03-31");
    // A plain step from a date has no grid and keeps the old behavior.
    expect(addRecurrence(calendarDate("2026-02-28"), RECURRENCE_PRESETS.MONTHLY)).toBe(
      "2026-03-28",
    );
  });
});

describe("weekday-anchored monthly rules", () => {
  // June 2026: the 1st is a Monday; first Thursday = the 4th; last Thursday = the 25th.
  const firstThursday: RecurrenceRule = {
    unit: "month",
    interval: 1,
    anchor: { week: 1, weekday: 4 },
  };

  it("resolves the nth weekday of a month, including 'last'", () => {
    expect(nthWeekdayOfMonth(calendarDate("2026-06-01"), { week: 1, weekday: 4 })).toBe(
      "2026-06-04",
    );
    expect(nthWeekdayOfMonth(calendarDate("2026-06-15"), { week: 3, weekday: 1 })).toBe(
      "2026-06-15", // 3rd Monday — any day of the month identifies it
    );
    expect(nthWeekdayOfMonth(calendarDate("2026-06-01"), { week: "last", weekday: 4 })).toBe(
      "2026-06-25",
    );
  });

  it("derives the anchor back from a date (5th occurrence → 'last')", () => {
    expect(anchorFromDate(calendarDate("2026-06-04"))).toEqual({ week: 1, weekday: 4 });
    expect(anchorFromDate(calendarDate("2026-06-15"))).toEqual({ week: 3, weekday: 1 });
    // 2026-06-30 is the 5th Tuesday of June.
    expect(anchorFromDate(calendarDate("2026-06-30"))).toEqual({ week: "last", weekday: 2 });
  });

  it("steps month to month landing on the anchor, not a clamped day", () => {
    // 1st Thursday: Jun 4 → Jul 2 → Aug 6 (date-anchored would give 4, 4, 4).
    const july = addRecurrence(calendarDate("2026-06-04"), firstThursday);
    expect(july).toBe("2026-07-02");
    expect(addRecurrence(july, firstThursday)).toBe("2026-08-06");

    // Every 2 months on the last Friday: Jun 26 → Aug 28.
    expect(
      addRecurrence(calendarDate("2026-06-26"), {
        unit: "month",
        interval: 2,
        anchor: { week: "last", weekday: 5 },
      }),
    ).toBe("2026-08-28");
  });

  it("threads the anchor through the occurrence grid", () => {
    expect(listOccurrenceDates(calendarDate("2026-06-04"), firstThursday, 3)).toEqual([
      "2026-06-04",
      "2026-07-02",
      "2026-08-06",
    ]);
  });
});

describe("alignToOccurrence", () => {
  const first = calendarDate("2026-01-05");

  it("returns an on-grid date unchanged", () => {
    expect(alignToOccurrence(first, RECURRENCE_PRESETS.MONTHLY, calendarDate("2026-04-05"))).toBe(
      "2026-04-05",
    );
  });

  it("snaps an off-grid date down to the latest occurrence before it", () => {
    // Bills on the 5th; the 12th isn't a billing date → snap to the 5th.
    expect(alignToOccurrence(first, RECURRENCE_PRESETS.MONTHLY, calendarDate("2026-04-12"))).toBe(
      "2026-04-05",
    );
  });

  it("clamps a date before the first occurrence to the first", () => {
    expect(alignToOccurrence(first, RECURRENCE_PRESETS.MONTHLY, calendarDate("2025-12-25"))).toBe(
      "2026-01-05",
    );
  });
});
