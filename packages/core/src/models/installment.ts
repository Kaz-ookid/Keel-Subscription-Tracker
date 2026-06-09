import type { DescriptorMap } from "../primitives/descriptor";
import type { Money } from "../primitives/money";
import type { CalendarDate } from "../primitives/temporal";

export type InstallmentStatus =
  | "upcoming"
  | "due_soon"
  | "paid"
  | "late"
  | "skipped"
  | "settled_early";

export const INSTALLMENT_STATUSES: DescriptorMap<InstallmentStatus> = {
  upcoming: { label: "Upcoming", icon: "clock", tone: "neutral" },
  due_soon: { label: "Due soon", icon: "clock-alert", tone: "warning" },
  paid: { label: "Paid", icon: "check-circle", tone: "success" },
  late: { label: "Late", icon: "alert-circle", tone: "danger" },
  skipped: { label: "Skipped", icon: "skip", tone: "neutral" },
  // Covered ahead of schedule by an early payoff (PROJECT_BRIEF §8.3 edge #3) —
  // distinct from `skipped`, which means not paid at all.
  settled_early: { label: "Settled early", icon: "check-circle", tone: "success" },
};

/** Statuses that count as "covered" — no money is still owed for them. */
export const COVERED_INSTALLMENT_STATUSES: readonly InstallmentStatus[] = [
  "paid",
  "settled_early",
];

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
