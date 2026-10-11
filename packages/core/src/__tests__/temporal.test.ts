import { describe, expect, it } from "vitest";
import { calendarDate, formatCalendarDate, isCalendarDate, today } from "../index";

describe("CalendarDate", () => {
  it("accepts a valid YYYY-MM-DD day", () => {
    expect(isCalendarDate("2026-06-01")).toBe(true);
    expect(calendarDate("2026-06-01")).toBe("2026-06-01");
  });

  it("rejects malformed or impossible dates", () => {
    expect(isCalendarDate("2026-13-40")).toBe(false);
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("06/01/2026")).toBe(false);
    expect(() => calendarDate("not-a-date")).toThrow(RangeError);
  });

  it("does not accept an instant as a calendar date", () => {
    expect(isCalendarDate("2026-06-01T14:30:00Z")).toBe(false);
  });

  it("formats European-style DD.MM.YYYY for display", () => {
    expect(formatCalendarDate(calendarDate("2026-06-08"))).toBe("08.06.2026");
    expect(formatCalendarDate(calendarDate("2026-12-31"))).toBe("31.12.2026");
  });
});

describe("today", () => {
  it("is the local calendar day, not the UTC one", () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    expect(today()).toBe(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  });
});
