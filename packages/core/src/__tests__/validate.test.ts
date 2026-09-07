// The restore-path guards: factory-built entities must pass untouched, and
// every corruption a hand-edited or cross-version backup can realistically
// carry must cost exactly the corrupt entry, never a crash downstream.

import { describe, expect, it } from "vitest";
import {
  calendarDate,
  filterValid,
  fromMajor,
  isValidAccount,
  isValidCategory,
  isValidMoney,
  isValidPaymentItem,
  isValidPaymentOccurrence,
  isValidRecurrence,
  isValidSuggestedCommitment,
  makeAccount,
  makeInstallmentPaymentItem,
  makeRecurringPaymentItem,
  now,
  RECURRENCE_PRESETS,
} from "../index";
import type { NewInstallmentInput, NewRecurringInput } from "../index";

const recurringInput: NewRecurringInput = {
  name: "Netflix",
  amount: fromMajor(15.99, "EUR"),
  recurrence: RECURRENCE_PRESETS.MONTHLY,
  firstChargeDate: calendarDate("2026-01-15"),
  settlementMode: "automatic",
  accountId: "acc-1",
};

const installmentInput: NewInstallmentInput = {
  name: "Sofa",
  totalAmount: fromMajor(720, "EUR"),
  numberOfInstallments: 3,
  recurrence: RECURRENCE_PRESETS.MONTHLY,
  firstInstallmentDate: calendarDate("2026-02-01"),
  settlementMode: "manual",
};

let seq = 0;
const makeId = () => `id-${(seq += 1)}`;

function recurring() {
  return makeRecurringPaymentItem(recurringInput, { id: makeId(), now: now() });
}

function installment() {
  return makeInstallmentPaymentItem(installmentInput, { id: makeId(), now: now(), makeId });
}

describe("isValidPaymentItem", () => {
  it("accepts factory-built recurring and installment items", () => {
    expect(isValidPaymentItem(recurring())).toBe(true);
    expect(isValidPaymentItem(installment())).toBe(true);
  });

  it("accepts optional fields when well-formed", () => {
    const item = {
      ...recurring(),
      categoryId: "streaming",
      color: "#E50914",
      domain: "netflix.com",
      notes: "family plan",
      reminder: { daysBefore: 2, hour: 9 },
    };
    expect(isValidPaymentItem(item)).toBe(true);
  });

  it("rejects non-objects and empty ids", () => {
    expect(isValidPaymentItem(null)).toBe(false);
    expect(isValidPaymentItem("Netflix")).toBe(false);
    expect(isValidPaymentItem({ ...recurring(), id: "" })).toBe(false);
  });

  it("rejects a corrupted amount (string where Money should be)", () => {
    const item = recurring();
    const corrupt = {
      ...item,
      schedule: { ...item.schedule, amount: "15.99" },
    };
    expect(isValidPaymentItem(corrupt)).toBe(false);
  });

  it("rejects a non-finite amount", () => {
    const item = recurring();
    const corrupt = {
      ...item,
      schedule: { ...item.schedule, amount: { amount: Number.NaN, currency: "EUR" } },
    };
    expect(isValidPaymentItem(corrupt)).toBe(false);
  });

  it("rejects malformed dates", () => {
    const item = recurring();
    const corrupt = {
      ...item,
      schedule: { ...item.schedule, nextChargeDate: "next tuesday" },
    };
    expect(isValidPaymentItem(corrupt)).toBe(false);
  });

  it("rejects unknown statuses and settlement modes", () => {
    expect(isValidPaymentItem({ ...recurring(), status: "archived" })).toBe(false);
    expect(isValidPaymentItem({ ...recurring(), settlementMode: "sepa" })).toBe(false);
  });

  it("rejects a schedule whose kind disagrees with scheduleType", () => {
    const item = recurring();
    expect(isValidPaymentItem({ ...item, scheduleType: "INSTALLMENT" })).toBe(false);
  });

  it("rejects an installment plan whose installments are not a list", () => {
    const item = installment();
    const corrupt = {
      ...item,
      schedule: { ...item.schedule, installments: "3x 240" },
    };
    expect(isValidPaymentItem(corrupt)).toBe(false);
  });

  it("rejects one corrupt installment inside an otherwise fine plan", () => {
    const item = installment();
    if (item.schedule.kind !== "INSTALLMENT") throw new Error("expected installments");
    const [first, ...rest] = item.schedule.installments;
    const corrupt = {
      ...item,
      schedule: {
        ...item.schedule,
        installments: [{ ...first, status: "paid_probably" }, ...rest],
      },
    };
    expect(isValidPaymentItem(corrupt)).toBe(false);
  });

  it("rejects a malformed reminder but accepts its absence", () => {
    expect(isValidPaymentItem({ ...recurring(), reminder: { daysBefore: "two" } })).toBe(false);
    expect(isValidPaymentItem({ ...recurring(), reminder: undefined })).toBe(true);
  });

  it("accepts a reminders list (with repeat) and rejects a malformed one", () => {
    expect(
      isValidPaymentItem({
        ...recurring(),
        reminders: [
          { daysBefore: 7, repeat: "daily" },
          { daysBefore: 1, hour: 20 },
        ],
      }),
    ).toBe(true);
    expect(isValidPaymentItem({ ...recurring(), reminders: [] })).toBe(true);
    expect(
      isValidPaymentItem({ ...recurring(), reminders: [{ daysBefore: 7, repeat: "hourly" }] }),
    ).toBe(false);
    expect(isValidPaymentItem({ ...recurring(), reminders: { daysBefore: 7 } })).toBe(false);
  });
});

