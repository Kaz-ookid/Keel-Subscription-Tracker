// Automatic privacy scrubbing for text read off screenshots before it goes
// to a model. Deterministic and pattern-based: it removes what has a
// recognizable SHAPE (card numbers and last-4 fragments, IBANs, emails,
// phone numbers, receipt/invoice/order references, VAT ids) and reports
// what it removed, so the user sees the result and finishes the job by hand
// for what no pattern can know (names, street addresses). It never touches
// amounts, dates or brand names: those are the material.

export type ScrubKind = "email" | "card" | "iban" | "phone" | "reference" | "taxId";

export interface ScrubResult {
  text: string;
  /** How many fragments each pattern removed (0 entries omitted). */
  removed: Partial<Record<ScrubKind, number>>;
  /** Total fragments removed. */
  count: number;
}

const MARK = "[removed]";

const PATTERNS: readonly [ScrubKind, RegExp][] = [
  ["email", /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g],
  // IBAN: two letters, two digits, 11-30 alphanumerics, spaces allowed.
  ["iban", /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?\b/g],
  // Full card numbers (13-19 digits in groups) and the last-4 forms:
  // "VISA - 4821", "Visa •••• 4242", "ending in 4242", "**** 4821".
  ["card", /\b(?:\d[ -]?){13,19}\b/g],
  [
    "card",
    /\b(?:visa|mastercard|master card|amex|american express|maestro|carte|card|karte|carta|karta)\b[^\n\d]{0,20}(?:[•*xX]{2,}[\s-]*)?\d{4}\b/gi,
  ],
  ["card", /(?:[•*xX]{4}[\s-]*){2,3}\d{4}\b/g],
  [
    "card",
    /\b(?:ending in|ending with|se terminant par|endet auf|che termina con|kończąca się na)\s+\d{4}\b/gi,
  ],
  // Receipt / invoice / order / customer / transaction references.
  [
    "reference",
    /\b(?:receipt|invoice|order|customer|transaction|reference|ref|billing|document|contract|member|policy|facture|reçu|commande|client|contrat|police|rechnung|beleg|bestellung|kunde|vertrag|mitglied|fattura|ricevuta|ordine|cliente|contratto|faktura|paragon|zamówienie|klient|umowa)\s*(?:number|no\.?|nr\.?|n°|#|id|numéro|nummer|numero|numer)?\s*[:#]?\s*(?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{3,}\b/gi,
  ],
  // VAT / UID / tax ids: CHE-123.456.789, FR12345678901, DE123456789, EU...
  ["taxId", /\b(?:CHE-\d{3}\.\d{3}\.\d{3}|[A-Z]{2}\d{8,12}|EU\d{9})\b/g],
  // Phone numbers: +41 79 123 45 67, 079 123 45 67, (555) 123-4567.
  [
    "phone",
    /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)\d{2,4}[\s.-]?\d{2,4}(?:[\s.-]?\d{2,4})?\b/g,
  ],
];

// Phone patterns are greedy enough to eat amounts and dates; only accept a
// match that looks like a phone (7+ digits, no currency/date punctuation).
function looksLikePhone(fragment: string): boolean {
  const digits = fragment.replace(/\D/g, "");
  return (
    digits.length >= 7 &&
    digits.length <= 15 &&
    !/[.,]\d{2}\b/.test(fragment) &&
    !/\d{4}-\d{2}-\d{2}/.test(fragment)
  );
}

/** Strip personally identifying fragments from OCR text and say what went. */
export function scrubPersonalData(input: string): ScrubResult {
  let text = input;
  const removed: Partial<Record<ScrubKind, number>> = {};
  for (const [kind, pattern] of PATTERNS) {
    text = text.replace(pattern, (fragment) => {
      if (kind === "phone" && !looksLikePhone(fragment)) return fragment;
      removed[kind] = (removed[kind] ?? 0) + 1;
      // An email's domain names the issuer ("@spotify.com" is how the
      // model finds the logo); only the part before the @ is the person.
      if (kind === "email") return `${MARK}${fragment.slice(fragment.indexOf("@"))}`;
      return MARK;
    });
  }
  const count = Object.values(removed).reduce((sum, n) => sum + (n ?? 0), 0);
  return { text, removed, count };
}
