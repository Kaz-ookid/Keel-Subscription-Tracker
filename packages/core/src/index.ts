// Foundational value types (Money, CalendarDate/Timestamp, RecurrenceRule).
export * from "./primitives";

// Cross-entity reference data (supported currencies, default category seed).
export * from "./constants";

// Domain entities, built on the primitives above.
export * from "./models/account";
export * from "./models/account-factory";
export * from "./models/ai-activity";
export * from "./models/category";
export * from "./models/installment";
export * from "./models/installment-plan";
export * from "./models/payment-item";
export * from "./models/payment-item-factory";
export * from "./models/payment-item-mutations";
export * from "./models/payment-item-status";
export * from "./models/payment-occurrence";
export * from "./models/validate";

// AI-assisted import (PROJECT_BRIEF §6.1): tolerant parsing of the AI-produced
// import document into review-ready drafts, plus the canonical BYO-AI header.
export * from "./import/currency-hint";
export * from "./import/extract";
export * from "./import/parse";
export * from "./import/prompt";
export * from "./import/scrub";
export * from "./import/types";

// The assistant (PROJECT_BRIEF §6.1): the model proposes a typed plan, this
// resolves + validates it; nothing applies without the user's review.
export * from "./assistant/plan";
export * from "./assistant/prompt";

// Forecast / budget calculations (PROJECT_BRIEF §7) — pure projections of
// future money movement from the schedules above.
export * from "./calculations/forecast";
export * from "./calculations/insights";
export * from "./calculations/ledger";
export * from "./calculations/reminders";

// The app-trial clock (PROJECT_BRIEF §7.3) — pure 45-day math over an
// injected clock; storage and gating live in the app layer.
export * from "./calculations/trial-clock";
