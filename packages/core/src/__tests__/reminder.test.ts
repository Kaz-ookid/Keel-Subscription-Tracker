import { describe, expect, it } from "vitest";
import { describeReminder, REMINDER_PRESETS } from "../index";

describe("describeReminder", () => {
  it("describes the no-rule case as Never", () => {
    expect(describeReminder(undefined)).toBe("Never");
  });

  it("describes presets in natural language", () => {
    expect(describeReminder(REMINDER_PRESETS.SAME_DAY)).toBe("On the day");
    expect(describeReminder(REMINDER_PRESETS.ONE_DAY)).toBe("1 day before");
    expect(describeReminder(REMINDER_PRESETS.TWO_DAYS)).toBe("2 days before");
    expect(describeReminder(REMINDER_PRESETS.ONE_WEEK)).toBe("1 week before");
  });
});
