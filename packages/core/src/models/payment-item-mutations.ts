// State transitions of an existing PaymentItem: edits, manual tick-offs,
// automatic catch-up, installment payments. Kept apart from the factories
// (payment-item-factory.ts) so creation and mutation each read in one sitting.
// Same purity contract: all non-determinism (ids, "now") is injected.

import type { RecurrenceRule } from "../primitives/recurrence";
import { addDays, nextDueDate, nextOnGrid, shiftOffWeekend } from "../primitives/schedule-dates";
import { calendarDate, type CalendarDate, type Timestamp } from "../primitives/temporal";
import {
  COVERED_INSTALLMENT_STATUSES,
  type Installment,
  type InstallmentStatus,
} from "./installment";
import {
  makeInstallmentPaymentItem,
  makeRecurringPaymentItem,
  type NewInstallmentInput,
  type NewRecurringInput,
} from "./payment-item-factory";
import {
  effectiveRecurringAmount,
  type PaymentItem,
  type PriceHistoryEntry,
  type RecurringSchedule,
} from "./payment-item";
import type { PaymentOccurrence } from "./payment-occurrence";
import { isRecurringSchedule } from "./payment-item";

/**
 * Finalize a trial/intro once a real charge has reached its conversion date:
 * the regular price becomes the standing `amount`, the change is recorded in
 * `priceHistory` (so it shows up in the Price-changes insight — it genuinely
 * is one), and `introOffer` clears. No-op when there's no offer or the date
 * hasn't reached `convertsOn` yet.
 */
function graduateIfConverted(
  schedule: RecurringSchedule,
  through: CalendarDate,
): RecurringSchedule {
  const offer = schedule.introOffer;
  if (!offer || through < offer.convertsOn) return schedule;
  return {
    ...schedule,
    amount: offer.regularAmount,
    priceHistory: [
      ...schedule.priceHistory,
      { amount: offer.regularAmount, effectiveFrom: offer.convertsOn },
    ],
    introOffer: undefined,
  };
}

export interface UpdateContext {
  now: Timestamp;
  /** The local calendar day, for a price change's `effectiveFrom`. Falls
   *  back to the UTC day of `now` when absent. */
  today?: CalendarDate;
  /**
   * Latest recorded charge date for this item (max `dueDate` from the occurrence
   * ledger). Anchors the recomputed `nextChargeDate` so it never regresses behind
   * a charge that already happened. Omit when nothing has been charged yet.
   */
  lastChargedDate?: CalendarDate;
  /**
   * What an amount edit MEANS. "change" (default): the provider raised or
   * lowered the price — append to `priceHistory` so the Price-changes insight
   * sees it. "correction": the old number was the user's typo, not a real
   * change — rewrite the latest entry in place, never recording a change.
   */
  priceEdit?: "change" | "correction";
}

function sameRecurrence(a: RecurrenceRule, b: RecurrenceRule): boolean {
  return (
    a.unit === b.unit &&
    a.interval === b.interval &&
    a.anchor?.week === b.anchor?.week &&
    a.anchor?.weekday === b.anchor?.weekday
  );
}

/** Collapse neighbors that no longer differ (a rewrite/removal can leave two
 *  equal prices side by side — that is no change at all). */
function dedupeConsecutiveAmounts(history: PriceHistoryEntry[]): PriceHistoryEntry[] {
  return history.filter(
    (e, i) =>
      i === 0 ||
      e.amount.amount !== history[i - 1].amount.amount ||
      e.amount.currency !== history[i - 1].amount.currency,
  );
}

/**
 * Apply edits to a RECURRING item, preserving its `id`/`createdAt` and keeping
 * its derived/linked values consistent: the cached `nextChargeDate` cursor is
 * recomputed from the (possibly new) schedule, and `priceHistory` gains an entry
 * only when the amount actually changed. Throws if `existing` isn't recurring.
 */
