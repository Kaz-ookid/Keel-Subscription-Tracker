// The historical spending ledger: every actual outflow as an itemized,
// chronological record — the data behind the History tab. Distinct from
// `insights.ts` (aggregates/shapes) and the calendar grid (one month): this is
// the flat, searchable, filterable statement of what actually happened.

import { COVERED_INSTALLMENT_STATUSES } from "../models/installment";
import { isInstallmentSchedule, type PaymentItem } from "../models/payment-item";
import type { PaymentOccurrence } from "../models/payment-occurrence";
import type { Money } from "../primitives/money";
import type { CalendarDate } from "../primitives/temporal";

export interface LedgerEntry {
  /** The item this charge belongs to (the row links to it). */
  paymentItemId: string;
  /** Item display fields, resolved at build time. */
  name: string;
  domain?: string;
  color?: string;
  categoryId?: string;
  /** The account it was paid from (occurrence's, else the item's). */
  accountId?: string;
  /** The charge date (a recurring due date or an installment due date). */
  date: CalendarDate;
  /** The actual amount that went out (occurrences capture FX / price drift). */
  amount: Money;
  kind: "charge" | "installment";
}

/**
 * Every actual outflow within `[from, to]`, newest first: recurring
 * occurrences marked `charged`, plus covered (paid) Pay-in-X installments —
 * the same two real-money sources the calendar reads, minus the future
 * projection. Entries are resolved against their item; charges whose item is
 * gone are skipped (matching the calendar's behaviour). Pure.
 */
export function buildSpendLedger(
  items: readonly PaymentItem[],
  occurrences: readonly PaymentOccurrence[],
  from: CalendarDate,
  to: CalendarDate,
): LedgerEntry[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const entries: LedgerEntry[] = [];

  for (const o of occurrences) {
    if (o.status !== "charged" || o.dueDate < from || o.dueDate > to) continue;
    const item = byId.get(o.paymentItemId);
    if (!item) continue;
    entries.push({
      paymentItemId: item.id,
      name: item.name,
      domain: item.domain,
      color: item.color,
      categoryId: item.categoryId,
      accountId: o.paidFromAccountId ?? item.accountId,
      date: o.dueDate,
      amount: o.amount,
      kind: "charge",
    });
  }

  for (const item of items) {
    if (!isInstallmentSchedule(item.schedule)) continue;
    for (const inst of item.schedule.installments) {
      if (!COVERED_INSTALLMENT_STATUSES.includes(inst.status)) continue;
      if (inst.dueDate < from || inst.dueDate > to) continue;
      entries.push({
        paymentItemId: item.id,
        name: item.name,
        domain: item.domain,
        color: item.color,
        categoryId: item.categoryId,
        accountId: inst.paidFromAccountId ?? item.accountId,
        date: inst.dueDate,
        amount: inst.amount,
        kind: "installment",
      });
    }
  }

  // Newest first; alphabetical within a day for a stable order.
  return entries.sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : a.name.localeCompare(b.name),
  );
}
