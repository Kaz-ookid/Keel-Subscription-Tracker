// The one read pipeline both "Keel reads it for you" screens share: raw
// material in (typed notes, or the scrubbed text of screenshots), review-
// ready drafts out, with the same safety nets as the bring-your-own path.
// The currency hint keeps a dollar receipt in dollars when the model leaves
// the currency out (the parser would otherwise default to the display one).

import {
  buildKeelReadsPrompt,
  chunkLines,
  detectCurrencyHint,
  isItemList,
  splitAccountSections,
  parseImportDocument,
  today,
  type Account,
  type Category,
  type CurrencyCode,
  type ImportDraft,
  type ImportParseError,
  type ImportPromptContext,
  type PaymentItem,
} from "@keel/core";

import { KeelReadsError, readWithInstructions, type KeelReadsFailure } from "./apple-intelligence";

export type KeelReadOutcome =
  | { ok: true; drafts: ImportDraft[]; skipped: number; raw: string[] }
  | { ok: false; error: ImportParseError | KeelReadsFailure };

export interface KeelReadOptions {
  /** A typed list longer than this is read this many lines at a time
   *  (documents stay whole). Omitted: every section is one read. */
  maxLinesPerRead?: number;
  /** The reader lab's door: other instructions than the product's. */
  instructions?: (context: ImportPromptContext) => string;
}

export async function runKeelRead(
  rawMaterial: string,
  context: {
    displayCurrency: CurrencyCode;
    items: readonly PaymentItem[];
    accounts: readonly Account[];
    categories: readonly Category[];
  },
  options: KeelReadOptions = {},
): Promise<KeelReadOutcome> {
  // A list grouped under account headings ("BCV in CHF:") is read one
  // section at a time, with the heading's currency as the parser's default
  // and its account folded into every line: the model applies a heading to
  // the lines below it only sometimes, and a CHF list must never land in
  // euros because of that. Material without headings is one read.
  const sections = splitAccountSections(rawMaterial);
  const build = options.instructions ?? buildKeelReadsPrompt;
  try {
    const drafts: ImportDraft[] = [];
    const raw: string[] = [];
    let skipped = 0;
    let firstError: ImportParseError | undefined;
    const taken = context.items.map((i) => i.name);
    for (const section of sections) {
      const defaultCurrency =
        section.currency ?? detectCurrencyHint(section.text) ?? context.displayCurrency;
      const prompt = build({ today: today(), defaultCurrency });
      // A long typed list goes to the model in short slices, all at once:
      // the slices are independent lines, and a short list is read in full
      // where a long one comes back as names and amounts.
      const slices =
        options.maxLinesPerRead && isItemList(section.text)
          ? chunkLines(section.text, options.maxLinesPerRead)
          : [section.text];
      const answers = await Promise.all(slices.map((slice) => readWithInstructions(slice, prompt)));
      for (const json of answers) {
        raw.push(json);
        const result = parseImportDocument(json, {
          defaultCurrency,
          today: today(),
          accounts: context.accounts,
          categories: context.categories,
          takenNames: taken,
        });
        drafts.push(...result.drafts);
        skipped += result.skipped;
        taken.push(...result.drafts.map((d) => d.input.name));
        if (result.drafts.length === 0 && !firstError) firstError = result.error ?? "empty";
      }
    }
    if (drafts.length === 0) return { ok: false, error: firstError ?? "empty" };
    return { ok: true, drafts, skipped, raw };
  } catch (failure) {
    return {
      ok: false,
      error: failure instanceof KeelReadsError ? failure.reason : "model-failed",
    };
  }
}
