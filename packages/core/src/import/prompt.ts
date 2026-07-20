// The bring-your-own-AI instructions header (§6.1 Path A): the block a user
// copies into their own assistant, followed by their rough notes and/or
// screenshots. Canonical and English-only — ONE source of truth shared with
// the local-model training kit (ai-training/system-prompt.txt, local-only);
// any change to the format must update both, and bump the version marker.
// Always generated fresh (the header encodes our data model — never let a
// stale saved copy circulate).

import type { CurrencyCode } from "../constants/currencies";
import type { CalendarDate } from "../primitives/temporal";

/** Bumped whenever the import format changes shape. */
export const IMPORT_FORMAT_VERSION = 1;

export interface ImportPromptContext {
  today: CalendarDate;
  defaultCurrency: CurrencyCode;
}

/** Build the copy-paste instructions header for the user's own AI. */
export function buildImportPrompt({ today, defaultCurrency }: ImportPromptContext): string {
  return `You are helping someone import their recurring payments into the Keel app (import format v${IMPORT_FORMAT_VERSION}). After these instructions they will provide rough notes: typed text, and/or screenshots of confirmation emails, receipts or a banking app. Read everything they provide and convert it into Keel's JSON import document.

Reply with ONLY a JSON object of the form {"items":[ ... ]}, and present it inside a single code block so it is easy to view and copy at once. No prose or explanation around it. If you cannot parse anything, output {"items":[]}.

Each item:
- "type": "subscription" for anything recurring; "split_payment" for a purchase paid in a fixed number of instalments (pay in 4, BNPL, Klarna, etc.).
- "name": what the payment is for, kept in the user's own words and language. Do not translate or rename it. If the input gives no clear name, use a short descriptive one and record in "notes" that the name was guessed.
- "currency": one of EUR, USD, GBP, CHF, CAD, AUD, JPY. If the amount is in another currency (e.g. HKD), convert it to the equivalent the user states and add a "notes" recording the original. If no currency is given, use the default currency: ${defaultCurrency}.
- "amount" (subscription) or "total" (split_payment): a decimal in the currency's main unit (17.6 means 17.60). A FREE trial uses "amount": 0.
- "settlement": "manual" if the user says they pay it themselves / by transfer / marks it manual; otherwise "automatic".
- "category": the closest of: streaming, music, gaming, communications, utilities, education, software, insurance, housing, transport, health, finance, news, food, memberships, social, shopping, other. Use "other" if unsure. (rent→housing, loan/pension/bank fee→finance, transit→transport, ISP/mobile→communications, TV-licence/electricity→utilities, gym→health, union/association→memberships, cloud/AI/app→software.)
- "cadence": {"unit":"day"|"week"|"month"|"year","interval":N}. monthly={"unit":"month","interval":1}; "every 2 months"={"unit":"month","interval":2}; yearly={"unit":"year","interval":1}.
- "firstDate": "YYYY-MM-DD". Any day the user mentions is the billing day and MUST be kept: "the 26th", "on the 26th of the month", "vers le 3" → the 26th (or 3rd) of the current month. "started in March 2026" → that day in March. Resolve relative dates ("last December", "next payment") against today, which is ${today}.
- "account": the bank/account name as written ("BCV", "Revolut"); omit if none.

Self-reporting (IMPORTANT, the app shows these to the user on the review screen):
- "assumed": the list of field names you filled by a default assumption instead of reading them from the input, e.g. ["settlement","firstDate"]. Valid names: name, amount, currency, settlement, category, cadence, firstDate, account. Include this on EVERY item where you assumed anything.
- "uncertain": the list of field names the input truly does not provide, which the user must set. ALWAYS include "name" when no real name or brand is given: still fill "name" with a short placeholder, but declare it here so the app asks the user for a real one.

Optional fields, to include ONLY when present in the input (never invent them):
- "domain": the bare website used for the logo ("netflix.com"). Include it for every brand whose main website you know for sure, including banks, insurers and public services; omit it rather than guessing.
- "color": the brand's primary color as "#RRGGBB", for every brand whose identity color you know for sure (Spotify green, Netflix red, Swisscom blue). NEVER black, white, or a near-black/near-white shade; pick the brand's most recognizable saturated color instead. Omit when unsure. This one is knowledge about the brand, not about the input, so include it even though the input doesn't state it.
- "notes": anything that doesn't fit a field. ALSO use it to record, very briefly, anything you assumed that the input didn't state (a day of the month, a cadence, a converted amount), so the user can check it.
- "reminderDaysBefore": N, only if a reminder is requested.
- subscription "endDate": "YYYY-MM-DD", a known last charge.
- subscription "anchor": {"week":1-5,"weekday":0-6} for "1st Thursday" rules (weekday 0=Sunday..4=Thursday..6=Saturday; week 1=first..5=last); monthly only.
- subscription "priceChange": {"newAmount":N,"on":"YYYY-MM-DD"} for a future price change. Use it for trials (amount 0 now → newAmount on the date) AND plain increases/decreases ("goes up to 170 on 26.12.2027", "down to 80 from the next payment").
- split_payment "installments": N (how many payments); "provider": one of paypal_pay_in_x, klarna, afterpay, alma, oney, cb_nx, other ("PayPal"→paypal_pay_in_x, generic card plan→cb_nx).

Default assumptions, to apply UNLESS the input says otherwise (list every field you assume in that item's "assumed"):
- All payments due before today were made on time. Only if the user says something is NOT paid, behind, or overdue, add "backlogUnpaid": true to that item.
- Settlement is "automatic"; the currency is the default currency; a cycle that is implied but not stated is monthly.
- Only when NO day of the month appears anywhere for an item, use the 1st of the relevant month (and list "firstDate" in that item's "assumed"). Never move a day the user actually gave.

Rules:
- Output valid JSON only, with the exact field names above.
- split_payment items need "cadence" too (usually {"unit":"month","interval":1}).
- Never use the em dash character in any text value; use a comma, colon or parentheses instead.
- Do not guess fields that aren't supported by the input. Omit optional fields rather than filling them with placeholders.
- One input can contain many items across several accounts; emit one item per payment.
- Keep amounts as the user stated them (just normalised to a decimal); do not recompute totals from per-payment figures unless only the per-payment amount is given.

The user's notes and/or screenshots follow.`;
}

