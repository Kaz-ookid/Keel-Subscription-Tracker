// The assistant's contract with the model: the model NEVER touches data. It
// emits a JSON plan ({"actions":[...], "additions":[...]}); this module
// resolves that plan against the real state into typed, validated operations
// the review screen can show as before/after and the store can apply through
// its normal mutations. Anything that doesn't resolve cleanly (unknown item,
// ambiguous name, an op the schedule type doesn't support) lands in
// `unresolved` with a reason: shown to the user, never guessed around.
//
// Additions reuse the import pipeline wholesale: the model emits import-format
// items, parseImportDocument turns them into the same reviewed drafts the
// import flows use. One format, one parser, one review philosophy.

import { extractJsonDocument } from "../import/extract";
import { parseImportDocument, type ImportContext } from "../import/parse";
import type { ImportDraft } from "../import/types";
import { CURRENCIES, type CurrencyCode } from "../constants/currencies";
import { fromMajor, type Money } from "../primitives/money";
import type { CalendarDate, Timestamp } from "../primitives/temporal";
import type { Account } from "../models/account";
import type { PaymentItem } from "../models/payment-item";
import { pausePaymentItem, resumePaymentItem } from "../models/payment-item-mutations";
import { canMarkPaid } from "../models/payment-item-status";
import { isValidCalendarDate } from "../models/validate";

/** What the model may ask for. `end` stops a subscription (sets its end date
 *  to today, history kept); `delete` erases the item and its ledger. */
export type AssistantOpKind =
  | "pause"
  | "resume"
  | "end"
  | "delete"
  | "rename"
  | "set_amount"
  | "set_date"
  | "set_account"
  | "mark_paid"
  | "skip";

export type AssistantOperation =
  | {
      id: string;
      kind: "pause" | "resume" | "end" | "delete" | "mark_paid" | "skip";
      item: PaymentItem;
    }
  | { id: string; kind: "rename"; item: PaymentItem; name: string }
  | { id: string; kind: "set_amount"; item: PaymentItem; amount: Money; previous: Money }
  | { id: string; kind: "set_date"; item: PaymentItem; date: CalendarDate; previous: CalendarDate }
  | { id: string; kind: "set_account"; item: PaymentItem; account: Account; previous?: Account };

/** Ops that destroy or hide data — the review screen marks them loudly. */
export function isDestructiveOperation(op: AssistantOperation): boolean {
  return op.kind === "delete" || op.kind === "end";
}

export type AssistantUnresolvedReason =
  /** No commitment matches the name the model used. */
  | "item-not-found"
  /** Several commitments match — the user must act by hand. */
  | "item-ambiguous"
  /** No account matches the name. */
  | "account-not-found"
  /** The op doesn't apply to this commitment (its type or state). */
  | "not-supported"
  /** Already in the requested state (pausing a paused item…). */
  | "already-so"
  /** Amount/date/name didn't make sense. */
  | "bad-value"
  /** A next-charge move into the past. */
  | "past-date"
  /** An op kind outside the contract. */
  | "unknown-op";

export interface AssistantUnresolved {
  /** The op kind as the model wrote it. */
  op: string;
  /** The item name involved, when there was one. */
  itemName?: string;
  reason: AssistantUnresolvedReason;
}

export interface AssistantPlan {
  operations: AssistantOperation[];
  /** New commitments, as the same reviewed drafts the import flows produce. */
  additions: ImportDraft[];
  unresolved: AssistantUnresolved[];
  /** The model's optional short remark to the user. */
  note?: string;
  /** Set when the whole reply yielded nothing usable. */
  error?: "no-json" | "empty";
}

export interface AssistantContext extends ImportContext {
  /** The commitments the ops resolve against. */
  items: readonly PaymentItem[];
}

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

/** A [number] handle ("2" or "[2]") targets the item at that 1-based position
 *  in the grounding list — the only unambiguous way to point at one of two
 *  same-named items. Then exact name, then a unique substring; else give up
 *  with the precise reason. Never guesses between candidates. */
function resolveItem(
  name: unknown,
  items: readonly PaymentItem[],
): { item?: PaymentItem; reason?: AssistantUnresolvedReason } {
  if (typeof name !== "string" || name.trim() === "") return { reason: "item-not-found" };
  const trimmed = name.trim();
  const handle = /^\[?(\d+)\]?$/.exec(trimmed);
  if (handle) {
    const at = Number(handle[1]);
    return at >= 1 && at <= items.length ? { item: items[at - 1] } : { reason: "item-not-found" };
  }
  const wanted = normalize(name);
  const exact = items.filter((i) => normalize(i.name) === wanted);
  if (exact.length === 1) return { item: exact[0] };
  if (exact.length > 1) return { reason: "item-ambiguous" };
  const partial = items.filter(
    (i) => normalize(i.name).includes(wanted) || wanted.includes(normalize(i.name)),
  );
  if (partial.length === 1) return { item: partial[0] };
  return { reason: partial.length > 1 ? "item-ambiguous" : "item-not-found" };
}

