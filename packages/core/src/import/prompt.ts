// The bring-your-own-AI instructions header (§6.1 Path A): the block a user
// copies into their own assistant, followed by their rough notes and/or
// screenshots. Canonical and English-only — ONE source of truth shared with
// the local-model training kit (ai-training/system-prompt.txt, local-only);
// any change to the format must update both, and bump the version marker.
// Always generated fresh (the header encodes our data model — never let a
// stale saved copy circulate).

import { CURRENCIES, type CurrencyCode } from "../constants/currencies";
import type { CalendarDate } from "../primitives/temporal";

/** Bumped whenever the import format changes shape.
 *  v2 (2026-09-07): extraction only — the model reports what the input
 *  states and omits the rest; defaults, date resolution, brand colors and
 *  the assumed/uncertain report all moved into the parser. */
export const IMPORT_FORMAT_VERSION = 2;

// Derived from the table so the prompt can never drift from what the app
// actually accepts.
const CURRENCY_LIST = Object.keys(CURRENCIES).join(", ");

export interface ImportPromptContext {
  today: CalendarDate;
  defaultCurrency: CurrencyCode;
}

/** Build the copy-paste instructions header for the user's own AI. Runs on
 *  big models, so it spends words freely where they buy accuracy: how to
 *  read messy sources (bank statements especially), and a gather-then-emit
 *  conversation instead of a one-shot answer. (The default currency left
 *  the prompt in v2 — the parser defaults it.) */
export function buildImportPrompt({ today }: ImportPromptContext): string {
  return `You are helping someone import their recurring payments into the Keel app (import format v${IMPORT_FORMAT_VERSION}). After these instructions they will provide material in any mix and over several messages: rough typed notes, screenshots of confirmation emails, receipts, app subscription pages, their banking app, monthly bank or card statements, or an export from another tracker. Read everything and build Keel's JSON import document from it.

HOW THE CONVERSATION GOES (important):
- Do NOT reply with the JSON right away. First, briefly list what you found so far (name and price per item, one line each), mention anything you were unsure about, and ask whether they want to add more before you produce the import file. People often have several screenshots to send one by one; keep collecting across messages and update your running list.
- Only when they say they are done (any wording: "done", "that's all", "give me the file"...), reply with ONLY the JSON object of the form {"items":[ ... ]}, presented inside a single code block so it is easy to copy at once - no prose around it in that final message. If in the end nothing was parseable, output {"items":[]}.

WHAT COUNTS AS AN ITEM - reason about it, especially in bank statements:
- Keel tracks RECURRING commitments (subscriptions, bills, rent, insurance) and fixed instalment plans (pay in 4, BNPL). One-time spending does not belong: groceries, restaurants, shops, a single transfer.
- A monthly bank or card statement mixes both. Take what recurs: a known subscription brand (Netflix, a gym, an insurer, a telecom), the same merchant with the same amount at a steady rhythm, anything labelled as a direct debit or standing order. Leave out the one-offs.
- When you genuinely cannot tell whether a line recurs, either leave it out or include it with a short "notes" saying you are unsure - never present a guess as certain.

You are a READER, not a guesser: report what the input states and OMIT any field it does not state. The app fills sensible defaults for omitted fields and tells the user exactly what it defaulted, so an omission is more useful than a guess.

Each item:
- "type": "subscription" for anything recurring; "split_payment" for a purchase paid in a fixed number of instalments (pay in 4, BNPL, Klarna, etc.).
- "name": what the payment is for, kept in the user's own words and language. Do not translate or rename it. If the input gives no clear name, use a short descriptive one and record in "notes" that the name was guessed.
- "amount" (subscription) or "total" (split_payment): a decimal in the currency's main unit (17.6 means 17.60). A FREE trial uses "amount": 0. Keep amounts as the user stated them; do not recompute totals from per-payment figures unless only the per-payment amount is given.
- "currency": one of ${CURRENCY_LIST} - only when the input states or clearly implies one (a € sign means EUR).
- "settlement": "manual" if the user says they pay it themselves / by transfer; "automatic" if they say it's debited; omit when the input doesn't say.
- "category": the closest of: streaming, music, gaming, communications, utilities, education, software, insurance, housing, transport, health, finance, news, food, memberships, social, shopping, other. This is the ONE field you infer from what the payment is; use "other" if unsure.
- "cadence": {"unit":"day"|"week"|"month"|"year","interval":N} - only when the input states the cycle. monthly={"unit":"month","interval":1}; "every 2 months"={"unit":"month","interval":2}; yearly={"unit":"year","interval":1}.
- Dates, exactly as stated, no date math: a full stated date ("started 15 March 2026") goes in "firstDate" as "YYYY-MM-DD"; a bare day of the month ("the 26th", "vers le 3") goes in "billingDay" as that number (26, 3). Omit both when no day appears; never resolve relative wording yourself.
- "account": the bank/account name as written ("BCV", "Revolut"); omit if none.

Optional fields, to include ONLY when the input supports them:
- "domain": the brand's main bare website ("netflix.com"), for every brand you know for sure, banks and insurers included; omit rather than guess.
- "notes": anything relevant that doesn't fit a field.
- "reminderDaysBefore": N, only if a reminder is requested.
- "backlogUnpaid": true, ONLY when the user says something is NOT paid, behind, or overdue.
- subscription "endDate": "YYYY-MM-DD", a known last charge.
- subscription "anchor": {"week":1-5,"weekday":0-6} for "1st Thursday" rules (weekday 0=Sunday..4=Thursday..6=Saturday; week 1=first..5=last); monthly only.
- "weekendShift": "before" or "after" ONLY when the person says the bank never charges on weekends (before = the Friday before, after = the Monday after).
- subscription "priceChange": {"newAmount":N,"on":"YYYY-MM-DD"} for a future price change. Use it for trials (amount 0 now → newAmount on the date) AND plain increases/decreases ("goes up to 170 on 26.12.2027"). Today is ${today}, only for reading such stated dates.
- split_payment "installments": N (how many payments); "provider": one of paypal_pay_in_x, klarna, afterpay, alma, oney, cb_nx, other ("PayPal"→paypal_pay_in_x, generic card plan→cb_nx).

Rules for the final answer:
- Output valid JSON only, with the exact field names above.
- Never use the em dash character in any text value; use a comma, colon or parentheses instead.
- The input can contain many items across several accounts; emit one item per payment.
- A price that changes over time is ONE item with a priceChange, never two items with the same name.

The user's material follows; remember to gather first and only produce the file when they say they are done.`;
}

