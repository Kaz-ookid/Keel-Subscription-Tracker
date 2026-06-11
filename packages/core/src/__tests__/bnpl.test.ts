import { describe, expect, it } from "vitest";
import {
  BNPL_PROVIDERS,
  calendarDate,
  fromMajor,
  RECURRENCE_PRESETS,
  summarizeInstallmentPlan,
} from "../index";
import type { Installment, InstallmentSchedule } from "../index";

// The brief's canonical scenario (PROJECT_BRIEF §7 step 1): a 3x Klarna
// purchase, UNEVEN (a larger first installment, edge #2), with one installment
// flagged to be paid from a different account (the per-account differentiator).
function makePlan(installments: Installment[]): InstallmentSchedule {
  return {
    kind: "INSTALLMENT",
    totalAmount: fromMajor(900, "EUR"),
    numberOfInstallments: 3,
    recurrence: RECURRENCE_PRESETS.MONTHLY,
    firstInstallmentDate: calendarDate("2026-01-10"),
    provider: "klarna",
    originalPurchase: "iPhone 15",
    installments,
  };
}

const base = (index: number, due: string, major: number): Installment => ({
  id: `inst-${index}`,
  installmentScheduleId: "plan-1",
  index,
  dueDate: calendarDate(due),
  amount: fromMajor(major, "EUR"),
  status: "upcoming",
});

describe("summarizeInstallmentPlan", () => {
  it("reports the glanceable progress numbers for a partly-paid uneven plan", () => {
    const plan = makePlan([
      { ...base(1, "2026-01-10", 400), status: "paid", paidDate: calendarDate("2026-01-10") },
      { ...base(2, "2026-02-10", 250), paidFromAccountId: "acc-savings" }, // split account
      base(3, "2026-03-10", 250),
    ]);

    const summary = summarizeInstallmentPlan(plan);

    expect(summary.totalCount).toBe(3);
    expect(summary.paidCount).toBe(1);
    expect(summary.remainingCount).toBe(2);
    expect(summary.totalAmount).toEqual({ amount: 90000, currency: "EUR" });
    expect(summary.paidAmount).toEqual({ amount: 40000, currency: "EUR" });
    expect(summary.remainingAmount).toEqual({ amount: 50000, currency: "EUR" });
    expect(summary.finalDueDate).toBe("2026-03-10");
    expect(summary.nextDue?.index).toBe(2);
    expect(summary.isComplete).toBe(false);
  });

  it("counts an early payoff as covered (edge #3) and completes the plan", () => {
    const plan = makePlan([
      { ...base(1, "2026-01-10", 400), status: "paid" },
      { ...base(2, "2026-02-10", 250), status: "paid" },
      { ...base(3, "2026-03-10", 250), status: "settled_early" },
    ]);

    const summary = summarizeInstallmentPlan(plan);

    expect(summary.isComplete).toBe(true);
    expect(summary.remainingCount).toBe(0);
    expect(summary.remainingAmount).toEqual({ amount: 0, currency: "EUR" });
    expect(summary.nextDue).toBeUndefined();
  });

  it("exposes the provider as a typed, display-rich value", () => {
    expect(BNPL_PROVIDERS.klarna.label).toBe("Klarna");
  });
});
