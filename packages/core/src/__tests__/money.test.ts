import { describe, expect, it } from "vitest";
import { addMoney, formatMoney, fromMajor, money, sumMoney, toMajor } from "../index";

describe("Money", () => {
  it("converts major units to integer minor units", () => {
    expect(fromMajor(9.99, "EUR")).toEqual({ amount: 999, currency: "EUR" });
  });

  it("respects per-currency decimal digits (JPY has none)", () => {
    expect(fromMajor(500, "JPY")).toEqual({ amount: 500, currency: "JPY" });
    expect(toMajor({ amount: 500, currency: "JPY" })).toBe(500);
  });

  it("round-trips major → minor → major", () => {
    expect(toMajor(fromMajor(42.5, "USD"))).toBe(42.5);
  });

  it("avoids float drift that bare numbers would introduce", () => {
    // 0.1 + 0.2 in floats is 0.30000000000000004; minor units stay exact.
    const total = money(fromMajor(0.1, "EUR").amount + fromMajor(0.2, "EUR").amount, "EUR");
    expect(total.amount).toBe(30);
    expect(toMajor(total)).toBe(0.3);
  });

  it("formats with symbol and the currency's decimal places", () => {
    expect(formatMoney(fromMajor(9.99, "EUR"))).toBe("9,99 €");
    expect(formatMoney(fromMajor(500, "JPY"))).toBe("500 ¥");
  });
});

describe("Money arithmetic", () => {
  it("adds same-currency amounts", () => {
    expect(addMoney(fromMajor(4, "EUR"), fromMajor(2.5, "EUR"))).toEqual({
      amount: 650,
      currency: "EUR",
    });
  });

  it("sums a list, with the currency anchoring an empty list to zero", () => {
    expect(sumMoney([fromMajor(1, "EUR"), fromMajor(2, "EUR")], "EUR")).toEqual({
      amount: 300,
      currency: "EUR",
    });
    expect(sumMoney([], "EUR")).toEqual({ amount: 0, currency: "EUR" });
  });

  it("throws on a currency mismatch rather than producing nonsense", () => {
    expect(() => addMoney(fromMajor(1, "EUR"), fromMajor(1, "USD"))).toThrow(TypeError);
  });
});
