import type { BnplProviderId } from "../constants/bnpl-providers";
import type { DescriptorMap } from "../primitives/descriptor";
import type { Money } from "../primitives/money";
import type { RecurrenceRule } from "../primitives/recurrence";
import type { ReminderRule } from "../primitives/reminder";
import type { WeekendShift } from "../primitives/schedule-dates";
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

/**
 * A trial / introductory offer: the schedule's `amount` is the intro price
 * (often `money(0)` = a free trial) charged for occurrences BEFORE
 * `convertsOn`; from `convertsOn` onward the price is `regularAmount`. A trial
 * is just a scheduled price change — see `effectiveRecurringAmount`. Once a
 * real charge crosses `convertsOn` the schedule "graduates": `amount` becomes
 * `regularAmount`, the change lands in `priceHistory`, and `introOffer` clears.
 */
export interface IntroOffer {
  regularAmount: Money;
  convertsOn: CalendarDate;
}

// `kind` mirrors `PaymentItem.scheduleType` but lives on each variant so the
// `Schedule` union is a discriminated union TypeScript can narrow safely.
export interface RecurringSchedule {
  kind: "RECURRING";
  /** Composable cadence: every N days/weeks/months/years. */
  recurrence: RecurrenceRule;
  /** Current amount (its currency must match the item's account in v1).
   *  With an `introOffer`, this is the intro/trial price until conversion. */
  amount: Money;
  firstChargeDate: CalendarDate;
  /** Cached/computed for fast lookups. */
  nextChargeDate: CalendarDate;
  endDate?: CalendarDate;
  /** Tracks price changes over time rather than overwriting `amount` (edge #1). */
  priceHistory: PriceHistoryEntry[];
  /** A live trial/intro offer: the price changes to `regularAmount` on
   *  `convertsOn`. Absent once the trial has converted (or never had one). */
  introOffer?: IntroOffer;
}

/** The price actually in effect on a given date: the regular price once a
 *  trial/intro offer has converted, otherwise the schedule's (intro) `amount`.
 *  The single source of truth every charge-amount read should flow through —
 *  flat-amount items (no `introOffer`) return `amount` unchanged. */
export function effectiveRecurringAmount(schedule: RecurringSchedule, on: CalendarDate): Money {
  const offer = schedule.introOffer;
  return offer && on >= offer.convertsOn ? offer.regularAmount : schedule.amount;
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
  /** Optional brand website (e.g. "netflix.com") — platforms may fetch a
   *  logo from it at runtime; never required, plain text only. */
  domain?: string;
  /** Optional per-subscription reminder; absent = never remind. Kept as the
   *  MIRROR of `reminders[0]` for blobs read by older builds — read through
   *  `reminderRules()`, never directly. */
  reminder?: ReminderRule;
  /** The full set of reminder rules (up to a few). Wins over `reminder`
   *  when present; writers keep `reminder` mirrored to the first entry. */
  reminders?: readonly ReminderRule[];
  /** The bank never debits this one on a weekend: charges landing on Sat/Sun
   *  effectively move to the Friday before or the Monday after. The
   *  recurrence grid stays canonical; only externalized dates shift.
   *  Absent = charges on the calendar day. (v2 slot: a holidayCalendar
   *  country code beside this for public-holiday shifting.) */
  weekendShift?: WeekendShift;
  scheduleType: ScheduleType;
  schedule: Schedule;
  status: PaymentItemStatus;
  notes?: string;
  /** Audit-only bookkeeping (decided 2026-06-12): when the RECORD was made,
   *  not when the commitment started. Analytics/spending-ramp work anchors on
   *  `firstChargeDate`/`firstInstallmentDate` instead — a sub entered today
   *  may have been billing for years. `updatedAt` additionally earns its keep
   *  later as the conflict-resolution key once multi-device sync exists.
   *  Never surface these in UI or calculations. */
  createdAt: Timestamp;
  updatedAt: Timestamp;
  sourceCaptureId?: string;
}
