import { describe, expect, it } from "vitest";

import { chunkLines, isItemList } from "../import/chunks";

describe("isItemList", () => {
  it("recognises a typed list of priced lines", () => {
    expect(
      isItemList(
        "spotify duo 17,6 CHF 13th of the month\nLoyer, 1470 CHF manual, 26th of the month\n600 CHF for 3rd pillar every month\nAG night sbb cff, maual 99chf first of december 2025",
      ),
    ).toBe(true);
    expect(
      isItemList("- 6th of the month, 689,55€ car loan\n- 4th of the month Apple iCloud 1€"),
    ).toBe(true);
  });

  it("leaves documents whole", () => {
    expect(
      isItemList("Receipt from Acme Cloud Ltd    $108.10\nReceipt #5810-2276\nTotal    $108.10"),
    ).toBe(false);
    expect(
      isItemList(
        "Début du contrat    01.10.2026\nFréquence de paiement    annuel\nPrime annuelle    CHF 164.15\nTaxes légales    CHF 7.80",
      ),
    ).toBe(false);
    expect(isItemList("Statement 1 Sep 2026\n02 Sep    Netflix.com    -17.90 CHF")).toBe(false);
    expect(isItemList("Netflix 13.99 monthly")).toBe(false);
  });
});

describe("chunkLines", () => {
  it("groups non-empty lines in order", () => {
    expect(chunkLines("a\n\nb\nc\nd\n", 3)).toEqual(["a\nb\nc", "d"]);
    expect(chunkLines("a\nb", 3)).toEqual(["a\nb"]);
  });
});
