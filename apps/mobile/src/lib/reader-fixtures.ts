// The reader's fixture set (dev builds only, run from the reader lab): a
// dozen synthetic materials, each with the fields a correct read MUST get,
// scored against what the cloud model returned. Invented names, addresses
// and numbers throughout; the layouts are the real ones. A prompt or schema
// change is judged on this scorecard, never on one screenshot.

import { toMajor, type CurrencyCode, type ImportDraft, type RecurrenceRule } from "@keel/core";

export interface ExpectedItem {
  /** Case-insensitive substring of the draft's name. */
  name: string;
  amount?: number;
  currency?: CurrencyCode;
  cadence?: RecurrenceRule;
  firstDate?: string;
  settlement?: "manual" | "automatic";
  /** Split payments: the instalment count. */
  installments?: number;
}

export interface Fixture {
  id: string;
  material: string;
  expect: ExpectedItem[];
}

export const READER_FIXTURES: Fixture[] = [
  {
    id: "typed-en",
    material:
      "Revolut EUR:\nNetflix 13.99 monthly on the 6th\ngym 40 a month, I pay it myself\nSpotify 9.99 since 10 May 2026",
    expect: [
      { name: "netflix", amount: 13.99, currency: "EUR", cadence: { unit: "month", interval: 1 } },
      { name: "gym", amount: 40, settlement: "manual" },
      { name: "spotify", amount: 9.99, firstDate: "2026-05-10" },
    ],
  },
  {
    id: "typed-fr-day-and-month",
    material:
      "BCV en CHF :\nloyer 1470 CHF, manuel, le 26 du mois, depuis mars 2026\nSwisscom 59.90 CHF par mois, prélèvement\nCSS assurance 372.95 CHF, manuel, 26 du mois, commencé en mars 2026",
    expect: [
      {
        name: "loyer",
        amount: 1470,
        currency: "CHF",
        settlement: "manual",
        firstDate: "2026-03-26",
      },
      {
        name: "swisscom",
        amount: 59.9,
        currency: "CHF",
        settlement: "automatic",
        cadence: { unit: "month", interval: 1 },
      },
      { name: "css", amount: 372.95, currency: "CHF", firstDate: "2026-03-26" },
    ],
  },
  {
    id: "typed-mixed-currencies",
    material:
      "Boursorama in euro:\nApple iCloud 1€ on the 4th\ncar loan 689.55 on the 6th\n\nBCV in CHF:\nspotify duo 17.6 on the 13th\nLoyer 1470 manual on the 26th",
    expect: [
      { name: "icloud", amount: 1, currency: "EUR" },
      { name: "car loan", amount: 689.55, currency: "EUR" },
      { name: "claude", amount: 17.6, currency: "CHF" },
      { name: "loyer", amount: 1470, currency: "CHF", settlement: "manual" },
    ],
  },
  {
    id: "typed-price-change",
    material:
      "SERAFE 329.25 CHF manual, started 31.03.2026 yearly and will be 312 CHF from the next payment (31.03.2027)\nhalf-fare SBB 100 CHF yearly on 26 December, started December 2025, goes up to 170 CHF on 26 December 2027",
    expect: [
      {
        name: "serafe",
        amount: 329.25,
        currency: "CHF",
        cadence: { unit: "year", interval: 1 },
        firstDate: "2026-03-31",
        settlement: "manual",
      },
      {
        name: "sbb",
        amount: 100,
        currency: "CHF",
        cadence: { unit: "year", interval: 1 },
        firstDate: "2025-12-26",
      },
    ],
  },
  {
    id: "typed-split",
    material:
      "Revolut CHF:\npay in 4 times 117.94 EUR (29.49 per month) at Sample Store (sample-store.fr), 20 May 2026, provider PayPal\nsofa on Klarna, 3x 240 CHF, first one 10 June 2026",
    expect: [
      {
        name: "sample store",
        amount: 117.94,
        currency: "EUR",
        installments: 4,
        firstDate: "2026-05-20",
      },
      { name: "sofa", amount: 720, installments: 3, firstDate: "2026-06-10" },
    ],
  },
  {
    id: "policy-fr",
    material:
      "assurly    service@assurly.example\nZurich, 17.09.2026\nHome Assurance ménage - Police d'assurance HOME7310288\nPreneur d'assurance    Monsieur Jean Dupont\nDébut du contrat    01.10.2026\nEchéance du contrat    30.09.2027\nFréquence de paiement    annuel\nMode de paiement    facture\nAperçu des primes\nPrime annuelle    CHF 164.15\nTaxes légales    CHF 7.80\nPayable annuel    CHF 164.15",
    expect: [
      {
        name: "assur",
        amount: 164.15,
        currency: "CHF",
        cadence: { unit: "year", interval: 1 },
        firstDate: "2026-10-01",
        settlement: "manual",
      },
    ],
  },
  {
    id: "invoice-fr",
    material:
      "fibra.example AG    Industriestrasse 33    5242 Lupfig\nFacture 9297585\nDate du document    14.09.2026\nPayable à    14.10.2026\nPériode    01.09.2026 - 30.09.2026\nPos.    Activité    Quantité    Prix    Total\n1    Internet\n1.1    PROMO26    1 pces    -23.03    -23.03\n1.2    Internet Home XL    01.09.2026 - 30.09.2026    1 pces    46.16    46.16\nMontant    23.13\nT.V.A. 8.1 % incl.    1.87\nTotal CHF    25.00",
    expect: [
      {
        name: "internet home xl",
        amount: 25,
        currency: "CHF",
        cadence: { unit: "month", interval: 1 },
        firstDate: "2026-10-14",
        settlement: "manual",
      },
    ],
  },
  {
    id: "receipt-app-store",
    material:
      "Receipt    Apple\nOrder ID    MLX9Q4T7K\nDate    03 Oct 2026\nMusicStream Premium Individual    Renews 03 Nov 2026    CHF 12.95\nSubtotal    CHF 12.95\nTotal    CHF 12.95",
    expect: [
      {
        name: "musicstream",
        amount: 12.95,
        currency: "CHF",
        cadence: { unit: "month", interval: 1 },
      },
    ],
  },
  {
    id: "receipt-stripe-usd",
    material:
      "Receipt from Acme Cloud Ltd    $108.10    Paid on October 9, 2026 with VISA - 4821\nReceipt #5810-2276\nOct 9 - Nov 9, 2026    Max plan - 5x    $100.00\nVAT (8.1%)    $8.10\nTotal    $108.10",
    expect: [
      { name: "acme", amount: 108.1, currency: "USD", cadence: { unit: "month", interval: 1 } },
    ],
  },
  {
    id: "bnpl-mail",
    material:
      "Klarna    Your payment plan\nOrder 3K7P-99Q2 at Zalando\nTotal €179.00    Pay in 3    €59.67 due 20 Oct 2026, 20 Nov 2026, 20 Dec 2026",
    expect: [
      { name: "zalando", amount: 179, currency: "EUR", installments: 3, firstDate: "2026-10-20" },
    ],
  },
  {
    id: "statement-lines",
    material:
      "Statement 1 Sep 2026 - 30 Sep 2026\n02 Sep    Netflix.com    -17.90 CHF\n05 Sep    Migros Zürich    -84.20 CHF\n06 Sep    Spotify AB    -12.95 CHF\n15 Sep    Rent transfer standing order    -1620.00 CHF\n18 Sep    Coop    -12.40 CHF\n25 Sep    Revolut Premium    -9.99 CHF",
    expect: [
      { name: "netflix", amount: 17.9, currency: "CHF" },
      { name: "spotify", amount: 12.95, currency: "CHF" },
      { name: "rent", amount: 1620, currency: "CHF" },
      { name: "revolut premium", amount: 9.99, currency: "CHF" },
    ],
  },
];

