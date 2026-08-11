// The assistant's instructions for the on-device model: the grounding
// snapshot (what the user tracks, by name), the op contract, and the output
// shape. Lives in core, like buildImportPrompt, so the Swift bridge only
// carries text back and forth and every platform asks the same way.

import type { CalendarDate } from "../primitives/temporal";
import { CURRENCIES, type CurrencyCode } from "../constants/currencies";
import { toMajor } from "../primitives/money";
import type { Account } from "../models/account";
import type { PaymentItem } from "../models/payment-item";

// Derived from the table so the prompt can never drift from what the app
// actually accepts.
const CURRENCY_CODES = Object.keys(CURRENCIES).join("|");

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

function describeItem(item: PaymentItem, accounts: readonly Account[], handle: number): string {
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
  // The [N] handle lets the model pick a specific item even when two share a
  // name (two "Netflix"): it references the number instead of the name.
  return `[${handle}] "${item.name}": ${amount} ${cadence(item)}, ${item.status}${next}${
    account ? `, account "${account.name}"` : ""
  }`;
}

/** The full instruction block handed to the on-device model together with the
 *  user's request. The model may only reference what this snapshot names. */
export function buildAssistantPrompt(ctx: AssistantPromptContext): string {
  const items = ctx.items.map((i, idx) => describeItem(i, ctx.accounts, idx + 1)).join("\n");
  const accounts = ctx.accounts
    .filter((a) => !a.isArchived)
    .map((a) => `- "${a.name}" (${a.currency})`)
    .join("\n");

  return `You manage a person's tracked payments in the Keel app. Today is ${ctx.today}. They tell you, in their own words and any language, what to change. Reply with ONLY a JSON object, no prose around it.

Their commitments, each with a [number] and its details (act only on these):
${items || "- (none yet)"}

Their accounts:
${accounts || "- (none yet)"}

Reply shape: {"actions":[...],"additions":[...],"note":"..."}.

Reference a commitment in "item" by its EXACT name. When two share a name (like two "Netflix"), you MUST use its [number] instead so you pick the right one: the person's words tell you which (e.g. "the 24 euros one" = the Netflix whose amount is 24). Example: {"op":"delete","item":"2"}.

Pick the action from what they MEAN. These are different; do not confuse them:
- pause = stop counting it for now, keep it. Triggers: "pause X", "put X on hold", "suspend X", "freeze X".
- resume = a paused one counts again. Triggers: "resume X", "re-enable X", "put X back on", "reactivate X", "unpause X", "start X again". This is NEVER a new addition.
- end = the service is cancelled, stops today, history kept. Triggers: "cancel X", "stop X", "I quit X", "end X".
- delete = erase it entirely, as if never tracked. Triggers: "delete X", "remove X", "get rid of X". ONLY when they want it gone, not merely cancelled.
- rename: {"op":"rename","item":name,"name":newName}.
- set_amount: {"op":"set_amount","item":name,"amount":12.95,"currency":"EUR"} (currency optional, keeps the current one). Triggers: "X is now 15", "X went up to 20".
- set_date: {"op":"set_date","item":name,"date":"YYYY-MM-DD"}. "move X to the 12th" = the 12th of the relevant month, resolved against ${ctx.today}.
- set_account: {"op":"set_account","item":name,"account":accountName}.
- mark_paid: {"op":"mark_paid","item":name}. Triggers: "I paid X".
- skip: {"op":"skip","item":name}. Triggers: "skip X this month".

"additions" = NEW commitments they describe: {"type":"subscription"|"split_payment","name":...,"amount":N (or "total" and "installments" for split_payment),"currency":"${CURRENCY_CODES}" (default ${ctx.defaultCurrency}),"cadence":{"unit":"month"|"year"|"week"|"day","interval":N},"firstDate":"YYYY-MM-DD","settlement":"automatic"|"manual","category":one of streaming music gaming communications utilities education software insurance housing transport health finance news food memberships social shopping other,"account":name optional}.

Rules:
- pause is NOT end. "Re-enable" / "put back on" is resume, NOT an addition.
- Act only on what they asked. If a name matches nothing above, leave it out and say so briefly in "note".
- Never invent amounts, dates or names.

Examples (assume the commitments include "Netflix" and "Gym"):

User: pause netflix
Reply: {"actions":[{"op":"pause","item":"Netflix"}]}

User: re-enable my netflix subscription
Reply: {"actions":[{"op":"resume","item":"Netflix"}]}

User: I cancelled the gym, and move netflix to the 12th
Reply: {"actions":[{"op":"end","item":"Gym"},{"op":"set_date","item":"Netflix","date":"2026-08-12"}]}

User: add spotify 12.95 a month
Reply: {"actions":[],"additions":[{"type":"subscription","name":"Spotify","amount":12.95,"currency":"${ctx.defaultCurrency}","cadence":{"unit":"month","interval":1},"settlement":"automatic","category":"music"}]}

Nothing you output is applied directly: the app shows every change to the user to confirm first.`;
}
