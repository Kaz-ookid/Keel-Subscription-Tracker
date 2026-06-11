// Assembly logic for accounts, kept in the core so the UI never hand-builds
// (or mis-builds) an Account. Pure: the id is injected.

import type { CurrencyCode } from "../constants/currencies";
import type { Account, AccountType } from "./account";

/** The user-supplied shape behind the "new account" form. */
export interface NewAccountInput {
  name: string;
  type: AccountType;
  /** v1 rule: every payment charged to this account uses this currency. */
  currency: CurrencyCode;
  institution?: string;
  color: string;
  icon: string;
}

export interface MakeAccountContext {
  id: string;
}

/** Build a valid, active Account from form input. */
export function makeAccount(input: NewAccountInput, ctx: MakeAccountContext): Account {
  return {
    id: ctx.id,
    name: input.name.trim(),
    type: input.type,
    currency: input.currency,
    institution: input.institution?.trim() || undefined,
    color: input.color,
    icon: input.icon,
    isArchived: false,
  };
}
