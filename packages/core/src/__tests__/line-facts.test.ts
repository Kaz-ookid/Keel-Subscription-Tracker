import { describe, expect, it } from "vitest";

import {
  condenseDocument,
  findSourceLine,
  isItemList,
  readDocumentAmount,
  readDocumentFacts,
  readLineFacts,
  readMoneyFigure,
} from "../import/line-facts";

describe("readMoneyFigure", () => {
  it("reads the figure and the currency glued to it, in either order", () => {
    expect(readMoneyFigure("- 6th of the month, 689,55€ car loan")).toEqual({
      amount: 689.55,
      currency: "EUR",
    });
    expect(readMoneyFigure("Apple iCloud 1€")).toEqual({ amount: 1, currency: "EUR" });
    expect(readMoneyFigure("AG night sbb cff, maual 99chf first of december")).toEqual({
      amount: 99,
      currency: "CHF",
    });
    expect(readMoneyFigure("Prime annuelle    CHF 164.15")).toEqual({
      amount: 164.15,
      currency: "CHF",
    });
    expect(readMoneyFigure("Total    $108.10")).toEqual({ amount: 108.1, currency: "USD" });
    expect(readMoneyFigure("spotify duo 17.6 on the 13th")).toEqual({ amount: 17.6 });
  });

  it("does not mistake a date or a bare integer for a price", () => {
    expect(readMoneyFigure("Début du contrat    01.10.2026")).toBeNull();
    expect(readMoneyFigure("gym 40 a month")).toBeNull();
  });
});

describe("readLineFacts", () => {
  it("reads a French line: currency, manual, the day and the start month", () => {
    expect(readLineFacts("loyer 1470 CHF, manuel, le 26 du mois, depuis mars 2026")).toEqual({
      amount: 1470,
      currency: "CHF",
      settlement: "manual",
      cadence: { unit: "month", interval: 1 },
      billingDay: 26,
      firstDate: "2026-03-26",
    });
  });

  it("reads the long list's lines the model answered with names and amounts only", () => {
    expect(
      readLineFacts(
        "CSS assurance 372.95 CHF, manual, set it for 26th of the month, started in march 2026",
      ),
    ).toMatchObject({ currency: "CHF", settlement: "manual", firstDate: "2026-03-26" });
    expect(
      readLineFacts(
        "SERAFE 329.25 CHF manual, started 31.03.2026 yearly and will be 312 CHF starting from next payment (31.03.2027)",
      ),
    ).toMatchObject({ cadence: { unit: "year", interval: 1 }, firstDate: "2026-03-31" });
    expect(
      readLineFacts(
        "abonnement demi tarif SBB CFF, 100 chf, 26 december (started december 2025), yearly manual, will go up to 170 chf starting 26 december 2027",
      ),
    ).toMatchObject({
      amount: 100,
      cadence: { unit: "year", interval: 1 },
      firstDate: "2025-12-26",
      settlement: "manual",
    });
    expect(
      readLineFacts(
        "AG night sbb cff, maual 99chf first of december 2025, last payment in december 2026",
      ),
    ).toMatchObject({ firstDate: "2025-12-01", settlement: "manual" });
    expect(
      readLineFacts(
        "Mobilis Zone 11/12 manual, 495chf started 25 march 2026, price change to 702 CHF",
      ),
    ).toMatchObject({ amount: 495, firstDate: "2026-03-25" });
    expect(
      readLineFacts("ASLOCA 110 chf per year, 30 march started in 2026, down to 80 CHF"),
    ).toMatchObject({ cadence: { unit: "year", interval: 1 }, firstDate: "2026-03-30" });
    expect(
      readLineFacts("600 CHF for 3rd pillar (swiss pension) every month at BCV, manual"),
    ).toEqual({
      amount: 600,
      currency: "CHF",
      settlement: "manual",
      cadence: { unit: "month", interval: 1 },
    });
    expect(
      readLineFacts("green.ch Internet home XL, manual, 35 CHF per month, started 13 april 2026"),
    ).toMatchObject({ cadence: { unit: "month", interval: 1 }, firstDate: "2026-04-13" });
  });

  it("reads English wording: a month, pay it myself, since a date, every N months", () => {
    expect(readLineFacts("gym 40 a month, I pay it myself")).toEqual({
      settlement: "manual",
      cadence: { unit: "month", interval: 1 },
    });
    expect(readLineFacts("Spotify 9.99 since 10 May 2026")).toMatchObject({
      firstDate: "2026-05-10",
    });
    expect(readLineFacts("Netflix 13.99 monthly on the 6th")).toMatchObject({ billingDay: 6 });
    expect(readLineFacts("water 90 every 2 months, debited")).toEqual({
      settlement: "automatic",
      cadence: { unit: "month", interval: 2 },
    });
  });

  it("takes the 1st when a line names a month and a year but no day", () => {
    expect(readLineFacts("Mobilis 495 CHF, first billing march 2026")).toMatchObject({
      firstDate: "2026-03-01",
    });
  });

  it("leaves out what the line does not state", () => {
    expect(readLineFacts("spotify duo 17.6 on the 13th")).toEqual({
      amount: 17.6,
      billingDay: 13,
    });
    expect(readLineFacts("pay in 4 times 117.94 EUR at Sample Store, 20 May 2026")).toEqual({
      amount: 117.94,
      currency: "EUR",
      firstDate: "2026-05-20",
    });
  });
});

