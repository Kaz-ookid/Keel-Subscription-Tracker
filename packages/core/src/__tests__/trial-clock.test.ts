import { describe, expect, it } from "vitest";

import { addDays, calendarDate, daysBetween, earliestAnchor, TRIAL_DAYS, trialStatus } from "..";

const day = calendarDate;

describe("daysBetween", () => {
  it("counts whole days in both directions", () => {
    expect(daysBetween(day("2026-08-01"), day("2026-08-01"))).toBe(0);
    expect(daysBetween(day("2026-08-01"), day("2026-08-12"))).toBe(11);
    expect(daysBetween(day("2026-08-12"), day("2026-08-01"))).toBe(-11);
  });

  it("crosses month, year and leap boundaries", () => {
    expect(daysBetween(day("2026-01-31"), day("2026-02-01"))).toBe(1);
    expect(daysBetween(day("2025-12-31"), day("2026-01-01"))).toBe(1);
    // 2028 is a leap year: Feb 28 -> Mar 1 is two days.
    expect(daysBetween(day("2028-02-28"), day("2028-03-01"))).toBe(2);
  });
});

describe("earliestAnchor", () => {
  it("picks the earliest valid date across legs", () => {
    expect(earliestAnchor(["2026-06-10", "2026-05-01", "2026-08-01"])).toBe("2026-05-01");
  });

  it("skips missing and corrupted legs", () => {
    expect(earliestAnchor([null, undefined, "", "not-a-date", "2026-02-30", "2026-06-10"])).toBe(
      "2026-06-10",
    );
  });

  it("returns null when nothing valid survives", () => {
    expect(earliestAnchor([null, undefined, "garbage"])).toBeNull();
    expect(earliestAnchor([])).toBeNull();
  });
});

describe("trialStatus", () => {
  const anchor = day("2026-06-01");

  it("is fresh with no anchor: nothing started, full allowance reported", () => {
    expect(trialStatus(null, day("2026-08-12"))).toEqual({
      state: "fresh",
      daysLeft: TRIAL_DAYS,
    });
  });

  it("counts the anchor day as day one", () => {
    expect(trialStatus(anchor, anchor)).toEqual({ state: "trial", daysLeft: TRIAL_DAYS });
  });

  it("still runs on the last valid day, with one day left", () => {
    const lastValid = addDays(anchor, TRIAL_DAYS - 1);
    expect(trialStatus(anchor, lastValid)).toEqual({ state: "trial", daysLeft: 1 });
  });

  it("expires exactly one day after the last valid day", () => {
    const firstExpired = addDays(anchor, TRIAL_DAYS);
    expect(trialStatus(anchor, firstExpired)).toEqual({ state: "expired", daysLeft: 0 });
  });

  it("stays expired far past the boundary", () => {
    expect(trialStatus(anchor, addDays(anchor, 400))).toEqual({ state: "expired", daysLeft: 0 });
  });

  it("treats a future anchor (clock rolled back) as day one", () => {
    expect(trialStatus(anchor, day("2026-05-20"))).toEqual({
      state: "trial",
      daysLeft: TRIAL_DAYS,
    });
  });
});
