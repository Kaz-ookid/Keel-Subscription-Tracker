import { describe, expect, it } from "vitest";
import { RECURRENCE_PRESETS } from "../index";

describe("RecurrenceRule", () => {
  it("models quarterly as three months, not a separate unit", () => {
    expect(RECURRENCE_PRESETS.QUARTERLY).toEqual({ unit: "month", interval: 3 });
  });
});