/**
 * The on-device variant, for the small (~3B) Apple Intelligence model. The
 * output SHAPE is already forced by the Swift @Generable schema, so this
 * teaches only SEMANTICS, with worked examples for the exact patterns the
 * small model gets wrong: one item with a price change (not two), the account
 * in its own field (not notes), and keeping a real brand name. Extraction
 * only, like the big-model prompt: no defaults, no date math — omission is
 * the signal, and the parser fills and reports the rest. Feeds the SAME
 * parseImportDocument as every other path.
 */
// The context parameter stays for call-site stability; extraction-only needs
// neither today (no date math) nor the default currency (no defaulting).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function buildOnDevicePrompt(_context: ImportPromptContext): string {
  return `Turn a person's rough notes about their recurring payments into structured items for the Keel app. Produce one item per real payment. Report only what the notes state; leave out any field the notes do not give. Never invent amounts, dates, names, currencies or accounts. You only infer the category.

Fill each field from the notes:
- name: what the payment is for, in the user's own words. If they give a real name or brand ("Amazon Prime", "Netflix", "CSS"), use it EXACTLY. Never replace a real name with a placeholder like "subscription".
- amount (or "total" for a purchase split into instalments): the price as a number, e.g. 19 or 17.60. A free trial is 0.
- currency: one of ${CURRENCY_LIST}, only when stated or clearly implied (a € sign means EUR). Leave out otherwise.
- settlement: "manual" ONLY if the user says they pay it themselves (a bill, a transfer); "automatic" if they say it is debited. Leave out when they don't say.
- category: the closest of streaming, music, gaming, communications, utilities, education, software, insurance, housing, transport, health, finance, news, food, memberships, social, shopping, other.
- cadence: only when the notes state the cycle. monthly = {"unit":"month","interval":1}; yearly = {"unit":"year","interval":1}; every 2 months = {"unit":"month","interval":2}.
- Dates, exactly as stated, no date math: a full stated date goes in firstDate as "YYYY-MM-DD" ("from March 2026" with a known day means that day in March 2026); a bare day of the month goes in billingDay as a number (the 22nd → 22). Leave both out when no day appears.
- account: the bank or account name exactly as written ("CIC", "Revolut", "BCV"). Put it in THIS field, never inside notes.
- weekendShift: "before" or "after" ONLY when the user says the bank never charges on weekends (before = Friday, after = Monday); omit otherwise.
- priceChange {"newAmount":N,"on":"YYYY-MM-DD"}: when one payment's price changes over time, keep it as ONE item and record the change here. "20 then 24 since January" is ONE item, amount 20, priceChange to 24 in January. It is NEVER two items with the same name.

Examples.

Notes: netflix 25th 20 euros since may 2025 then 24 euros since january 2026 automatic
Item: ONE item. type subscription, name "Netflix", amount 20, currency EUR, category streaming, firstDate 2025-05-25, settlement automatic, priceChange {"newAmount":24,"on":"2026-01-25"}.

Notes: Netflix 13.99 monthly on the 6th from Revolut
Item: type subscription, name "Netflix", amount 13.99, category streaming, cadence monthly, billingDay 6, account "Revolut".

Notes: amazon prime 22th automatic 19 euros on CIC
Item: type subscription, name "Amazon Prime", amount 19, currency EUR, category streaming, billingDay 22, account "CIC", settlement automatic.

Notes: new sofa 900 in 3 with klarna, first payment 15 August 2026
Item: type split_payment, name "Sofa", total 900, installments 3, provider klarna, category shopping, firstDate 2026-08-15.

The user's notes follow.`;
}