export function updateRecurringPaymentItem(
  existing: PaymentItem,
  input: NewRecurringInput,
  ctx: UpdateContext,
): PaymentItem {
  if (existing.schedule.kind !== "RECURRING") {
    throw new TypeError("updateRecurringPaymentItem expects a RECURRING item");
  }
  const previous = existing.schedule;
  const rebuilt = makeRecurringPaymentItem(input, { id: existing.id, now: ctx.now });
  if (rebuilt.schedule.kind !== "RECURRING") {
    throw new TypeError("rebuilt item is not recurring"); // unreachable
  }

  // The "next charge" cursor. On an unchanged grid the stored cursor is the
  // truth about what was paid OR skipped: a resume moves it past the paused
  // months without a ledger row, so recomputing it from the last recorded
  // charge would rewind it and the next catch-up would log the paused
  // months as paid. It only moves forward here, never behind a recorded
  // charge. A changed first date or recurrence recomputes it on the new
  // grid (the snapped first date, not the raw input).
  const grid = rebuilt.schedule;
  const afterLastCharge = ctx.lastChargedDate
    ? nextDueDate(grid.firstChargeDate, grid.recurrence, ctx.lastChargedDate)
    : grid.firstChargeDate;
  const sameGrid =
    grid.firstChargeDate === previous.firstChargeDate &&
    sameRecurrence(grid.recurrence, previous.recurrence);
  const nextChargeDate =
    sameGrid && previous.nextChargeDate > afterLastCharge
      ? previous.nextChargeDate
      : afterLastCharge;

  // Keep the price history; act only when the amount actually changed. A
  // "change" appends (the Price-changes insight reads it); a "correction"
  // rewrites the latest entry in place — a typo was never a price change.
  const lastEntry = previous.priceHistory[previous.priceHistory.length - 1];
  const amountChanged =
    !lastEntry ||
    lastEntry.amount.amount !== input.amount.amount ||
    lastEntry.amount.currency !== input.amount.currency;
  let priceHistory = previous.priceHistory;
  if (amountChanged) {
    priceHistory =
      ctx.priceEdit === "correction" && lastEntry
        ? dedupeConsecutiveAmounts([
            ...previous.priceHistory.slice(0, -1),
            { ...lastEntry, amount: input.amount },
          ])
        : [
            ...previous.priceHistory,
            {
              amount: input.amount,
              effectiveFrom: ctx.today ?? calendarDate(ctx.now.slice(0, 10)),
            },
          ];
  }

  return {
    ...rebuilt,
    createdAt: existing.createdAt,
    schedule: { ...rebuilt.schedule, nextChargeDate, priceHistory },
  };
}

/**
 * Erase one recorded price change — the repair for "I saved a wrong amount
 * and the fix got recorded as a raise". Removes the `priceHistory` entry at
 * `effectiveFrom` (never the first: that's the signup price, not a change),
 * collapses any now-equal neighbors, and, when the removed entry was the
 * latest, reverts the standing amount to the price before it. No-op on
 * non-recurring items or when no such entry exists.
 */
export function removePriceChange(
  item: PaymentItem,
  ctx: { effectiveFrom: CalendarDate; now: Timestamp },
): PaymentItem {
  if (item.schedule.kind !== "RECURRING") return item;
  const schedule = item.schedule;
  const idx = schedule.priceHistory.findIndex((e) => e.effectiveFrom === ctx.effectiveFrom);
  if (idx <= 0) return item;
  const wasLast = idx === schedule.priceHistory.length - 1;
  const priceHistory = dedupeConsecutiveAmounts(schedule.priceHistory.filter((_, i) => i !== idx));
  const amount = wasLast ? priceHistory[priceHistory.length - 1].amount : schedule.amount;
  return { ...item, updatedAt: ctx.now, schedule: { ...schedule, amount, priceHistory } };
}

export interface UpdateInstallmentContext {
  now: Timestamp;
  makeId: () => string;
}

/**
 * Apply edits to an INSTALLMENT item, preserving `id` + `createdAt`. The
 * schedule and its installments are regenerated from the new input, then
 * merged with the old installments by index: ids are kept stable, and a
 * payment already made stays made (status/paidDate/paidFromAccountId carry
 * over). A no-change save round-trips identically. Shrinking the count below
 * the number already paid drops the excess — the derived summary then reads
 * the plan as complete. Throws if `existing` isn't an installment plan.
 */
export function updateInstallmentPaymentItem(
  existing: PaymentItem,
  input: NewInstallmentInput,
  ctx: UpdateInstallmentContext,
): PaymentItem {
  if (existing.schedule.kind !== "INSTALLMENT") {
    throw new TypeError("updateInstallmentPaymentItem expects an INSTALLMENT item");
  }
  const previous = existing.schedule.installments;
  const rebuilt = makeInstallmentPaymentItem(input, {
    id: existing.id,
    now: ctx.now,
    makeId: ctx.makeId,
  });
  if (rebuilt.schedule.kind !== "INSTALLMENT") {
    throw new TypeError("rebuilt item is not an installment plan"); // unreachable
  }

  const installments: Installment[] = rebuilt.schedule.installments.map((inst, i) => {
    const old = previous[i];
    if (!old) return inst;
    const covered = COVERED_INSTALLMENT_STATUSES.includes(old.status);
    return {
      ...inst,
      id: old.id,
      ...(covered && {
        status: old.status,
        paidDate: old.paidDate,
        paidFromAccountId: old.paidFromAccountId,
      }),
    };
  });

  return {
    ...rebuilt,
    createdAt: existing.createdAt,
    schedule: { ...rebuilt.schedule, installments },
  };
}

