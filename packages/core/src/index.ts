// Foundational value types (Money, CalendarDate/Timestamp, RecurrenceRule) and
// the shared enum-descriptor pattern that every model builds on.
export * from "./primitives";

// Cross-entity reference data (supported currencies, default category seed).
export * from "./constants";

// Domain entities — each upgraded to use the primitives above.
// Calculation logic (forecasts, budget smoothing) lands after the data-model
// walkthrough validates these types — see PROJECT_BRIEF.md §7.
export * from "./models/account";
export * from "./models/account-factory";
export * from "./models/category";
export * from "./models/installment";
export * from "./models/installment-plan";
export * from "./models/payment-item";
export * from "./models/payment-item-factory";
export * from "./models/payment-item-status";
export * from "./models/payment-occurrence";
export * from "./models/receipt-capture";

// Forecast / budget calculations (PROJECT_BRIEF §7) — pure projections of
// future money movement from the schedules above.
export * from "./calculations/forecast";
