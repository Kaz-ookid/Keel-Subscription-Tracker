// Typed lists often group lines under an account heading: "BCV in CHF:",
// "Revolut CHF:", "Boursorama en euro :". A person applies the heading to every
// line below it; the cloud model does so only sometimes, and a CHF list
// then lands in euros. So the heading is folded into each line before the
// model reads anything: deterministic, and the model reads per-line facts
// reliably (a list that names its currency on every line reads clean).
//
// A heading is a SHORT line ending with a colon that names a currency; a
// document's "Sont inclus dans ce prix :" names none and is left alone.

import { CURRENCIES, type CurrencyCode } from "../constants/currencies";

const CURRENCY_WORDS: Record<string, CurrencyCode> = {
  euro: "EUR",
  euros: "EUR",
  "€": "EUR",
  franc: "CHF",
  francs: "CHF",
  dollar: "USD",
  dollars: "USD",
  $: "USD",
  pound: "GBP",
  pounds: "GBP",
  livre: "GBP",
  livres: "GBP",
  "£": "GBP",
  zloty: "PLN",
  zł: "PLN",
  yen: "JPY",
};

const CONNECTORS = /^(?:in|en|a|à|auf|w|:)$/i;

/** The account name and currency a heading line states, or null. */
export function parseAccountHeading(
  line: string,
): { account: string; currency: CurrencyCode } | null {
  const trimmed = line.trim();
  if (!trimmed.endsWith(":") || trimmed.length > 48) return null;
  const words = trimmed.slice(0, -1).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 6) return null;
  let currency: CurrencyCode | null = null;
  const rest: string[] = [];
  for (const word of words) {
    const bare = word.replace(/[(),.;]/g, "");
    const upper = bare.toUpperCase();
    if (upper in CURRENCIES) currency = upper as CurrencyCode;
    else if (bare.toLowerCase() in CURRENCY_WORDS) currency = CURRENCY_WORDS[bare.toLowerCase()];
    else if (!CONNECTORS.test(bare)) rest.push(bare);
  }
  if (!currency || rest.length === 0) return null;
  return { account: rest.join(" "), currency };
}

/** The material with every account heading folded into the lines under it:
 *  "Netflix 13.99 monthly" under "Revolut EUR:" becomes
 *  "Netflix 13.99 monthly (account Revolut, EUR)". Material without such
 *  headings comes back unchanged. */
export function expandAccountHeadings(material: string): string {
  const lines = material.split("\n");
  if (!lines.some((l) => parseAccountHeading(l))) return material;
  let current: { account: string; currency: CurrencyCode } | null = null;
  const out: string[] = [];
  for (const line of lines) {
    const heading = parseAccountHeading(line);
    if (heading) {
      current = heading;
      continue;
    }
    if (!current || line.trim() === "") {
      out.push(line);
      continue;
    }
    out.push(`${line.trimEnd()} (account ${current.account}, ${current.currency})`);
  }
  return out.join("\n");
}