function resolveAccount(name: unknown, accounts: readonly Account[]): Account | undefined {
  if (typeof name !== "string" || name.trim() === "") return undefined;
  const wanted = normalize(name);
  const active = accounts.filter((a) => !a.isArchived);
  return (
    active.find((a) => normalize(a.name) === wanted) ??
    (active.filter((a) => normalize(a.name).includes(wanted)).length === 1
      ? active.find((a) => normalize(a.name).includes(wanted))
      : undefined)
  );
}

function itemCurrency(item: PaymentItem): CurrencyCode {
  const schedule = item.schedule;
  if (schedule.kind === "INSTALLMENT") return schedule.totalAmount.currency;
  return schedule.amount.currency;
}

const OP_KINDS = new Set<string>([
  "pause",
  "resume",
  "end",
  "delete",
  "rename",
  "set_amount",
  "set_date",
  "set_account",
  "mark_paid",
  "skip",
]);

/** Resolve ONE raw action into an operation or an unresolved reason. */
function resolveAction(
  raw: unknown,
  id: string,
  ctx: AssistantContext,
): { op?: AssistantOperation; unresolved?: AssistantUnresolved } {
  if (!isRecord(raw) || typeof raw.op !== "string") {
    return { unresolved: { op: "?", reason: "unknown-op" } };
  }
  const kind = raw.op;
  const itemName = typeof raw.item === "string" ? raw.item : undefined;
  const fail = (reason: AssistantUnresolvedReason): { unresolved: AssistantUnresolved } => ({
    unresolved: { op: kind, itemName, reason },
  });

  if (!OP_KINDS.has(kind)) return fail("unknown-op");
  const resolved = resolveItem(raw.item, ctx.items);
  if (!resolved.item) return fail(resolved.reason ?? "item-not-found");
  const item = resolved.item;

  switch (kind as AssistantOpKind) {
    case "pause":
      if (item.status === "paused") return fail("already-so");
      if (item.status !== "active") return fail("not-supported");
      return { op: { id, kind: "pause", item } };
    case "resume":
      if (item.status === "active") return fail("already-so");
      if (item.status !== "paused") return fail("not-supported");
      return { op: { id, kind: "resume", item } };
    case "end":
      // Ending is a subscription concept; a payment plan is owed in full
      // (delete or pause are the honest alternatives).
      if (item.schedule.kind !== "RECURRING") return fail("not-supported");
      if (item.schedule.endDate !== undefined && item.schedule.endDate <= ctx.today) {
        return fail("already-so");
      }
      return { op: { id, kind: "end", item } };
    case "delete":
      return { op: { id, kind: "delete", item } };
    case "rename": {
      const name = typeof raw.name === "string" ? raw.name.trim() : "";
      if (name === "") return fail("bad-value");
      return { op: { id, kind: "rename", item, name } };
    }
    case "set_amount": {
      if (item.schedule.kind === "INSTALLMENT") return fail("not-supported");
      const major = typeof raw.amount === "number" ? raw.amount : Number.NaN;
      if (!Number.isFinite(major) || major < 0) return fail("bad-value");
      const currencyRaw =
        typeof raw.currency === "string" ? raw.currency.toUpperCase() : itemCurrency(item);
      if (!(currencyRaw in CURRENCIES)) return fail("bad-value");
      const amount = fromMajor(major, currencyRaw as CurrencyCode);
      return { op: { id, kind: "set_amount", item, amount, previous: itemCurrencyAmount(item) } };
    }
    case "set_date": {
      if (item.schedule.kind !== "RECURRING") return fail("not-supported");
      if (!isValidCalendarDate(raw.date)) return fail("bad-value");
      const date = raw.date as CalendarDate;
      if (date < ctx.today) return fail("past-date");
      return { op: { id, kind: "set_date", item, date, previous: item.schedule.nextChargeDate } };
    }
    case "set_account": {
      const account = resolveAccount(raw.account, ctx.accounts);
      if (!account) return fail("account-not-found");
      const previous = ctx.accounts.find((a) => a.id === item.accountId);
      return { op: { id, kind: "set_account", item, account, previous } };
    }
    case "mark_paid":
      if (!canMarkPaid(item, ctx.today)) return fail("not-supported");
      return { op: { id, kind: "mark_paid", item } };
    case "skip":
      if (item.schedule.kind !== "RECURRING" || item.status !== "active") {
        return fail("not-supported");
      }
      return { op: { id, kind: "skip", item } };
  }
  return fail("unknown-op");
}