describe("findSourceLine", () => {
  const material =
    "spotify duo 17,6 CHF 13th of the month\nCSS assurance 372.95 CHF, manual\n- 4th of the month Apple iCLoud 1€";

  it("finds the line the name came from, whatever the model did to its case", () => {
    expect(findSourceLine(material, "Apple iCloud")).toBe("- 4th of the month Apple iCLoud 1€");
    expect(findSourceLine(material, "CSS assurance")).toBe("CSS assurance 372.95 CHF, manual");
  });

  it("gives up rather than guess", () => {
    expect(findSourceLine(material, "Netflix")).toBeNull();
  });
});

describe("isItemList", () => {
  it("tells a typed list from a document", () => {
    expect(isItemList("spotify duo 17,6 CHF\nLoyer, 1470 CHF manual\n99chf AG night")).toBe(true);
    expect(
      isItemList(
        "spotify duo 17.6 on the 13th (account BCV, CHF)\nLoyer 1470 manual on the 26th (account BCV, CHF)",
      ),
    ).toBe(true);
    expect(isItemList("Receipt from Acme    $108.10\nReceipt #2372\nTotal    $108.10")).toBe(false);
    expect(
      isItemList(
        "Début du contrat    01.10.2026\nPrime annuelle    CHF 164.15\nTaxes légales    CHF 7.80",
      ),
    ).toBe(false);
  });
});

