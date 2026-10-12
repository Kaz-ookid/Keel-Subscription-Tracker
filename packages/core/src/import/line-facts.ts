// What a typed line states, read by code. The cloud model reads a short
// list in full and a long one as names and amounts, and it drops an amount
// typed as "689,55€" altogether; the lab showed both on the same lines in
// the same session. The facts a person types on one line (the price, its
// currency, "manual", "yearly", "26th of the month", "started march 2026")
// follow a handful of patterns in each language, so the parser reads them
// here and uses them wherever the model stayed silent. The model's own
// reading always wins when it gave one; this is the net under it.
//
// Scope: English, French and German wording; day-month-year in figures or
// words. Everything else stays with the model.

import { CURRENCIES, type CurrencyCode } from "../constants/currencies";
import type { RecurrenceRule } from "../primitives/recurrence";
import { calendarDate, isCalendarDate, type CalendarDate } from "../primitives/temporal";

export interface LineFacts {
  amount?: number;
  currency?: CurrencyCode;
  settlement?: "manual" | "automatic";
  cadence?: RecurrenceRule;
  firstDate?: CalendarDate;
  billingDay?: number;
}

const CODES = Object.keys(CURRENCIES).join("|");
const SYMBOL_CURRENCY: Record<string, CurrencyCode> = {
  "€": "EUR",
  $: "USD",
  "£": "GBP",
  "¥": "JPY",
  "₹": "INR",
};
const SYMBOLS = Object.keys(SYMBOL_CURRENCY).join("");
// A money figure: "17.6", "689,55€", "CHF 164.15", "99chf", "$108.10".
// A bare decimal must not be a date ("31.03.2026").
const MONEY = new RegExp(
  String.raw`(\d+(?:[.,]\d+)?)\s?([${SYMBOLS}]|(?:${CODES})\b)|([${SYMBOLS}]|\b(?:${CODES}))[ \t]*(\d+(?:[.,]\d+)?)|\b(\d+[.,]\d{1,2})(?![.,]?\d)`,
  "i",
);

/** The first money figure on a line, with its currency when one is glued
 *  to it. Null when the line carries none. */
export function readMoneyFigure(line: string): { amount: number; currency?: CurrencyCode } | null {
  const m = MONEY.exec(line);
  if (!m) return null;
  const digits = m[1] ?? m[4] ?? m[5];
  const unit = m[2] ?? m[3];
  const amount = Number(
    digits.includes(",") && digits.includes(".")
      ? digits.replace(/,/g, "")
      : digits.replace(",", "."),
  );
  if (!Number.isFinite(amount)) return null;
  const currency = unit
    ? (SYMBOL_CURRENCY[unit] ?? (unit.toUpperCase() as CurrencyCode))
    : undefined;
  return currency ? { amount, currency } : { amount };
}

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

const MANUAL =
  /\b(?:manual|manuel|manuelle|maual|virement|transfer|bill|invoice|facture|rechnung|überweisung)\b|\bpay (?:it |for it )?myself\b|\bje (?:le |la )?paie\b|\bI pay\b/i;
const AUTOMATIC =
  /\b(?:automatic|automatique|automatically|debited|debit|direct debit|prélèvement|prélevé|prelevement|lastschrift|lsv|card|carte|karte)\b/i;

const EVERY_N =
  /\b(?:every|tous les|alle)\s+(\d{1,2})\s+(months?|mois|monat[e]?|weeks?|semaines?|wochen?|years?|ans?|jahre?)\b/i;
const YEARLY =
  /\b(?:yearly|annual|annually|per year|a year|each year|every year|par an|annuel|annuelle|chaque année|jährlich|pro jahr|im jahr)\b|\/(?:year|an|jahr)\b/i;
const QUARTERLY = /\b(?:quarterly|trimestriel|trimestrielle|vierteljährlich)\b/i;
const WEEKLY =
  /\b(?:weekly|per week|a week|every week|hebdo|hebdomadaire|par semaine|wöchentlich|pro woche)\b/i;
const MONTHLY =
  /\b(?:monthly|per month|a month|each month|every month|of the month|par mois|mensuel|mensuelle|chaque mois|du mois|monatlich|pro monat|im monat)\b|\/(?:month|mois|monat)\b/i;

const UNIT_OF = (word: string): RecurrenceRule["unit"] =>
  /^(?:week|semaine|woche)/i.test(word)
    ? "week"
    : /^(?:year|an|jahr)/i.test(word)
      ? "year"
      : "month";

