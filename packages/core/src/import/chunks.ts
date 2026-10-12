// A long typed list is read a few lines at a time. The cloud model reads a
// three-line list in full (currency, settlement, day, start date) and
// answers an eleven-line list of the same lines with names and amounts
// only; the reads are independent, so the length is the only thing that
// changed. Documents stay whole: a policy or an invoice is one item spread
// over many lines, and cutting it would cut the item.

import { CURRENCIES } from "../constants/currencies";

const CODES = Object.keys(CURRENCIES).join("|");
const SYMBOLS = "€$£¥₹";
// A money figure: "17.6", "689,55€", "CHF 164.15", "99chf", "$108.10".
// A bare decimal must not be a date ("31.03.2026").
const MONEY = new RegExp(
  String.raw`(?:\d+(?:[.,]\d+)?\s?(?:[${SYMBOLS}]|(?:${CODES})\b)|(?:[${SYMBOLS}]|\b(?:${CODES}))\s?\d+(?:[.,]\d+)?|\b\d+[.,]\d{1,2}(?![.,]?\d))`,
  "i",
);
// Words a document carries and a typed list does not.
const DOCUMENT_WORDS =
  /\b(?:total|subtotal|sous-total|tva|vat|mwst|receipt|reçu|invoice|facture|rechnung|statement|relevé|prime|premium|police|policy|contrat|contract|vertrag|order|commande|bestellung)\b/i;

/** True for a typed list of payments: most lines carry a money figure and
 *  none of the words a receipt, an invoice, a policy or a statement uses. */
export function isItemList(text: string): boolean {
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  if (lines.length < 2 || DOCUMENT_WORDS.test(text)) return false;
  const priced = lines.filter((l) => MONEY.test(l)).length;
  return priced / lines.length >= 0.6;
}

/** The text's non-empty lines in groups of at most maxLines, in order. */
export function chunkLines(text: string, maxLines: number): string[] {
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  const chunks: string[] = [];
  for (let i = 0; i < lines.length; i += maxLines) {
    chunks.push(lines.slice(i, i + maxLines).join("\n"));
  }
  return chunks;
}
