import { describe, expect, it } from "vitest";
import { addRecurrence, calendarDate, nextDueDate, RECURRENCE_PRESETS } from "../index";

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
    expect(addRecurrence(calendarDate("2026-06-08"), RECURRENCE_PRESETS.YEARLY)).toBe(
      "2027-06-08",
    );
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
