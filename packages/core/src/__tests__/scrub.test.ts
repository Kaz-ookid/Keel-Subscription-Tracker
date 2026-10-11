import { describe, expect, it } from "vitest";

import { scrubPersonalData } from "../import/scrub";

const RECEIPT =
  "Receipt from Acme Cloud Ltd $108.10 Paid on October 9, 2026 with VISA - 4821 Receipt #5810-2276 Oct 9-Nov 9, 2026 Max plan - 5x $100.00 Qty 1 Subtotal $100.00 VAT - Switzerland (8.1%) $8.10 Total $108.10";

describe("scrubPersonalData", () => {
  it("removes the card fragment and the receipt number, keeps the money and dates", () => {
    const { text, removed, count } = scrubPersonalData(RECEIPT);
    expect(text).not.toContain("4821");
    expect(text).not.toContain("5810-2276");
    expect(text).toContain("$108.10");
    expect(text).toContain("October 9, 2026");
    expect(text).toContain("Oct 9-Nov 9, 2026");
    expect(text).toContain("Max plan");
    expect(removed.card).toBe(1);
    expect(removed.reference).toBe(1);
    expect(count).toBe(2);
  });

  it("removes emails, IBANs, phones and tax ids", () => {
    const { text, removed } = scrubPersonalData(
      "Billed to max@example.com, IBAN CH93 0076 2011 6238 5295 7, tel +41 79 123 45 67, UID CHE-123.456.789",
    );
    expect(text).not.toContain("max@example.com");
    expect(text).not.toContain("0076 2011");
    expect(text).not.toContain("79 123 45 67");
    expect(text).not.toContain("CHE-123.456.789");
    expect(removed).toMatchObject({ email: 1, iban: 1, phone: 1, taxId: 1 });
  });

  it("leaves a plain subscription list alone", () => {
    const list = "netflix 13.99 le 6, salle de sport 24.99, spotify depuis mai 2025";
    expect(scrubPersonalData(list)).toEqual({ text: list, removed: {}, count: 0 });
  });

  it("does not mistake amounts or dates for phone numbers", () => {
    const { text, count } = scrubPersonalData("Total 1 234,50 CHF on 2026-10-11, next 12.11.2026");
    expect(count).toBe(0);
    expect(text).toContain("1 234,50 CHF");
  });
});
