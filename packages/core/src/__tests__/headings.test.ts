import { describe, expect, it } from "vitest";

import {
  expandAccountHeadings,
  parseAccountHeading,
  splitAccountSections,
} from "../import/headings";

describe("parseAccountHeading", () => {
  it("reads the account and the currency in several spellings", () => {
    expect(parseAccountHeading("Revolut CHF:")).toEqual({ account: "Revolut", currency: "CHF" });
    expect(parseAccountHeading("BCV in CHF:")).toEqual({ account: "BCV", currency: "CHF" });
    expect(parseAccountHeading("Boursorama en euro :")).toEqual({ account: "Boursorama", currency: "EUR" });
    expect(parseAccountHeading("Monzo (GBP):")).toEqual({ account: "Monzo", currency: "GBP" });
  });

  it("leaves lines that are not account headings alone", () => {
    expect(parseAccountHeading("Sont inclus dans ce prix :")).toBeNull();
    expect(parseAccountHeading("Netflix 13.99 CHF monthly")).toBeNull();
    expect(parseAccountHeading("CHF:")).toBeNull();
    // A prototype name is not a currency word.
    expect(parseAccountHeading("BCV constructor:")).toBeNull();
    expect(
      parseAccountHeading("my very long account heading that goes on and on in CHF:"),
    ).toBeNull();
  });
});

describe("expandAccountHeadings", () => {
  it("folds each heading into the lines under it, until the next heading", () => {
    const material = [
      "Boursorama in euro :",
      "Apple iCloud 1€ on the 4th",
      "",
      "BCV in CHF:",
      "spotify duo 17.6 on the 13th",
      "Loyer 1470 manual",
      "Revolut CHF:",
      "pay in 4 times 117.94€ at Sample Store",
    ].join("\n");
    expect(expandAccountHeadings(material)).toBe(
      [
        "Apple iCloud 1€ on the 4th (account Boursorama, EUR)",
        "",
        "spotify duo 17.6 on the 13th (account BCV, CHF)",
        "Loyer 1470 manual (account BCV, CHF)",
        "pay in 4 times 117.94€ at Sample Store (account Revolut, CHF)",
      ].join("\n"),
    );
  });

  it("returns material without headings unchanged, documents included", () => {
    const policy = "Aperçu des primes\nSont inclus dans ce prix :\nTaxes légales    CHF 7.80";
    expect(expandAccountHeadings(policy)).toBe(policy);
    expect(expandAccountHeadings("Netflix 13.99 monthly")).toBe("Netflix 13.99 monthly");
  });
});

describe("splitAccountSections", () => {
  it("cuts the material at its headings and carries each heading's account and currency", () => {
    const material =
      "intro line\nCIC in euro :\nApple iCloud 1 on the 4th\nBCV in CHF:\nLoyer 1470 manual\n\nSERAFE 329.25";
    expect(splitAccountSections(material)).toEqual([
      { text: "intro line" },
      { account: "Boursorama", currency: "EUR", text: "Apple iCloud 1 on the 4th (account Boursorama, EUR)" },
      {
        account: "BCV",
        currency: "CHF",
        text: "Loyer 1470 manual (account BCV, CHF)\n\nSERAFE 329.25 (account BCV, CHF)",
      },
    ]);
  });

  it("is one section when there is no heading", () => {
    expect(splitAccountSections("Netflix 13.99 monthly")).toEqual([
      { text: "Netflix 13.99 monthly" },
    ]);
  });
});
