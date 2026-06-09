import type { BnplProviderId } from "../constants/bnpl-providers";
import type { DescriptorMap } from "../primitives/descriptor";
import type { Money } from "../primitives/money";
import type { RecurrenceRule } from "../primitives/recurrence";
import type { ReminderRule } from "../primitives/reminder";
import type { CalendarDate, Timestamp } from "../primitives/temporal";
import type { Installment } from "./installment";

export type PaymentItemStatus = "active" | "paused" | "completed" | "cancelled";

export const PAYMENT_ITEM_STATUSES: DescriptorMap<PaymentItemStatus> = {
  active: { label: "Active", icon: "play-circle", tone: "success" },
  paused: { label: "Paused", icon: "pause-circle", tone: "warning" },
  completed: { label: "Completed", icon: "check-circle", tone: "neutral" },
  cancelled: { label: "Cancelled", icon: "x-circle", tone: "neutral" },
};

// How a payment leaves the user's pocket. `automatic` is debited from a
// specific account (the per-account forecast lives here); `manual` is not
// pre-linked to any account — the user pays it from wherever and ticks it off,
// optionally recording the source account after the fact (see PaymentOccurrence).
export type SettlementMode = "automatic" | "manual";

export const SETTLEMENT_MODES: DescriptorMap<SettlementMode> = {
  automatic: { label: "Automatic", icon: "bolt", tone: "info" },
  manual: { label: "Manual", icon: "hand", tone: "warning" },
};

export type ScheduleType = "RECURRING" | "INSTALLMENT" | "ONE_TIME_ANNUAL";

export const SCHEDULE_TYPES: DescriptorMap<ScheduleType> = {
  RECURRING: { label: "Recurring", icon: "repeat", tone: "info" },
  INSTALLMENT: { label: "Installments", icon: "calendar-days", tone: "warning" },
  ONE_TIME_ANNUAL: { label: "Annual", icon: "calendar", tone: "neutral" },
};

export interface PriceHistoryEntry {
  amount: Money;
  effectiveFrom: CalendarDate;
}

// `kind` mirrors `PaymentItem.scheduleType` but lives on each variant so the
// `Schedule` union is a discriminated union TypeScript can narrow safely.
export interface RecurringSchedule {
  kind: "RECURRING";
  /** Composable cadence: every N days/weeks/months/years. */
  recurrence: RecurrenceRule;
  /** Current amount (its currency must match the item's account in v1). */
  amount: Money;
  firstChargeDate: CalendarDate;
  /** Cached/computed for fast lookups. */
  nextChargeDate: CalendarDate;
  endDate?: CalendarDate;
  /** Tracks price changes over time rather than overwriting `amount` (edge #1). */
  priceHistory: PriceHistoryEntry[];
}

export interface InstallmentSchedule {
  kind: "INSTALLMENT";
  totalAmount: Money;
  numberOfInstallments: number;
  /** Usually monthly, but any cadence is allowed. */
  recurrence: RecurrenceRule;
  firstInstallmentDate: CalendarDate;
  /** The individually-tracked payments — the explicit list is what makes
   *  "following the X payments" easy instead of deriving dates on the fly. */
  installments: Installment[];
  provider?: BnplProviderId;
  originalPurchase?: string;
}

export interface OneTimeAnnualSchedule {
  kind: "ONE_TIME_ANNUAL";
  amount: Money;
  dueDate: CalendarDate;
  recurrenceYearly: boolean;
  /** The annual-smoothing feature: spread the amount across months until due. */
  smoothIntoMonthlyBudget: boolean;
}

export type Schedule = RecurringSchedule | InstallmentSchedule | OneTimeAnnualSchedule;

export function isRecurringSchedule(schedule: Schedule): schedule is RecurringSchedule {
  return schedule.kind === "RECURRING";
}

export function isInstallmentSchedule(schedule: Schedule): schedule is InstallmentSchedule {
  return schedule.kind === "INSTALLMENT";
}

export function isOneTimeAnnualSchedule(schedule: Schedule): schedule is OneTimeAnnualSchedule {
  return schedule.kind === "ONE_TIME_ANNUAL";
}

export interface PaymentItem {
  id: string;
  name: string;
  merchant?: string;
  settlementMode: SettlementMode;
  /** The account it's charged to. Required in spirit for `automatic` payments
   *  (enforced once account management exists); omitted for `manual` ones,
   *  which aren't pre-linked to any account. */
  accountId?: string;
  categoryId?: string;
  /** Optional per-subscription colour (hex) chosen by the user; UI accent. */
  color?: string;
  /** Optional per-subscription reminder; absent = never remind. */
  reminder?: ReminderRule;
  scheduleType: ScheduleType;
  schedule: Schedule;
  status: PaymentItemStatus;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  sourceCaptureId?: string;
}
