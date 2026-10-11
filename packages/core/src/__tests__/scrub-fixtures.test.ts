// Realistic bills as OCR text (synthetic, modelled on common layouts: Stripe
// receipts, App Store invoice mails, telecom bills, Swiss QR-bills, bank
// statement lines, BNPL plans). Each fixture states what must go and what
// must stay; the scrubber is tuned against all of them at once.

import { describe, expect, it } from "vitest";

import { scrubPersonalData } from "../import/scrub";

interface Fixture {
  name: string;
  text: string;
  gone: string[];
  kept: string[];
}

const FIXTURES: Fixture[] = [
  {
    name: "Stripe receipt (cloud service)",
    text: "Receipt from Acme Cloud Ltd $108.10 Paid on October 9, 2026 with VISA - 4821 Receipt #5810-2276 Oct 9-Nov 9, 2026 Max plan - 5x $100.00 Qty 1 Subtotal $100.00 VAT - Switzerland (8.1%) $8.10 Total $108.10 Amount paid $108.10",
    gone: ["4821", "5810-2276"],
    kept: ["$108.10", "October 9, 2026", "Oct 9-Nov 9, 2026", "Max plan", "Acme Cloud"],
  },
  {
    name: "App Store invoice mail",
    text: "Apple Receipt Apple ID: jane.doe@icloud.com Billed to: Jane Doe Order ID: MLX9Q4T7K Document No.: 212455678901 Date: 03 Oct 2026 Spotify Premium Individual Renews 03 Nov 2026 CHF 12.95 Subtotal CHF 12.95 VAT CHF 0.98 Total CHF 12.95 Payment method: Visa .... 4412",
    gone: ["jane.doe@icloud.com", "MLX9Q4T7K", "212455678901", "4412"],
    kept: ["Spotify Premium Individual", "CHF 12.95", "03 Nov 2026", "03 Oct 2026"],
  },
  {
    name: "Telecom bill (Swisscom-style)",
    text: "Swisscom (Schweiz) AG Rechnung Nr. 0049 3321 7784 Kundennummer 7719 4402 51 Rechnungsdatum 01.10.2026 Zahlbar bis 31.10.2026 Mobile Abo blue M CHF 59.90 Internet Home CHF 69.00 Total CHF 128.90 QR-Rechnung IBAN CH44 3199 9123 0008 8901 2 Telefon 0800 800 800",
    gone: ["0049 3321 7784", "7719 4402 51", "CH44 3199 9123 0008 8901 2", "0800 800 800"],
    kept: [
      "Mobile Abo blue M",
      "CHF 59.90",
      "Internet Home",
      "CHF 69.00",
      "Total CHF 128.90",
      "01.10.2026",
      "31.10.2026",
    ],
  },
  {
    name: "Bank statement lines (Revolut-style)",
    text: "Statement 1 Sep 2026 - 30 Sep 2026 Account CH12 0024 0240 1234 5678 9 02 Sep Netflix.com -17.90 CHF 05 Sep Migros Zürich -84.20 CHF 06 Sep Spotify AB -12.95 CHF 15 Sep Rent transfer -1620.00 CHF 25 Sep Revolut Premium -9.99 CHF Card ending 7781 Customer no. 8821934",
    gone: ["CH12 0024 0240 1234 5678 9", "7781", "8821934"],
    kept: [
      "Netflix.com -17.90 CHF",
      "Spotify AB -12.95 CHF",
      "Rent transfer -1620.00 CHF",
      "Revolut Premium -9.99 CHF",
      "1 Sep 2026 - 30 Sep 2026",
    ],
  },
  {
    name: "Klarna plan mail",
    text: "Klarna Your payment plan Order 3K7P-99Q2 at Zalando Total €179.00 Pay in 3 €59.67 due 20 Oct 2026, 20 Nov 2026, 20 Dec 2026 Questions? Call +49 221 669 501 00 or email service@klarna.de",
    gone: ["3K7P-99Q2", "+49 221 669 501 00", "service@klarna.de"],
    kept: ["Zalando", "€179.00", "Pay in 3", "€59.67", "20 Oct 2026", "20 Dec 2026"],
  },
  {
    name: "French gym contract",
    text: "Basic-Fit Contrat n° BF-2026-004417 Client : Dupont Marie Adhésion Comfort 29,99 € par mois Prélèvement le 4 de chaque mois IBAN FR76 3000 6000 0112 3456 7890 189 Tél. 06 12 34 56 78 N° TVA FR12345678901",
    gone: [
      "BF-2026-004417",
      "FR76 3000 6000 0112 3456 7890 189",
      "06 12 34 56 78",
      "FR12345678901",
    ],
    kept: ["Basic-Fit", "Adhésion Comfort", "29,99 €", "Prélèvement le 4 de chaque mois"],
  },
  {
    name: "Google Workspace invoice",
    text: "Google Workspace Invoice number 5120033412 Invoice date 1 Oct 2026 Billing ID 1234-5678-9012 Business Starter 1 user × $7.20 Subtotal $7.20 Total $7.20 Payment: Mastercard ending in 0042",
    gone: ["5120033412", "1234-5678-9012", "0042"],
    kept: ["Google Workspace", "Business Starter", "$7.20", "1 Oct 2026"],
  },
  {
    name: "Plain typed list stays untouched",
    text: "netflix 13.99 le 6, salle de sport 24.99 je paie moi-même, disney+ gratuit jusqu'au 14 juillet puis 8.99, canapé klarna 3x 240 premier le 10 juin",
    gone: [],
    kept: ["netflix 13.99 le 6", "3x 240", "14 juillet", "8.99"],
  },
];

describe("scrubPersonalData on realistic bills", () => {
  for (const fixture of FIXTURES) {
    it(fixture.name, () => {
      const { text } = scrubPersonalData(fixture.text);
      for (const fragment of fixture.gone) expect(text).not.toContain(fragment);
      for (const fragment of fixture.kept) expect(text).toContain(fragment);
    });
  }
});
