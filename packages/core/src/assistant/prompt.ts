// The assistant's instructions for the on-device model: the grounding
// snapshot (what the user tracks, by name), the op contract, and the output
// shape. Lives in core, like buildImportPrompt, so the Swift bridge only
// carries text back and forth and every platform asks the same way.

import type { CalendarDate } from "../primitives/temporal";
import type { CurrencyCode } from "../constants/currencies";
import { toMajor } from "../primitives/money";
import type { Account } from "../models/account";
import type { PaymentItem } from "../models/payment-item";

export interface AssistantPromptContext {
  items: readonly PaymentItem[];
  accounts: readonly Account[];
  today: CalendarDate;
  defaultCurrency: CurrencyCode;
}

function cadence(item: PaymentItem): string {
  const schedule = item.schedule;
  if (schedule.kind === "RECURRING") {
    const { unit, interval } = schedule.recurrence;
    return interval === 1 ? `every ${unit}` : `every ${interval} ${unit}s`;
  }
  if (schedule.kind === "INSTALLMENT") {
    return `pay in ${schedule.numberOfInstallments}`;
  }
  return schedule.recurrenceYearly ? "yearly" : "one-time";
}

function describeItem(item: PaymentItem, accounts: readonly Account[]): string {
  const schedule = item.schedule;
  const amount =
    schedule.kind === "INSTALLMENT"
      ? `${toMajor(schedule.totalAmount)} ${schedule.totalAmount.currency} total`
      : `${toMajor(schedule.amount)} ${schedule.amount.currency}`;
  const next =
    schedule.kind === "RECURRING"
      ? `, next charge ${schedule.nextChargeDate}`
      : schedule.kind === "ONE_TIME_ANNUAL"
        ? `, due ${schedule.dueDate}`
        : "";
  const account = accounts.find((a) => a.id === item.accountId);
  return `- "${item.name}": ${amount} ${cadence(item)}, ${item.status}${next}${
    account ? `, account "${account.name}"` : ""
  }`;
}

/** The full instruction block handed to the on-device model together with the
 *  user's request. The model may only reference what this snapshot names. */
export function buildAssistantPrompt(ctx: AssistantPromptContext): string {
  const items = ctx.items.map((i) => describeItem(i, ctx.accounts)).join("\n");
  const accounts = ctx.accounts
    .filter((a) => !a.isArchived)
    .map((a) => `- "${a.name}" (${a.currency})`)
    .join("\n");

  return `You manage the user's recurring payments in the Keel app. Today is ${ctx.today}. The user states, in their own words and any language, what should change. You reply with ONLY a JSON object; no prose around it.

The user's commitments:
${items || "- (none yet)"}

The user's accounts:
${accounts || "- (none yet)"}

Output shape: {"actions":[...], "additions":[...], "note": "..."}.

Each action references a commitment by its EXACT name from the list above ("item"). Allowed actions:
- {"op":"pause","item":name} — keep it but stop counting it for now.
- {"op":"resume","item":name} — a paused one starts counting again.
- {"op":"end","item":name} — the user cancelled the service; it stops today, history kept.
- {"op":"delete","item":name} — erase it completely, as if never tracked. Only when the user clearly wants it gone, not merely cancelled.
- {"op":"rename","item":name,"name":newName}
- {"op":"set_amount","item":name,"amount":12.95,"currency":"EUR"} — the new price in main units; currency optional (keeps the current one). Use when the price changed.
- {"op":"set_date","item":name,"date":"YYYY-MM-DD"} — move the NEXT charge to that day; later charges follow from it. Resolve relative dates ("the 12th") against today.
- {"op":"set_account","item":name,"account":accountName} — pay it from that account.
- {"op":"mark_paid","item":name} — the user says they just paid the current cycle.
- {"op":"skip","item":name} — deliberately sitting the current cycle out.

"additions" lists NEW commitments the user describes, each: {"type":"subscription"|"split_payment","name":...,"amount":number (or "total" and "installments" for split_payment),"currency":"EUR|USD|GBP|CHF|CAD|AUD|JPY" (default ${ctx.defaultCurrency}),"cadence":{"unit":"day"|"week"|"month"|"year","interval":N},"firstDate":"YYYY-MM-DD","settlement":"automatic"|"manual","category":one of streaming, music, gaming, communications, utilities, education, software, insurance, housing, transport, health, finance, news, food, memberships, social, shopping, other,"account":accountName optional}.

Rules:
- Only act on what the user actually asked. When a request matches nothing in the list, skip it and mention it briefly in "note".
- Never invent amounts, dates or names. Prefer fewer, certain actions over guesses.
- "note" is one short sentence to the user, in the user's language; omit it when there is nothing to say.
- Nothing you output is applied directly: the app shows every action to the user for review first.`;
}