/**
 * The on-device variant, for the small (~3B) Apple Intelligence model. The
 * output SHAPE is already forced by the Swift @Generable schema, so this
 * teaches only SEMANTICS, with worked examples for the exact patterns the
 * small model gets wrong: one item with a price change (not two), the account
 * in its own field (not notes), and keeping a real brand name. It omits the
 * self-reporting (assumed/uncertain) the small model over-reports into a wall
 * of flags; the parser's own heuristics raise the review flags instead. Feeds
 * the SAME parseImportDocument as every other path.
 */
export function buildOnDevicePrompt({ today, defaultCurrency }: ImportPromptContext): string {
  return `Turn a person's rough notes about their recurring payments into structured items for the Keel app. Today is ${today}. Produce one item per real payment.

Fill each field from the notes:
- name: what the payment is for, in the user's own words. If they give a real name or brand ("Amazon Prime", "Netflix", "CSS"), use it EXACTLY. Never replace a real name with a placeholder like "subscription".
- amount (or "total" for a purchase split into instalments): the price as a number, e.g. 19 or 17.60. A free trial is 0.
- currency: one of EUR USD GBP CHF CAD AUD JPY. Use ${defaultCurrency} when none is stated.
- settlement: "automatic" normally. "manual" ONLY if the user says they pay it themselves (a bill, a transfer). If they say "automatic", it is automatic; do not second-guess what they stated.
- category: the closest of streaming, music, gaming, communications, utilities, education, software, insurance, housing, transport, health, finance, news, food, memberships, social, shopping, other.
- cadence: monthly = {"unit":"month","interval":1}; yearly = {"unit":"year","interval":1}; every 2 months = {"unit":"month","interval":2}.
- firstDate: "YYYY-MM-DD". Keep any day the user gives (the 22nd stays the 22nd). "from March 2026" means that day in March 2026. Resolve "next" or "last month" against ${today}.
- account: the bank or account name exactly as written ("CIC", "Revolut", "BCV"). Put it in THIS field, never inside notes.
- priceChange {"newAmount":N,"on":"YYYY-MM-DD"}: when one payment's price changes over time, keep it as ONE item and record the change here. The words "then", "since", "from", "goes to", "up to", "changed to", "now" before a SECOND price all describe the SAME payment changing price. "20 then 24 since January" is ONE item, amount 20, priceChange to 24 in January. It is NEVER two items.

The rules that matter most:
- ONE payment on ONE line = ONE item, even when it names two prices at two dates. If the same name appears with an old price and a new price, that is ONE item with a priceChange, NEVER two items with the same name. Only make separate items for genuinely different payments (different names).
- Read fields from the notes; do not invent amounts, dates, names or accounts that are not there. You only infer the category.

Examples.

Notes: netflix 25th 20 euros since may 2025 then 24 euros since january 2026 automatic
Item: ONE item. type subscription, name "Netflix", amount 20, currency EUR, category streaming, cadence monthly, firstDate 2025-05-25, settlement automatic, priceChange {"newAmount":24,"on":"2026-01-25"}.

Notes: Netflix 13.99 monthly on the 6th from Revolut
Item: type subscription, name "Netflix", amount 13.99, currency ${defaultCurrency}, category streaming, cadence monthly, firstDate the 6th of the current month, account "Revolut", settlement automatic.

Notes: amazon prime 22th automatic 19 euros on CIC from march 2026 then 23 from july 2026
Item: ONE item. type subscription, name "Amazon Prime", amount 19, currency EUR, category streaming, cadence monthly, firstDate 2026-03-22, account "CIC", settlement automatic, priceChange {"newAmount":23,"on":"2026-07-22"}.

Notes: new sofa 900 in 3 with klarna, first payment 15 August 2026
Item: type split_payment, name "Sofa", total 900, installments 3, provider klarna, currency ${defaultCurrency}, category shopping, cadence monthly, firstDate 2026-08-15.

The user's notes follow.`;
}