const MONTHS: readonly (readonly string[])[] = [
  ["january", "jan", "janvier", "januar"],
  ["february", "feb", "février", "fevrier", "fév", "februar"],
  ["march", "mar", "mars", "märz", "maerz"],
  ["april", "apr", "avril"],
  ["may", "mai"],
  ["june", "jun", "juin", "juni"],
  ["july", "jul", "juillet", "juli"],
  ["august", "aug", "août", "aout"],
  ["september", "sep", "sept", "septembre"],
  ["october", "oct", "octobre", "oktober", "okt"],
  ["november", "nov", "novembre"],
  ["december", "dec", "décembre", "decembre", "déc", "dezember", "dez"],
];
const MONTH_WORD = MONTHS.flat()
  .sort((a, b) => b.length - a.length)
  .join("|");
const monthNumber = (word: string): number =>
  MONTHS.findIndex((names) => names.includes(word.toLowerCase())) + 1;

const FIRST_WORDS = /\b(?:first|premier|1er|erste[nr]?)\b/i;

const NUMERIC_DATE = /\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/;
const DAY_MONTH = new RegExp(
  String.raw`\b(\d{1,2})(?:st|nd|rd|th|er|e|\.)?\s+(?:of\s+)?(${MONTH_WORD})\b`,
  "i",
);
const MONTH_DAY = new RegExp(String.raw`\b(${MONTH_WORD})\s+(\d{1,2})(?:st|nd|rd|th)?\b`, "i");
const FIRST_MONTH = new RegExp(
  String.raw`\b(?:first|premier|1er|erste[nr]?)\s+(?:of\s+)?(${MONTH_WORD})\b`,
  "i",
);
const MONTH_YEAR = new RegExp(String.raw`\b(${MONTH_WORD})\.?\s+(\d{4})\b`, "i");
const BARE_YEAR = /\b(20\d{2})\b/;

const DAY_OF_MONTH = new RegExp(
  String.raw`\b(\d{1,2})(?:st|nd|rd|th|er|e)?\s+(?:of the month|du mois|des monats)\b|\b(?:on the|le|vers le|am|every|chaque)\s+(\d{1,2})(?:st|nd|rd|th|er|e|\.)?\b(?!\s*(?:${MONTH_WORD}|months?|mois|monat[e]?|weeks?|semaines?|wochen?|years?|ans?|jahre?|x|times|fois)\b)(?![./]\d)`,
  "i",
);

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toDate(year: number, month: number, day: number): CalendarDate | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const candidate = `${year}-${pad(month)}-${pad(day)}`;
  return isCalendarDate(candidate) ? calendarDate(candidate) : undefined;
}

/** The first full date a line states: "31.03.2026", "25 march 2026",
 *  "first of december 2025", "26 december (started december 2025)",
 *  "30 march started in 2026", or "26th of the month, started march 2026". */
function readFirstDate(line: string, billingDay: number | undefined): CalendarDate | undefined {
  const numeric = NUMERIC_DATE.exec(line);
  if (numeric) {
    const [, d, m, y] = numeric;
    return toDate(Number(y), Number(m), Number(d));
  }
  let day: number | undefined;
  let month: number | undefined;
  const dayMonth = DAY_MONTH.exec(line);
  const monthDay = MONTH_DAY.exec(line);
  const firstMonth = FIRST_MONTH.exec(line);
  if (dayMonth) {
    day = Number(dayMonth[1]);
    month = monthNumber(dayMonth[2]);
  } else if (firstMonth) {
    day = 1;
    month = monthNumber(firstMonth[1]);
  } else if (monthDay) {
    day = Number(monthDay[2]);
    month = monthNumber(monthDay[1]);
  }
  const monthYear = MONTH_YEAR.exec(line);
  let year: number | undefined;
  if (monthYear) {
    year = Number(monthYear[2]);
    if (month === undefined) month = monthNumber(monthYear[1]);
  } else {
    const bare = BARE_YEAR.exec(line);
    if (bare) year = Number(bare[1]);
  }
  if (day === undefined) day = billingDay;
  if (day === undefined || month === undefined || year === undefined) return undefined;
  return toDate(year, month, day);
}

