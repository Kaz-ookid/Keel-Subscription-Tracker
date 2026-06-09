// Known Buy-Now-Pay-Later providers. BNPL is the app's #1 differentiator
// (PROJECT_BRIEF §3.1), so the provider is a typed, display-rich set — same
// const-object + descriptor pattern as currencies — not a freeform string.
// `other` keeps unknown providers expressible without losing type safety.

import type { EnumDescriptor } from "../primitives/descriptor";

export const BNPL_PROVIDERS = {
  klarna: { label: "Klarna", icon: "klarna" },
  afterpay: { label: "Afterpay", icon: "afterpay" },
  alma: { label: "Alma", icon: "alma" },
  oney: { label: "Oney", icon: "oney" },
  paypal_pay_in_x: { label: "PayPal Pay in X", icon: "paypal" },
  cb_nx: { label: "Card — pay in X", icon: "creditcard" },
  other: { label: "Other", icon: "ellipsis" },
} as const satisfies Record<string, EnumDescriptor>;

/** Every known provider id, derived from `BNPL_PROVIDERS`. */
export type BnplProviderId = keyof typeof BNPL_PROVIDERS;