describe("isValidPaymentOccurrence", () => {
  const occurrence = {
    id: "occ-1",
    paymentItemId: "item-1",
    dueDate: "2026-03-01",
    amount: { amount: 1599, currency: "EUR" },
    status: "charged",
    recordedAt: new Date().toISOString(),
  };

  it("accepts a well-formed ledger entry", () => {
    expect(isValidPaymentOccurrence(occurrence)).toBe(true);
  });

  it("rejects missing links and unknown statuses", () => {
    expect(isValidPaymentOccurrence({ ...occurrence, paymentItemId: "" })).toBe(false);
    expect(isValidPaymentOccurrence({ ...occurrence, status: "maybe" })).toBe(false);
    expect(isValidPaymentOccurrence({ ...occurrence, amount: 1599 })).toBe(false);
  });
});

describe("isValidAccount / isValidCategory / isValidSuggestedCommitment", () => {
  it("accepts a factory-built account", () => {
    const account = makeAccount(
      { name: "Revolut", type: "checking", currency: "EUR", color: "#333333", icon: "bank" },
      { id: "acc-1" },
    );
    expect(isValidAccount(account)).toBe(true);
  });

  it("rejects an account with an unknown type or bad currency", () => {
    const base = makeAccount(
      { name: "Revolut", type: "checking", currency: "EUR", color: "#333333", icon: "bank" },
      { id: "acc-1" },
    );
    expect(isValidAccount({ ...base, type: "crypto" })).toBe(false);
    expect(isValidAccount({ ...base, currency: "euro" })).toBe(false);
  });

  it("keeps categories and suggestions structural", () => {
    expect(isValidCategory({ id: "c1", name: "Streaming", icon: "tv" })).toBe(true);
    expect(isValidCategory({ id: "", name: "Streaming", icon: "tv" })).toBe(false);
    expect(isValidSuggestedCommitment({ id: "gym", name: "Gym", unit: "month" })).toBe(true);
    expect(isValidSuggestedCommitment({ id: "gym", name: "Gym", unit: "weekly" })).toBe(false);
  });
});

describe("primitives and filterValid", () => {
  it("validates money and recurrence shapes", () => {
    expect(isValidMoney({ amount: 100, currency: "CHF" })).toBe(true);
    expect(isValidMoney({ amount: Number.POSITIVE_INFINITY, currency: "CHF" })).toBe(false);
    expect(isValidRecurrence({ unit: "month", interval: 1 })).toBe(true);
    expect(isValidRecurrence({ unit: "fortnight", interval: 1 })).toBe(false);
    expect(isValidRecurrence({ unit: "month", interval: 0 })).toBe(false);
    expect(isValidRecurrence({ unit: "month", interval: 1, anchor: { week: 1, weekday: 4 } })).toBe(
      true,
    );
    expect(isValidRecurrence({ unit: "month", interval: 1, anchor: { week: 9, weekday: 4 } })).toBe(
      false,
    );
  });

  it("filterValid keeps the good entries and counts the bad", () => {
    const mixed = [recurring(), { junk: true }, installment(), null];
    const { kept, dropped } = filterValid(mixed, isValidPaymentItem);
    expect(kept).toHaveLength(2);
    expect(dropped).toBe(2);
  });
});
