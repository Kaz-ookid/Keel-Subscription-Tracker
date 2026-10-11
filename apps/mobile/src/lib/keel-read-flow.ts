// The one read pipeline both "Keel reads it for you" screens share: raw
// material in (typed notes, or the scrubbed text of screenshots), review-
// ready drafts out, with the same safety nets as the bring-your-own path.
// The currency hint keeps a dollar receipt in dollars when the model leaves
// the currency out (the parser would otherwise default to the display one).

import {
  detectCurrencyHint,
  parseImportDocument,
  today,
  type Account,
  type Category,
  type CurrencyCode,
  type ImportDraft,
  type ImportParseError,
  type PaymentItem,
} from "@keel/core";

import { KeelReadsError, readWithKeel, type KeelReadsFailure } from "./apple-intelligence";

export type KeelReadOutcome =
  | { ok: true; drafts: ImportDraft[]; skipped: number }
  | { ok: false; error: ImportParseError | KeelReadsFailure };

export async function runKeelRead(
  material: string,
  context: {
    displayCurrency: CurrencyCode;
    items: readonly PaymentItem[];
    accounts: readonly Account[];
    categories: readonly Category[];
  },
): Promise<KeelReadOutcome> {
  const defaultCurrency = detectCurrencyHint(material) ?? context.displayCurrency;
  try {
    const json = await readWithKeel(material, { today: today(), defaultCurrency });
    const result = parseImportDocument(json, {
      defaultCurrency,
      today: today(),
      accounts: context.accounts,
      categories: context.categories,
      takenNames: context.items.map((i) => i.name),
    });
    if (result.drafts.length === 0) return { ok: false, error: result.error ?? "empty" };
    return { ok: true, drafts: result.drafts, skipped: result.skipped };
  } catch (failure) {
    return {
      ok: false,
      error: failure instanceof KeelReadsError ? failure.reason : "model-failed",
    };
  }
}