export interface FixtureScore {
  id: string;
  /** Checks the model READ (a defaulted field is a miss). */
  passed: number;
  /** Checks whose final value is right, defaults included: what the user sees. */
  landed: number;
  total: number;
  lines: string[];
}

/** Score one fixture's parsed drafts against its expectations. */
export function scoreFixture(
  fixture: Fixture,
  result: { drafts: ImportDraft[]; skipped: number },
): FixtureScore {
  const lines: string[] = [];
  let passed = 0;
  let landed = 0;
  let total = 0;
  const check = (label: string, ok: boolean, got: unknown, want: unknown, right = ok) => {
    total += 1;
    if (ok) passed += 1;
    if (right) landed += 1;
    const mark = ok ? "ok " : right ? "def" : "NO ";
    lines.push(`  ${mark} ${label}: want ${String(want)}, got ${String(got)}`);
  };
  for (const want of fixture.expect) {
    const draft = result.drafts.find((d) =>
      d.input.name.toLowerCase().includes(want.name.toLowerCase()),
    );
    lines.push(`- ${want.name}${draft ? ` → "${draft.input.name}"` : " → MISSING"}`);
    total += 1;
    if (!draft) continue;
    passed += 1;
    landed += 1;
    const got = read(draft);
    // A field the parser had to default was NOT read, whatever it defaulted to.
    const assumed = new Set<string>(draft.assumedFields);
    const shown = (field: string, value: unknown) =>
      assumed.has(field) ? `${String(value)} (defaulted)` : value;
    if (want.amount !== undefined)
      check("amount", got.amount === want.amount, got.amount, want.amount);
    if (want.currency) {
      const right = got.currency === want.currency;
      check(
        "currency",
        right && !assumed.has("currency"),
        shown("currency", got.currency),
        want.currency,
        right,
      );
    }
    if (want.cadence) {
      const right =
        got.cadence?.unit === want.cadence.unit && got.cadence?.interval === want.cadence.interval;
      check(
        "cadence",
        right && !assumed.has("cadence"),
        shown("cadence", got.cadence ? `${got.cadence.interval} ${got.cadence.unit}` : "none"),
        `${want.cadence.interval} ${want.cadence.unit}`,
        right,
      );
    }
    if (want.firstDate) {
      const right = got.firstDate === want.firstDate;
      check(
        "firstDate",
        right && !assumed.has("firstDate"),
        shown("firstDate", got.firstDate),
        want.firstDate,
        right,
      );
    }
    if (want.settlement) {
      const right = got.settlement === want.settlement;
      check(
        "settlement",
        right && !assumed.has("settlement"),
        shown("settlement", got.settlement),
        want.settlement,
        right,
      );
    }
    if (want.installments !== undefined)
      check(
        "installments",
        got.installments === want.installments,
        got.installments,
        want.installments,
      );
    const defaulted = draft.assumedFields.filter((f) =>
      ["currency", "cadence", "firstDate", "settlement"].includes(f),
    );
    if (defaulted.length) lines.push(`  (defaulted: ${defaulted.join(", ")})`);
  }
  if (result.skipped) lines.push(`  ${result.skipped} skipped by the parser`);
  return { id: fixture.id, passed, landed, total, lines };
}

function read(draft: ImportDraft): {
  amount?: number;
  currency?: string;
  cadence?: RecurrenceRule;
  firstDate?: string;
  settlement?: string;
  installments?: number;
} {
  if (draft.kind === "subscription") {
    const s = draft.input;
    return {
      amount: toMajor(s.amount),
      currency: s.amount.currency,
      cadence: s.recurrence,
      firstDate: s.firstChargeDate,
      settlement: s.settlementMode,
    };
  }
  const s = draft.input;
  return {
    amount: toMajor(s.totalAmount),
    currency: s.totalAmount.currency,
    firstDate: s.firstInstallmentDate,
    settlement: s.settlementMode,
    installments: s.numberOfInstallments,
  };
}
