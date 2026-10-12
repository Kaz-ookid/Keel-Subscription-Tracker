import { describe, expect, it } from "vitest";
import { calendarDate, nextDigestDates } from "../index";

describe("nextDigestDates", () => {
  it("is empty when off", () => {
    expect(nextDigestDates({ mode: "off" }, calendarDate("2026-10-12"), 3)).toEqual([]);
  });

  it("runs daily from the day itself", () => {
    expect(nextDigestDates({ mode: "daily" }, calendarDate("2026-12-30"), 3)).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
    ]);
  });

  it("lands on the weekday first, then steps a week at a time", () => {
    // 2026-10-12 is a Monday; Friday is 5.
    expect(nextDigestDates({ mode: "weekly", weekday: 5 }, calendarDate("2026-10-12"), 2)).toEqual([
      "2026-10-16",
      "2026-10-23",
    ]);
    // Already that weekday: today counts.
    expect(nextDigestDates({ mode: "weekly", weekday: 1 }, calendarDate("2026-10-12"), 1)).toEqual([
      "2026-10-12",
    ]);
  });

  it("monthly keeps its day and rolls the year over", () => {
    expect(nextDigestDates({ mode: "monthly", day: 15 }, calendarDate("2026-11-20"), 3)).toEqual([
      "2026-12-15",
      "2027-01-15",
      "2027-02-15",
    ]);
    expect(nextDigestDates({ mode: "monthly", day: 15 }, calendarDate("2026-11-15"), 1)).toEqual([
      "2026-11-15",
    ]);
  });
});
