import { describe, expect, it } from "vitest";

import { detectCurrencyHint } from "../import/currency-hint";

describe("detectCurrencyHint", () => {
  it("reads a plain dollar receipt as USD", () => {
    expect(
      detectCurrencyHint("Receipt from Acme Cloud Ltd $108.10 Paid on October 9, 2026"),
    ).toBe("USD");
  });

  it("reads codes and unambiguous symbols", () => {
    expect(detectCurrencyHint("Netflix 17.99 CHF le 3")).toBe("CHF");
    expect(detectCurrencyHint("Abo 12,99 € monatlich")).toBe("EUR");
    expect(detectCurrencyHint("Spotify £10.99")).toBe("GBP");
    expect(detectCurrencyHint("Netflix 43 zł")).toBe("PLN");
    expect(detectCurrencyHint("Total CA$ 12.00")).toBe("CAD");
    expect(detectCurrencyHint("R$ 39,90 por mês")).toBe("BRL");
  });

  it("stays quiet when the text shows none or several currencies", () => {
    expect(detectCurrencyHint("netflix 13.99 the 6th, gym 40 a month")).toBeNull();
    expect(detectCurrencyHint("rent 1620 CHF, airpods 179 €")).toBeNull();
    expect(detectCurrencyHint("15 kr")).toBeNull(); // SEK/NOK/DKK: the model's call
  });

  it("does not count a prefixed dollar twice", () => {
    expect(detectCurrencyHint("Subtotal CA$100.00 Total CA$108.10")).toBe("CAD");
  });
});
