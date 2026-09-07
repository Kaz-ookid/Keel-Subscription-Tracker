// AI-assisted import (PROJECT_BRIEF §6.1): the shapes shared by every delivery
// path (bring-your-own-AI today; on-device / metered later). The AI produces an
// "import document" (format v2 — see ai-training/import-format.md, the single
// source of truth); the tolerant parser turns it into ImportDrafts that the
// review screen shows for the user to fix, trim and confirm. Nothing an AI
// wrote is ever trusted blindly (edge case #11) — a draft is a proposal.
//
// v2 posture (2026-09-07): EXTRACTION ONLY. The model reports what the input
// states; omission is the confidence signal. Every absent field is defaulted
// in code (parse.ts) and marked in the draft's computed `assumedFields`. The
// v1 self-reporting arrays (`assumed`/`uncertain`) and the brand `color`
// field left the schema; the parser still ACCEPTS them from v1-era replies.

import type { NewInstallmentInput, NewRecurringInput } from "../models/payment-item-factory";

/** Import format v2 — raw item shapes as the AI is instructed to emit them.
 *  Reference only: real input is untrusted, so the parser validates field by
 *  field from `unknown` rather than casting to these. */
export interface ImportCadence {
  unit: "day" | "week" | "month" | "year";
  interval: number;
}

/** "1st Thursday"-style rule; `week` 1–5 where 5 = last (core uses "last"). */
export interface ImportAnchor {
  week: number;
  weekday: number;
}

export interface ImportPriceChange {
  newAmount: number;
  on: string;
}

interface ImportItemCommon {
  name: string;
  /** Every field below `name` is EXTRACTION: included only when the input
   *  states it. An omitted field is defaulted in code and reported to the
   *  user as assumed. */
  currency?: string;
  settlement?: "automatic" | "manual";
  /** The one inference the model is asked to make. */
  category?: string;
  cadence?: ImportCadence;
  /** A full stated date ("started 15 March 2026"). */
  firstDate?: string;
  /** A bare day of the month the input states ("the 26th") — the app
   *  resolves it against the calendar; the model never does date math. */
  billingDay?: number;
  account?: string;
  /** The brand's main website ("netflix.com") — the one piece of brand
   *  knowledge kept in the schema (logos for brands the app doesn't know). */
  domain?: string;
  notes?: string;
  reminderDaysBefore?: number;
  /** Set ONLY when the user says past payments were NOT made.
   *  Default assumption (applied in code): everything due before today
   *  was paid on time. */
  backlogUnpaid?: boolean;
}

/** The field names a draft's assumed/uncertain report may carry. */
export const IMPORT_FIELD_NAMES = [
  "name",
  "amount",
  "currency",
  "settlement",
  "category",
  "cadence",
  "firstDate",
  "account",
] as const;

export type ImportFieldName = (typeof IMPORT_FIELD_NAMES)[number];

export interface ImportSubscriptionItem extends ImportItemCommon {
  type: "subscription";
  /** Decimal in the currency's main unit; 0 = free trial. */
  amount: number;
  endDate?: string;
  anchor?: ImportAnchor;
  /** The bank never debits on weekends: charges move before (Fri) / after (Mon). */
  weekendShift?: "before" | "after";
  priceChange?: ImportPriceChange;
}

export interface ImportSplitPaymentItem extends ImportItemCommon {
  type: "split_payment";
  /** Full purchase price, main units. */
  total: number;
  installments: number;
  provider?: string;
}

export type ImportItem = ImportSubscriptionItem | ImportSplitPaymentItem;

export interface ImportDocument {
  items: ImportItem[];
}

/** What the parser had to guess or couldn't resolve — surfaced as ⚠ lines on
 *  the review screen (the UI translates codes; `detail` carries the raw value
 *  involved, e.g. the unmatched account name). */
export type ImportWarningCode =
  /** The account name didn't match an existing account (kept in
   *  `accountName` so the UI can offer to create it). */
  | "account-unmatched"
  /** The item's currency differs from its matched account's currency. */
  | "currency-mismatch"
  /** Unsupported/missing currency — fell back to the default currency. */
  | "currency-defaulted"
  /** Unknown category id — filed under "other". */
  | "category-unknown"
  /** Unknown split-payment provider string — left unset. */
  | "provider-unknown"
  /** A STATED but invalid cadence — assumed monthly. (A simply absent
   *  cadence is quietly defaulted and reported as assumed instead.) */
  | "cadence-defaulted"
  /** An invalid STATED date was recovered (first date → today) or a
   *  date-bearing field (endDate, priceChange, anchor) was dropped. */
  | "date-defaulted"
  /** An item with the same name is already tracked — confirming would create
   *  a duplicate (e.g. the same import pasted twice). */
  | "duplicate";

export interface ImportWarning {
  code: ImportWarningCode;
  /** The raw value involved, for display ("Monzo", "HKD", "everyOtherDay"…). */
  detail?: string;
}

interface ImportDraftCommon {
  /** Session-local id ("draft-1"…) — stable across review-screen edits. */
  id: string;
  /** The account name as the AI wrote it, when it matched nothing. */
  accountName?: string;
  /** Mark every occurrence due before today as paid when the item lands
   *  (the default; false only when the input said payments are behind). */
  settlePast: boolean;
  /** Fields the PARSER filled by default because the input didn't state
   *  them (plus any a v1 reply self-declared) — light review hints. */
  assumedFields: ImportFieldName[];
  /** Fields the user must check — computed (suspect-name heuristic), plus
   *  any a v1 reply self-declared. */
  uncertainFields: ImportFieldName[];
  warnings: ImportWarning[];
}

export interface RecurringImportDraft extends ImportDraftCommon {
  kind: "subscription";
  input: NewRecurringInput;
}

export interface SplitImportDraft extends ImportDraftCommon {
  kind: "split";
  input: NewInstallmentInput;
}

/** One reviewed-before-saved proposal: a ready-to-use core input + what the
 *  parser flagged along the way. */
export type ImportDraft = RecurringImportDraft | SplitImportDraft;

export type ImportParseError =
  /** No import document found in the pasted text (or it wasn't ours). */
  | "no-json"
  /** A valid document with zero items. */
  | "empty";

export interface ImportParseResult {
  drafts: ImportDraft[];
  /** Items present in the document that were too broken to become drafts. */
  skipped: number;
  /** Set only when the whole paste yielded nothing usable. */
  error?: ImportParseError;
}
