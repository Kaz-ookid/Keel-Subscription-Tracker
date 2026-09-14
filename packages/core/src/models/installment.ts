import type { Money } from "../primitives/money";
import type { CalendarDate } from "../primitives/temporal";

// `settled_early` = covered ahead of schedule by an early payoff — distinct
// from `skipped`, which means not paid at all.
export type InstallmentStatus =
  | "upcoming"
  | "due_soon"
  | "paid"
  | "late"
  | "skipped"
  | "settled_early";

/** Statuses that count as "covered" — no money is still owed for them. */
export const COVERED_INSTALLMENT_STATUSES: readonly InstallmentStatus[] = ["paid", "settled_early"];

export interface Installment {
  id: string;
  installmentScheduleId: string;
  index: number;
  dueDate: CalendarDate;
  /** Per-record, not derived — BNPL down-payments are often uneven (edge #2). */
  amount: Money;
  status: InstallmentStatus;
  paidDate?: CalendarDate;
  /** Usually the parent's account, but can differ for a single installment. */
  paidFromAccountId?: string;
}