function itemCurrencyAmount(item: PaymentItem): Money {
  const schedule = item.schedule;
  if (schedule.kind === "INSTALLMENT") return schedule.totalAmount;
  return schedule.amount;
}

/**
 * Turn the model's raw reply into a reviewable plan. Tolerant about the
 * envelope (fences, prose), strict about every operation. Never throws.
 */
export function parseAssistantPlan(raw: string, ctx: AssistantContext): AssistantPlan {
  const document = extractJsonDocument(raw, "actions");
  if (!isRecord(document)) {
    return { operations: [], additions: [], unresolved: [], error: "no-json" };
  }

  const operations: AssistantOperation[] = [];
  const unresolved: AssistantUnresolved[] = [];
  const actions = Array.isArray(document.actions) ? document.actions : [];
  for (const [index, action] of actions.entries()) {
    const result = resolveAction(action, `op-${index + 1}`, ctx);
    if (result.op) operations.push(result.op);
    else if (result.unresolved) unresolved.push(result.unresolved);
  }

  // Additions ride the import pipeline: same tolerant parse, same drafts,
  // same warnings the review screen already knows how to show.
  let additions: ImportDraft[] = [];
  if (Array.isArray(document.additions) && document.additions.length > 0) {
    const result = parseImportDocument(JSON.stringify({ items: document.additions }), ctx);
    additions = result.drafts;
    for (let i = 0; i < result.skipped; i++) {
      unresolved.push({ op: "add", reason: "bad-value" });
    }
  }

  const note =
    typeof document.note === "string" && document.note.trim() !== ""
      ? document.note.trim()
      : undefined;
  const empty = operations.length === 0 && additions.length === 0 && unresolved.length === 0;
  return { operations, additions, unresolved, note, error: empty ? "empty" : undefined };
}

/**
 * The pure per-item transform for the ops that rewrite the item in place.
 * Store-level ops (delete, mark_paid, skip) return the item untouched: the
 * store routes those through its ledger-aware mutations instead.
 */
export function applyAssistantOperation(
  item: PaymentItem,
  op: AssistantOperation,
  ctx: { now: Timestamp; today: CalendarDate },
): PaymentItem {
  switch (op.kind) {
    case "pause":
      return pausePaymentItem(item, { now: ctx.now });
    case "resume":
      return resumePaymentItem(item, { now: ctx.now, asOf: ctx.today });
    case "end": {
      if (item.schedule.kind !== "RECURRING") return item;
      return {
        ...item,
        updatedAt: ctx.now,
        schedule: { ...item.schedule, endDate: ctx.today },
      };
    }
    case "rename":
      return { ...item, name: op.name, updatedAt: ctx.now };
    case "set_amount": {
      const schedule = item.schedule;
      if (schedule.kind === "ONE_TIME_ANNUAL") {
        return { ...item, updatedAt: ctx.now, schedule: { ...schedule, amount: op.amount } };
      }
      if (schedule.kind !== "RECURRING") return item;
      // Same meaning as an amount edit in the form: a real price change,
      // recorded from today so the Price-changes insight sees it.
      const last = schedule.priceHistory[schedule.priceHistory.length - 1];
      const changed =
        !last ||
        last.amount.amount !== op.amount.amount ||
        last.amount.currency !== op.amount.currency;
      return {
        ...item,
        updatedAt: ctx.now,
        schedule: {
          ...schedule,
          amount: op.amount,
          priceHistory: changed
            ? [...schedule.priceHistory, { amount: op.amount, effectiveFrom: ctx.today }]
            : schedule.priceHistory,
        },
      };
    }
    case "set_date": {
      if (item.schedule.kind !== "RECURRING") return item;
      // Moving the cursor re-anchors the cycle: accrual advances by
      // recurrence FROM the cursor, so future charges follow the new date.
      return {
        ...item,
        updatedAt: ctx.now,
        schedule: { ...item.schedule, nextChargeDate: op.date },
      };
    }
    case "set_account":
      return { ...item, accountId: op.account.id, updatedAt: ctx.now };
    case "delete":
    case "mark_paid":
    case "skip":
      return item;
  }
}