/** Everything one typed line states, by pattern. */
export function readLineFacts(line: string): LineFacts {
  const facts: LineFacts = {};
  const money = readMoneyFigure(line);
  if (money) {
    facts.amount = money.amount;
    if (money.currency) facts.currency = money.currency;
  }
  if (MANUAL.test(line)) facts.settlement = "manual";
  else if (AUTOMATIC.test(line)) facts.settlement = "automatic";

  const everyN = EVERY_N.exec(line);
  if (everyN) facts.cadence = { unit: UNIT_OF(everyN[2]), interval: Number(everyN[1]) };
  else if (YEARLY.test(line)) facts.cadence = { unit: "year", interval: 1 };
  else if (QUARTERLY.test(line)) facts.cadence = { unit: "month", interval: 3 };
  else if (WEEKLY.test(line)) facts.cadence = { unit: "week", interval: 1 };
  else if (MONTHLY.test(line)) facts.cadence = { unit: "month", interval: 1 };

  const dayOfMonth = DAY_OF_MONTH.exec(line);
  const day = dayOfMonth ? Number(dayOfMonth[1] ?? dayOfMonth[2]) : undefined;
  if (day !== undefined && day >= 1 && day <= 31) facts.billingDay = day;
  else if (FIRST_WORDS.test(line) && /\b(?:of the month|du mois|des monats)\b/i.test(line)) {
    facts.billingDay = 1;
  }
  const firstDate = readFirstDate(line, facts.billingDay);
  if (firstDate) facts.firstDate = firstDate;
  return facts;
}

const WORD = /[\p{L}\p{N}]+/gu;

/** The line of the material an item's name came from: the line sharing
 *  the most of the name's words, at least half of them. Null when none. */
export function findSourceLine(material: string, name: string): string | null {
  const words = (name.toLowerCase().match(WORD) ?? []).filter((w) => w.length >= 2);
  if (words.length === 0) return null;
  const needed = Math.max(1, Math.ceil(words.length / 2));
  let best: { line: string; score: number } | null = null;
  for (const line of material.split("\n")) {
    const lower = line.toLowerCase();
    const score = words.filter((w) => lower.includes(w)).length;
    if (score >= needed && (!best || score > best.score)) best = { line, score };
  }
  return best?.line ?? null;
}

// A document's lines worth sending: the ones that carry money, a date, or
// a word that names the product, the price, the period, the frequency or
// the payment mode. Legal boilerplate, links and blanked-out details go.
const SIGNAL_WORDS =
  /\b(?:prime|premium|prämie|total|montant|betrag|amount|fréquence|frequency|zahlungsweise|mode de paiement|payment method|zahlungsart|début|start|beginn|échéance|echéance|expiry|ablauf|période|period|zeitraum|payable|due|fällig|renews?|renouvel\w*|verlängert|abonnement|subscription|abo|plan|facture|invoice|rechnung|receipt|reçu|police|policy|contrat|contract|vertrag|mensuel\w*|monthly|monatlich|annuel\w*|annual|yearly|jährlich|prélèvement|lastschrift|direct debit|carte|card|karte|order|commande|bestellung)\b/iu;
const NOISE_LINES =
  /https?:|www\.|\b(?:conditions|édition|edition|ausgabe)\b|^\W*(?:\[removed\]\W*)+$/iu;
const DATE_LIKE = new RegExp(
  String.raw`${NUMERIC_DATE.source}|\b(?:${MONTH_WORD})\.?\s+\d{4}\b|\b\d{1,2}\s+(?:${MONTH_WORD})\b`,
  "iu",
);
const CONDENSE_KEEP_HEAD = 3;
const CONDENSE_MAX_LINES = 14;

/** A long document cut down to the lines that can matter to a reader
 *  (its first lines, then every line with money, a date or a signal
 *  word), so the model reads a short text, which it reads in full. A
 *  document that already fits comes back unchanged; so does a typed list. */
export function condenseDocument(text: string): string {
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  if (lines.length <= CONDENSE_MAX_LINES || isItemList(text)) return text;
  const kept = lines.filter(
    (line, i) =>
      !NOISE_LINES.test(line) &&
      (i < CONDENSE_KEEP_HEAD ||
        MONEY.test(line) ||
        DATE_LIKE.test(line) ||
        SIGNAL_WORDS.test(line)),
  );
  return kept.slice(0, CONDENSE_MAX_LINES).join("\n");
}

// The lines of a document that name its price, most specific first: the
// total of an invoice or receipt, the premium of a policy, a stated
// periodic amount.
const PRICE_LINES: readonly RegExp[] = [
  /\b(?:total|montant total|gesamtbetrag|payable|zu zahlen|amount due)\b/i,
  /\b(?:prime|premium|prämie|montant|betrag|amount)\b/i,
  /\b(?:annuel|annual|yearly|jährlich|mensuel|monthly|monatlich|per month|par mois|pro monat)\b/i,
];

/** A document's price when the model omitted it: the money figure on the
 *  first line that names a total, a premium or a periodic amount. */
export function readDocumentAmount(
  material: string,
): { amount: number; currency?: CurrencyCode } | null {
  const lines = material.split("\n");
  for (const pattern of PRICE_LINES) {
    for (const line of lines) {
      if (!pattern.test(line)) continue;
      const money = readMoneyFigure(line);
      if (money && money.amount > 0) return money;
    }
  }
  return null;
}