export interface MarkInstallmentContext {
  paidDate: CalendarDate;
  now: Timestamp;
  paidFromAccountId?: string;
}

/**
 * Mark the earliest not-yet-covered installment of a plan as `paid`. Returns the
 * item unchanged if it isn't an installment plan or every installment is already
 * covered. (Payment lives on the installment itself; `summarizeInstallmentPlan`
 * and `isPaymentItemComplete` read it.)
 */
export function markNextInstallmentPaid(
  item: PaymentItem,
  ctx: MarkInstallmentContext,
): PaymentItem {
  if (item.schedule.kind !== "INSTALLMENT") return item;
  const schedule = item.schedule;
  const idx = schedule.installments.findIndex(
    (i) => !COVERED_INSTALLMENT_STATUSES.includes(i.status),
  );
  if (idx === -1) return item;

  const installments: Installment[] = schedule.installments.map((inst, i) =>
    i === idx
      ? {
          ...inst,
          status: "paid" as InstallmentStatus,
          paidDate: ctx.paidDate,
          paidFromAccountId: ctx.paidFromAccountId ?? inst.paidFromAccountId,
        }
      : inst,
  );

  return { ...item, updatedAt: ctx.now, schedule: { ...schedule, installments } };
}

/**
 * Undo the most recent installment payment: the last covered installment goes
 * back to `upcoming`, clearing its paid date/account. Returns the item
 * unchanged if it isn't an installment plan or nothing is covered yet.
 */
export function unmarkLastInstallmentPaid(item: PaymentItem, ctx: { now: Timestamp }): PaymentItem {
  if (item.schedule.kind !== "INSTALLMENT") return item;
  const schedule = item.schedule;
  let idx = -1;
  for (let i = schedule.installments.length - 1; i >= 0; i--) {
    if (COVERED_INSTALLMENT_STATUSES.includes(schedule.installments[i].status)) {
      idx = i;
      break;
    }
  }
  if (idx === -1) return item;

  const installments: Installment[] = schedule.installments.map((inst, i) =>
    i === idx
      ? {
          ...inst,
          status: "upcoming" as InstallmentStatus,
          paidDate: undefined,
          paidFromAccountId: undefined,
        }
      : inst,
  );

  return { ...item, updatedAt: ctx.now, schedule: { ...schedule, installments } };
}

/** Pause an active item: it keeps its history but stops being forecast,
 *  accrued, or counted (edge case #7). No-op unless currently active. */
export function pausePaymentItem(item: PaymentItem, ctx: { now: Timestamp }): PaymentItem {
  if (item.status !== "active") return item;
  return { ...item, status: "paused", updatedAt: ctx.now };
}

/**
 * Resume a paused item. A recurring schedule's cursor fast-forwards to the
 * next billing-grid date after `asOf` WITHOUT logging the skipped occurrences
 * — nothing was charged while paused, so nothing may enter the ledger.
 * Installment plans need no adjustment: their unpaid installments simply
 * become due (still owed) again. No-op unless currently paused.
 */
export function resumePaymentItem(
  item: PaymentItem,
  ctx: { now: Timestamp; asOf: CalendarDate },
): PaymentItem {
  if (item.status !== "paused") return item;
  if (item.schedule.kind === "RECURRING") {
    const schedule = item.schedule;
    const nextChargeDate =
      schedule.nextChargeDate > ctx.asOf
        ? schedule.nextChargeDate
        : nextDueDate(schedule.firstChargeDate, schedule.recurrence, ctx.asOf);
    return {
      ...item,
      status: "active",
      updatedAt: ctx.now,
      schedule: { ...schedule, nextChargeDate },
    };
  }
  return { ...item, status: "active", updatedAt: ctx.now };
}

export interface RecordPaymentContext {
  id: string;
  paidDate: CalendarDate;
  now: Timestamp;
  paidFromAccountId?: string;
}

/**
 * Mark the running occurrence of a recurring item as paid (the manual
 * tick-off). Returns a NEW item with its `nextChargeDate` advanced one cycle,
 * plus the `PaymentOccurrence` to log. Throws if the item isn't recurring.
 */
