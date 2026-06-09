import { describe, expect, it } from "vitest";
import { CURRENCIES, currencyInfo, DEFAULT_CURRENCY } from "../index";
import type { CurrencyCode } from "../index";

describe("CURRENCIES", () => {
  it("exposes a valid default currency", () => {
    expect(CURRENCIES[DEFAULT_CURRENCY]).toBeDefined();
  });

  it("gives every currency a non-negative integer decimalDigits", () => {
    for (const code of Object.keys(CURRENCIES) as CurrencyCode[]) {
      const { decimalDigits } = CURRENCIES[code];
      expect(Number.isInteger(decimalDigits)).toBe(true);
      expect(decimalDigits).toBeGreaterThanOrEqual(0);
    }
  });

  it("uses its key as the code and carries a symbol + flag", () => {
    for (const code of Object.keys(CURRENCIES) as CurrencyCode[]) {
      const info = currencyInfo(code);
      expect(info.code).toBe(code);
      expect(info.symbol.length).toBeGreaterThan(0);
      expect(info.flag.length).toBeGreaterThan(0);
    }
  });
});
