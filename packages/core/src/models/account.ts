import type { DescriptorMap } from "../primitives/descriptor";
import type { Money } from "../primitives/money";
import type { CurrencyCode } from "../constants/currencies";

export type AccountType = "checking" | "savings" | "credit_card" | "other";

export const ACCOUNT_TYPES: DescriptorMap<AccountType> = {
  checking: { label: "Checking", icon: "bank", tone: "neutral" },
  savings: { label: "Savings", icon: "piggy-bank", tone: "success" },
  credit_card: { label: "Credit card", icon: "creditcard", tone: "info" },
  other: { label: "Other", icon: "wallet", tone: "neutral" },
};

export interface Account {
  id: string;
  name: string;
  institution?: string;
  /** v1 rule: every payment charged to this account uses this currency. */
  currency: CurrencyCode;
  type: AccountType;
  /** UI hints — brand colour/icon chosen per account (not a SemanticTone). */
  color: string;
  icon: string;
  /** Optional user-entered running balance (no live bank sync in v1). */
  trackedBalance?: Money;
  isArchived: boolean;
}