describe("condenseDocument", () => {
  const policy = [
    "assurly    5",
    "[removed]",
    "www.assurly.example",
    "INS",
    "Assurly Service Center",
    "[removed]",
    "Zurich, 17.09.2026",
    "Home Assurance ménage - Police d'assurance HOME7310288",
    "Données personnelles",
    "Preneur d'assurance    Monsieur Jean Dupont",
    "Adresse    Rue de la Gare 12, 1004 Lausanne",
    "Email    [removed]",
    "Date de naissance    03.07.1991",
    "Contenu du contrat",
    "Numéro de [removed]",
    "Début du contrat    01.10.2026",
    "Echéance du contrat    30.09.2027",
    "Fréquence de paiement    annuel",
    "Mode de paiement    facture",
    "Droit de résiliation journalier    Non",
    "Aperçu des primes",
    "Prime annuelle    CHF 164.15",
    "Sont inclus dans ce prix :",
    "Taxes légales",
    "Payable annuel",
    "Bases contractuelles pour l'assurance ménage",
    "Conditions générales (CG), édition Septembre 2026",
    "https://doc.assurly.example/fr/conditions-generales/Septembre2026/",
  ].join("\n");

  it("keeps a policy's head, dates, frequency, mode and premium, drops the boilerplate", () => {
    const kept = condenseDocument(policy).split("\n");
    expect(kept.length).toBeLessThan(policy.split("\n").length);
    expect(kept).toContain("www.assurly.example");
    expect(kept).toContain("Home Assurance ménage - Police d'assurance HOME7310288");
    expect(kept).toContain("Début du contrat    01.10.2026");
    expect(kept).toContain("Fréquence de paiement    annuel");
    expect(kept).toContain("Mode de paiement    facture");
    expect(kept).toContain("Prime annuelle    CHF 164.15");
    expect(kept.some((l) => l.includes("https://"))).toBe(false);
    expect(kept.some((l) => l.includes("Conditions générales"))).toBe(false);
    expect(kept).not.toContain("[removed]");
    expect(kept).not.toContain("Droit de résiliation journalier    Non");
  });

  it("never cuts an invoice's total from the end", () => {
    const filler = Array.from({ length: 30 }, (_, i) => `Remarque ${"x".repeat(i % 7)}`);
    const invoice = [
      "fibra.example AG    Industriestrasse 33    5242 Lupfig",
      "www.fibra.example",
      "Facture 9297585",
      ...filler,
      "Internet Home XL    01.09.2026 - 30.09.2026    46.16",
      "Montant    23.13",
      "Total CHF    25.00",
    ].join("\n");
    const kept = condenseDocument(invoice).split("\n");
    expect(kept.at(-1)).toBe("Total CHF    25.00");
    expect(kept).toContain("www.fibra.example");
    // The head stays whole (two filler lines sit in it); the rest of the filler goes.
    expect(kept.filter((l) => l.startsWith("Remarque"))).toHaveLength(2);
  });

  it("leaves a short document and a typed list alone", () => {
    const receipt = "Receipt    Apple\nOrder ID    MLX9Q4T7K\nTotal    CHF 12.95";
    expect(condenseDocument(receipt)).toBe(receipt);
    const list = Array.from({ length: 16 }, (_, i) => `item ${i} 12.50 CHF monthly`).join("\n");
    expect(condenseDocument(list)).toBe(list);
  });
});

describe("readDocumentFacts", () => {
  it("reads an invoice's payment mode and due date off their label lines", () => {
    const invoice =
      "Facture 9297585\nDate du document    14.09.2026\nPayable à    14.10.2026\nPériode    01.09.2026 - 30.09.2026\nTotal CHF    25.00";
    expect(readDocumentFacts(invoice)).toEqual({ settlement: "manual", firstDate: "2026-10-14" });
  });

  it("reads a policy's mode line and says nothing without one", () => {
    expect(
      readDocumentFacts("Fréquence de paiement    annuel\nMode de paiement    prélèvement LSV"),
    ).toEqual({ settlement: "automatic" });
    expect(readDocumentFacts("Receipt    Apple\nTotal    CHF 12.95")).toEqual({});
  });
});

describe("readDocumentAmount", () => {
  it("takes the total of an invoice and the premium of a policy", () => {
    expect(
      readDocumentAmount("Montant    23.13\nT.V.A. 8.1 % incl.    1.87\nTotal CHF    25.00"),
    ).toEqual({
      amount: 25,
      currency: "CHF",
    });
    expect(
      readDocumentAmount(
        "Aperçu des primes\nPrime annuelle    CHF 164.15\nTaxes légales    CHF 7.80\nPayable annuel",
      ),
    ).toEqual({ amount: 164.15, currency: "CHF" });
    expect(readDocumentAmount("Conditions générales\nhttps://doc.example")).toBeNull();
  });
});
