import { describe, expect, it } from "vitest";
import { convertMoney, formatTotalsIn, fromMajor, mergeTotals, type ExchangeRates } from "../index";

// EUR-based reference rates, ECB convention: units per 1 EUR.
const rates: ExchangeRates = {
  date: "2026-06-12",
  rates: { CHF: 0.95, USD: 1.08, JPY: 169.5, GBP: 0.85 },
};

describe("convertMoney", () => {
  it("converts through the EUR cross-rate", () => {
    // 10 EUR → 9.50 CHF
    expect(convertMoney(fromMajor(10, "EUR"), "CHF", rates)).toEqual(fromMajor(9.5, "CHF"));
    // 9.50 CHF → 10 EUR (inverse)
    expect(convertMoney(fromMajor(9.5, "CHF"), "EUR", rates)).toEqual(fromMajor(10, "EUR"));
    // 10.80 USD → 9.50 CHF (cross via EUR)
    expect(convertMoney(fromMajor(10.8, "USD"), "CHF", rates)).toEqual(fromMajor(9.5, "CHF"));
  });

  it("respects the target's minor-unit digits (JPY has none)", () => {
    // 10 EUR → 1695 JPY, stored as 1695 (not 169500 hundredths).
    expect(convertMoney(fromMajor(10, "EUR"), "JPY", rates)).toEqual({
      amount: 1695,
      currency: "JPY",
    });
  });

  it("is identity for the same currency and undefined for a missing rate", () => {
    const chf = fromMajor(12, "CHF");
    expect(convertMoney(chf, "CHF", rates)).toEqual(chf);
    expect(convertMoney(fromMajor(5, "CAD"), "CHF", rates)).toBeUndefined();
  });
});

describe("mergeTotals", () => {
  it("sums mixed currencies into the target, flagging the approximation", () => {
    const merged = mergeTotals([fromMajor(9.5, "CHF"), fromMajor(10.8, "USD")], "EUR", rates);
    expect(merged).toEqual({ total: fromMajor(20, "EUR"), approximate: true });
  });

  it("is exact (not approximate) when nothing needed converting", () => {
    const merged = mergeTotals([fromMajor(5, "EUR"), fromMajor(7, "EUR")], "EUR", rates);
    expect(merged).toEqual({ total: fromMajor(12, "EUR"), approximate: false });
  });

  it("refuses to merge when any rate is missing", () => {
    expect(mergeTotals([fromMajor(5, "EUR"), fromMajor(5, "CAD")], "EUR", rates)).toBeUndefined();
  });
});

describe("formatTotalsIn", () => {
  it("marks converted totals with ≈ and leaves exact ones unmarked", () => {
    expect(formatTotalsIn([fromMajor(9.5, "CHF")], "EUR", rates)).toBe("≈ 10,00 €");
    expect(formatTotalsIn([fromMajor(10, "EUR")], "EUR", rates)).toBe("10,00 €");
  });

  it("falls back to the per-currency list without rates or with gaps", () => {
    expect(formatTotalsIn([fromMajor(5, "EUR"), fromMajor(5, "CHF")], "EUR", null)).toBe(
      "5,00 € + 5,00 CHF",
    );
    expect(formatTotalsIn([fromMajor(5, "CAD")], "EUR", rates)).toBe("5,00 $");
  });

  it("shows a zero in the display currency for an empty list", () => {
    expect(formatTotalsIn([], "CHF", rates)).toBe("0,00 CHF");
  });
});
