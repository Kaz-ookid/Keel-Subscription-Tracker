import { describe, expect, it } from "vitest";
import {
  calendarDate,
  fromMajor,
  isInstallmentSchedule,
  isRecurringSchedule,
  now,
  RECURRENCE_PRESETS,
} from "../index";
import type { Account, PaymentItem, RecurringSchedule } from "../index";

describe("@keel/core models", () => {
  it("composes an Account, a RecurringSchedule and a PaymentItem", () => {
    const account: Account = {
      id: "acc-1",
      name: "Compte courant",
      currency: "EUR",
      type: "checking",
      color: "#0B1E3F",
      icon: "bank",
      isArchived: false,
    };

    const schedule: RecurringSchedule = {
      kind: "RECURRING",
      recurrence: RECURRENCE_PRESETS.MONTHLY,
      amount: fromMajor(15.99, "EUR"),
      firstChargeDate: calendarDate("2026-01-15"),
      nextChargeDate: calendarDate("2026-07-15"),
      priceHistory: [
        { amount: fromMajor(15.99, "EUR"), effectiveFrom: calendarDate("2026-01-15") },
      ],
    };

    const item: PaymentItem = {
      id: "item-1",
      name: "Netflix",
      settlementMode: "automatic",
      accountId: account.id,
      scheduleType: "RECURRING",
      schedule,
      status: "active",
      createdAt: now(),
      updatedAt: now(),
    };

    expect(item.schedule.kind).toBe("RECURRING");
    expect(item.accountId).toBe(account.id);
    expect(schedule.amount).toEqual({ amount: 1599, currency: "EUR" });
  });

  it("narrows the polymorphic Schedule union via the type guards", () => {
    const schedule: RecurringSchedule = {
      kind: "RECURRING",
      recurrence: RECURRENCE_PRESETS.MONTHLY,
      amount: fromMajor(9.99, "EUR"),
      firstChargeDate: calendarDate("2026-01-01"),
      nextChargeDate: calendarDate("2026-07-01"),
      priceHistory: [
        { amount: fromMajor(9.99, "EUR"), effectiveFrom: calendarDate("2026-01-01") },
      ],
    };

    expect(isRecurringSchedule(schedule)).toBe(true);
    expect(isInstallmentSchedule(schedule)).toBe(false);
  });
});
