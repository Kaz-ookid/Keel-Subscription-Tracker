import { describe, expect, it } from "vitest";
import { describeRecurrence, RECURRENCE_PRESETS } from "../index";

describe("RecurrenceRule", () => {
  it("describes interval-1 presets with their natural names", () => {
    expect(describeRecurrence(RECURRENCE_PRESETS.WEEKLY)).toBe("weekly");
    expect(describeRecurrence(RECURRENCE_PRESETS.MONTHLY)).toBe("monthly");
    expect(describeRecurrence(RECURRENCE_PRESETS.YEARLY)).toBe("yearly");
  });

  it("describes multi-interval cadences", () => {
    expect(describeRecurrence(RECURRENCE_PRESETS.QUARTERLY)).toBe("every 3 months");
    expect(describeRecurrence(RECURRENCE_PRESETS.FORTNIGHTLY)).toBe("every 2 weeks");
    expect(describeRecurrence({ unit: "day", interval: 10 })).toBe("every 10 days");
  });

  it("models quarterly as three months, not a separate unit", () => {
    expect(RECURRENCE_PRESETS.QUARTERLY).toEqual({ unit: "month", interval: 3 });
  });
});
