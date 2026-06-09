import type { DescriptorMap } from "../primitives/descriptor";
import type { Money } from "../primitives/money";
import type { CalendarDate, Timestamp } from "../primitives/temporal";

export type PaymentOccurrenceStatus = "upcoming" | "charged" | "failed" | "refunded";

export const PAYMENT_OCCURRENCE_STATUSES: DescriptorMap<PaymentOccurrenceStatus> = {
  upcoming: { label: "Upcoming", icon: "clock", tone: "neutral" },
  charged: { label: "Charged", icon: "check-circle", tone: "success" },
  failed: { label: "Failed", icon: "alert-circle", tone: "danger" },
  refunded: { label: "Refunded", icon: "arrow-uturn-left", tone: "info" },
};

export interface PaymentOccurrence {
  id: string;
  paymentItemId: string;
  dueDate: CalendarDate;
  /** Actual debit date — can differ from the due date. */
  chargedDate?: CalendarDate;
  /** Actual amount charged (can differ from expected: price change, FX). */
  amount: Money;
  status: PaymentOccurrenceStatus;
  /** When the user marked it paid (manual tick-off). */
  paidDate?: CalendarDate;
  /** Which account it was actually paid from — recorded after the fact for
   *  manual payments, which aren't pre-linked to an account. */
  paidFromAccountId?: string;
  /** When this event was logged (audit time) — distinct from the economic
   *  dueDate/paidDate. Anchors the historical spending ledger. */
  recordedAt: Timestamp;
  sourceCaptureId?: string;
}