export function recordRecurringPayment(
  item: PaymentItem,
  ctx: RecordPaymentContext,
): { item: PaymentItem; occurrence: PaymentOccurrence } {
  if (item.schedule.kind !== "RECURRING") {
    throw new TypeError("recordRecurringPayment expects a RECURRING item");
  }
  const schedule = item.schedule;

  const due = schedule.nextChargeDate;
  const occurrence: PaymentOccurrence = {
    id: ctx.id,
    paymentItemId: item.id,
    dueDate: due,
    chargedDate: ctx.paidDate,
    paidDate: ctx.paidDate,
    paidFromAccountId: ctx.paidFromAccountId,
    recordedAt: ctx.now,
    amount: effectiveRecurringAmount(schedule, due),
    status: "charged",
  };

  const graduated = graduateIfConverted(schedule, due);
  const advanced: PaymentItem = {
    ...item,
    updatedAt: ctx.now,
    schedule: {
      ...graduated,
      nextChargeDate: nextOnGrid(schedule.firstChargeDate, schedule.recurrence, due),
    },
  };

  return { item: advanced, occurrence };
}

/**
 * Step a recurring item's charge cursor back to `toDueDate` — the undo of a
 * mistaken tick-off or skip. The caller removes the matching ledger occurrence
 * in the same motion (otherwise that month would double-count: once from the
 * ledger and once from the re-opened projection). Refuses to move forward.
 */
export function rewindRecurringPayment(
  item: PaymentItem,
  ctx: { toDueDate: CalendarDate; now: Timestamp },
): PaymentItem {
  if (item.schedule.kind !== "RECURRING") return item;
  const schedule = item.schedule;
  if (ctx.toDueDate >= schedule.nextChargeDate) return item;
  return {
    ...item,
    updatedAt: ctx.now,
    schedule: { ...schedule, nextChargeDate: ctx.toDueDate },
  };
}

/**
 * Deliberately sit out the running occurrence of a recurring item ("not
 * investing this month"): advances `nextChargeDate` one cycle exactly like a
 * payment, but logs a `skipped` occurrence — audit-trailed, never counted as
 * money spent. Throws if the item isn't recurring.
 */
export function skipRecurringPayment(
  item: PaymentItem,
  ctx: { id: string; now: Timestamp },
): { item: PaymentItem; occurrence: PaymentOccurrence } {
  if (item.schedule.kind !== "RECURRING") {
    throw new TypeError("skipRecurringPayment expects a RECURRING item");
  }
  const schedule = item.schedule;

  const due = schedule.nextChargeDate;
  const occurrence: PaymentOccurrence = {
    id: ctx.id,
    paymentItemId: item.id,
    dueDate: due,
    recordedAt: ctx.now,
    amount: effectiveRecurringAmount(schedule, due),
    status: "skipped",
  };

  const graduated = graduateIfConverted(schedule, due);
  const advanced: PaymentItem = {
    ...item,
    updatedAt: ctx.now,
    schedule: {
      ...graduated,
      nextChargeDate: nextOnGrid(schedule.firstChargeDate, schedule.recurrence, due),
    },
  };

  return { item: advanced, occurrence };
}

export interface AccrueContext {
  now: Timestamp;
  /** Produces a fresh unique id for each generated occurrence. */
  makeId: () => string;
}

/**
 * Automatic catch-up: for a RECURRING item, log a `charged` occurrence for every
 * due date that has arrived (≤ `asOf`), advancing `nextChargeDate` one cycle
 * each time. Returns the advanced item plus the occurrences to append to the
 * ledger. Emits nothing if the next charge is still in the future. Non-recurring
 * items pass through untouched. Pure — id/clock are injected.
 */
