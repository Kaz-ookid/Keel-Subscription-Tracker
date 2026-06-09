// The "at a glance" surface that makes BNPL the app's #1 differentiator
// (PROJECT_BRIEF §3.1): how many payments are left, how much is still owed,
// and when the plan finishes. This is a pure SELECTOR over current installment
// state — not forecast math — so it lives here, not in a (still-absent)
// calculations/ module.

import { sumMoney, type Money } from "../primitives/money";
import type { CalendarDate } from "../primitives/temporal";
import {
  COVERED_INSTALLMENT_STATUSES,
  type Installment,
} from "./installment";
import type { InstallmentSchedule } from "./payment-item";

export interface InstallmentPlanSummary {
  totalCount: number;
  /** Installments already covered (paid or settled early). */
  paidCount: number;
  /** Installments still owed. */
  remainingCount: number;
  /** Sum of every installment — the true plan total (uneven-safe, edge #2). */
  totalAmount: Money;
  /** Sum of the covered installments. */
  paidAmount: Money;
  /** Sum of what's still owed — the headline "how much is left" number. */
  remainingAmount: Money;
  /** Latest due date across the plan — "when it finishes". */
  finalDueDate: CalendarDate;
  /** The earliest still-owed installment, if any. */
  nextDue?: Installment;
  isComplete: boolean;
}

function isCovered(installment: Installment): boolean {
  return COVERED_INSTALLMENT_STATUSES.includes(installment.status);
}

/**
 * Derive a plan's progress from its installments' current statuses. Amounts are
 * summed from the installments themselves (source of truth) so uneven plans
 * (a larger down-payment) report correctly. Throws if the plan has no
 * installments — an installment plan must have at least one.
 */
export function summarizeInstallmentPlan(
  schedule: InstallmentSchedule,
): InstallmentPlanSummary {
  const { installments, totalAmount } = schedule;
  if (installments.length === 0) {
    throw new RangeError("Installment plan has no installments");
  }

  const currency = totalAmount.currency;
  const covered = installments.filter(isCovered);
  const remaining = installments.filter((i) => !isCovered(i));

  // CalendarDate is YYYY-MM-DD, so lexicographic max == chronological max —
  // no date arithmetic needed.
  const finalDueDate = installments.reduce<CalendarDate>(
    (latest, i) => (i.dueDate > latest ? i.dueDate : latest),
    installments[0].dueDate,
  );

  const nextDue = remaining.reduce<Installment | undefined>((earliest, i) => {
    if (!earliest || i.dueDate < earliest.dueDate) return i;
    return earliest;
  }, undefined);

  return {
    totalCount: installments.length,
    paidCount: covered.length,
    remainingCount: remaining.length,
    totalAmount: sumMoney(installments.map((i) => i.amount), currency),
    paidAmount: sumMoney(covered.map((i) => i.amount), currency),
    remainingAmount: sumMoney(remaining.map((i) => i.amount), currency),
    finalDueDate,
    nextDue,
    isComplete: remaining.length === 0,
  };
}
