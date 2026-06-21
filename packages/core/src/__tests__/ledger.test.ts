import { describe, expect, it } from "vitest";
import {
  buildSpendLedger,
  calendarDate,
  fromMajor,
  makeInstallmentPaymentItem,
  makeRecurringPaymentItem,
  markNextInstallmentPaid,
  now,
  RECURRENCE_PRESETS,
} from "../index";
import type { NewInstallmentInput, NewRecurringInput, PaymentOccurrence } from "../index";

const eur = (m: number) => fromMajor(m, "EUR");
const netflix: NewRecurringInput = {
  name: "Netflix",
  amount: eur(15.99),
  recurrence: RECURRENCE_PRESETS.MONTHLY,
  firstChargeDate: calendarDate("2026-01-15"),
  settlementMode: "automatic",
};
const charge = (
  paymentItemId: string,
  date: string,
  extra: Partial<PaymentOccurrence> = {},
): PaymentOccurrence => ({
  id: `o-${paymentItemId}-${date}`,
  paymentItemId,
  dueDate: calendarDate(date),
  amount: eur(15.99),
  status: "charged",
  recordedAt: now(),
  ...extra,
});

describe("buildSpendLedger", () => {
  const item = makeRecurringPaymentItem(netflix, { id: "r1", now: now() });

  it("keeps charged occurrences in range, newest first; drops non-charged and out-of-range", () => {
    const occs = [
      charge("r1", "2026-02-15"),
      charge("r1", "2026-03-15"),
      charge("r1", "2026-04-15", { status: "skipped" }),
      charge("r1", "2025-12-15"),
    ];
    const ledger = buildSpendLedger(
      [item],
      occs,
      calendarDate("2026-01-01"),
      calendarDate("2026-06-30"),
    );
    expect(ledger.map((e) => e.date)).toEqual(["2026-03-15", "2026-02-15"]);
    expect(ledger[0]).toMatchObject({ paymentItemId: "r1", name: "Netflix", kind: "charge" });
    expect(ledger[0].amount).toEqual(eur(15.99));
  });

  it("resolves the account: the occurrence's account wins, else the item's", () => {
    const onAcct = makeRecurringPaymentItem(
      { ...netflix, accountId: "acc-item" },
      { id: "r1", now: now() },
    );
    const occs = [
      charge("r1", "2026-02-15"),
      charge("r1", "2026-03-15", { paidFromAccountId: "acc-occ" }),
    ];
    const ledger = buildSpendLedger(
      [onAcct],
      occs,
      calendarDate("2026-01-01"),
      calendarDate("2026-12-31"),
    );
    expect(ledger.find((e) => e.date === "2026-03-15")?.accountId).toBe("acc-occ");
    expect(ledger.find((e) => e.date === "2026-02-15")?.accountId).toBe("acc-item");
  });

  it("includes covered installments and excludes unpaid ones", () => {
    const ids = (() => {
      let n = 0;
      return () => `i-${++n}`;
    })();
    const plan: NewInstallmentInput = {
      name: "Sofa",
      totalAmount: eur(300),
      numberOfInstallments: 3,
      recurrence: RECURRENCE_PRESETS.MONTHLY,
      firstInstallmentDate: calendarDate("2026-01-10"),
      provider: "klarna",
      settlementMode: "manual",
    };
    let inst = makeInstallmentPaymentItem(plan, { id: "p1", now: now(), makeId: ids });
    inst = markNextInstallmentPaid(inst, { paidDate: calendarDate("2026-01-10"), now: now() });

    const ledger = buildSpendLedger(
      [inst],
      [],
      calendarDate("2026-01-01"),
      calendarDate("2026-12-31"),
    );
    expect(ledger).toHaveLength(1); // only the one paid installment
    expect(ledger[0]).toMatchObject({ kind: "installment", paymentItemId: "p1" });
    expect(ledger[0].amount).toEqual(eur(100));
  });

  it("skips charges whose item is gone", () => {
    const ledger = buildSpendLedger(
      [item],
      [charge("ghost", "2026-02-15")],
      calendarDate("2026-01-01"),
      calendarDate("2026-12-31"),
    );
    expect(ledger).toEqual([]);
  });
});