export function accrueDueOccurrences(
  item: PaymentItem,
  asOf: CalendarDate,
  ctx: AccrueContext,
): { item: PaymentItem; occurrences: PaymentOccurrence[] } {
  if (item.schedule.kind !== "RECURRING") {
    return { item, occurrences: [] };
  }

  let schedule = item.schedule;
  const { endDate } = schedule;
  const occurrences: PaymentOccurrence[] = [];

  // CalendarDate is YYYY-MM-DD, so string comparison is chronological.
  // The grid governs WHAT bills (never past the end date); the weekend-
  // shifted date governs WHEN the money moves — a Saturday charge shifted
  // to Monday must not accrue on Saturday. dueDate stays the grid date;
  // chargedDate/paidDate carry the shifted one (their documented job).
  let crossedConversion = false;
  for (;;) {
    const due = schedule.nextChargeDate;
    if (endDate && due > endDate) break;
    const charged = shiftOffWeekend(due, item.weekendShift);
    if (charged > asOf) break;
    const amount = effectiveRecurringAmount(schedule, due);
    // Free-trial occurrences (0) aren't real charges — advance past them
    // without logging, exactly as the projection skips them.
    if (amount.amount > 0) {
      occurrences.push({
        id: ctx.makeId(),
        paymentItemId: item.id,
        dueDate: due,
        chargedDate: charged,
        paidDate: charged,
        paidFromAccountId: item.accountId,
        recordedAt: ctx.now,
        amount,
        status: "charged",
      });
    }
    if (schedule.introOffer && due >= schedule.introOffer.convertsOn) crossedConversion = true;
    schedule = {
      ...schedule,
      nextChargeDate: nextOnGrid(schedule.firstChargeDate, schedule.recurrence, due),
    };
  }

  // Finalize a converted trial once a charge has crossed its conversion date.
  const limit = endDate && endDate < asOf ? endDate : asOf;
  if (crossedConversion) schedule = graduateIfConverted(schedule, limit);

  // The plan is finished once the cursor has moved past its end date.
  const completed = endDate !== undefined && schedule.nextChargeDate > endDate;

  if (occurrences.length === 0 && !completed && !crossedConversion) {
    return { item, occurrences };
  }

  return {
    item: {
      ...item,
      schedule,
      updatedAt: ctx.now,
      status: completed ? "completed" : item.status,
    },
    occurrences,
  };
}

/**
 * Automatic catch-up for an INSTALLMENT plan: mark every installment whose due
 * date has arrived (≤ `asOf`) as `paid`, dated to its due date and drawn from
 * the item's account — the BNPL counterpart of `accrueDueOccurrences`, for
 * plans the provider debits automatically. Payments live on the installments
 * themselves (not the occurrence ledger), so nothing is returned to append.
 * Non-installment items and already-covered installments pass through
 * untouched. Pure — the clock is injected.
 */
export function accrueDueInstallments(
  item: PaymentItem,
  asOf: CalendarDate,
  ctx: { now: Timestamp },
): PaymentItem {
  if (item.schedule.kind !== "INSTALLMENT") return item;
  const schedule = item.schedule;

  let changed = false;
  const installments: Installment[] = schedule.installments.map((inst) => {
    // The weekend-shifted date is when the provider actually debits.
    const charged = shiftOffWeekend(inst.dueDate, item.weekendShift);
    if (COVERED_INSTALLMENT_STATUSES.includes(inst.status) || charged > asOf) return inst;
    changed = true;
    return {
      ...inst,
      status: "paid" as InstallmentStatus,
      paidDate: charged,
      paidFromAccountId: item.accountId ?? inst.paidFromAccountId,
    };
  });
  if (!changed) return item;

  return { ...item, updatedAt: ctx.now, schedule: { ...schedule, installments } };
}

/**
 * A first charge date moved into the past is history: the cycles between the
 * new first date and the old one were paid outside the app. Returns them as
 * `charged` occurrences, whatever the settlement mode; the item's own cursor
 * is untouched (it already sits at or past the old first date). Empty when
 * the date did not move earlier. Pure — id/clock are injected.
 */
export function backdatedHistory(
  item: PaymentItem,
  previousFirstChargeDate: CalendarDate,
  ctx: AccrueContext,
): PaymentOccurrence[] {
  if (!isRecurringSchedule(item.schedule)) return [];
  const first = item.schedule.firstChargeDate;
  if (first >= previousFirstChargeDate) return [];
  const rewound: PaymentItem = {
    ...item,
    schedule: { ...item.schedule, nextChargeDate: first },
  };
  return accrueDueOccurrences(rewound, addDays(previousFirstChargeDate, -1), ctx).occurrences;
}

/** The last day of the month before the one `date` is in. */
function endOfPreviousMonth(date: CalendarDate): CalendarDate {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return calendarDate(new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10));
}

/**
 * Land an imported item. Whatever was due in EARLIER months was paid outside
 * the app, so it is settled whatever the settlement mode; this month's
 * charges follow the mode: automatic ones are settled up to `today` (the
 * bank took them), manual ones stay open for the user to tick. Inactive
 * items pass through. Pure — id/clock are injected.
 */
export function settleImportedItem(
  item: PaymentItem,
  today: CalendarDate,
  ctx: AccrueContext,
): { item: PaymentItem; occurrences: PaymentOccurrence[] } {
  if (item.status !== "active") return { item, occurrences: [] };
  const upTo = item.settlementMode === "automatic" ? today : endOfPreviousMonth(today);
  if (item.schedule.kind === "INSTALLMENT") {
    return { item: accrueDueInstallments(item, upTo, ctx), occurrences: [] };
  }
  return accrueDueOccurrences(item, upTo, ctx);
}
