// The locale check: what TypeScript cannot see in a translation. Run from the
// repo root: npx vitest run --root apps/mobile/src/i18n
// It reads the plain locale objects only, never index.ts (which boots i18next
// and native modules).

import { CSV_COLUMNS } from "@keel/core";
import { describe, expect, test } from "vitest";

import { de } from "./de";
import { en } from "./en";
import { fr } from "./fr";
import { it } from "./it";
import { pl } from "./pl";
import { stretchLocale } from "./stretch";

type Flat = Record<string, string>;

function flatten(node: unknown, prefix = "", out: Flat = {}): Flat {
  if (typeof node === "string") out[prefix] = node;
  else if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      flatten(value, prefix ? `${prefix}.${key}` : key, out);
    }
  }
  return out;
}

const EN = flatten(en);
const TRANSLATIONS = { fr: flatten(fr), de: flatten(de), it: flatten(it), pl: flatten(pl) };
type Lang = keyof typeof TRANSLATIONS;
const LANGS = Object.keys(TRANSLATIONS) as Lang[];

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const EM_DASH = "—";

/** Short labels may grow to this many characters in a translation. */
const SHORT_LABEL = 24;
const budget = (english: string) => Math.max(1.6 * english.length, english.length + 10);

/** Translations over the length budget that were looked at and kept:
 *  key -> short reason. A new overlong label fails until it is shortened or
 *  listed here. */
const REVIEWED = "reviewed 2026-11-14";
const LENGTH_EXCEPTIONS: Record<Lang, Record<string, string>> = {
  fr: {
    "importAI.example2Name": REVIEWED,
    "importAI.groupNoAccount": REVIEWED,
    "add.todoDoorHint": REVIEWED,
    "add.repeatWeekly": REVIEWED,
    "priceChanges.emptyTitle": REVIEWED,
    "applock.lockGeneric": REVIEWED,
    "logos.title": REVIEWED,
    "logos.offTitle": REVIEWED,
    "storage.saveFailedTitle": REVIEWED,
    "settings.remindersOff": REVIEWED,
    "settings.loadSample": REVIEWED,
    "about.groupLegal": REVIEWED,
    "about.privacy": REVIEWED,
    "about.terms": REVIEWED,
    "data.backupHistory": REVIEWED,
    "backups.deleteAll": REVIEWED,
  },
  de: {
    "add.todoDoorHint": REVIEWED,
    "storage.saveFailedTitle": REVIEWED,
    "guide.trialTitle": REVIEWED,
  },
  it: {
    "add.infoRepeatsTitle": REVIEWED,
    "add.repeatWeekly": REVIEWED,
    "priceChanges.emptyTitle": REVIEWED,
    "logos.title": REVIEWED,
    "storage.saveFailedTitle": REVIEWED,
    "storage.rescuedTitle": REVIEWED,
    "settings.remindersOff": REVIEWED,
    "settings.readerLab": REVIEWED,
    "about.bugSubject": REVIEWED,
    "about.privacy": REVIEWED,
    "guide.lockTitle": REVIEWED,
  },
  pl: {
    "common.markPaid": REVIEWED,
    "upcoming.heroDueThisMonth": REVIEWED,
    "settings.readerLab": REVIEWED,
    "about.groupLegal": REVIEWED,
    "assistant.opMarkPaid": REVIEWED,
  },
};

/** `bank` and `currencies` are partial overlays: English leaves them empty
 *  (the core constants are its wording), so their keys have no English twin. */
const OVERLAY = /^(bank|currencies)./;

/** The English string a translated key answers to: its own key, or for a
 *  plural form English does not have (Polish _few/_many, or forms added to a
 *  key English keeps bare, like recurrence.every_day) the same base. */
function englishFor(key: string): string | undefined {
  if (key in EN) return EN[key];
  if (!PLURAL_SUFFIX.test(key)) return undefined;
  const base = key.replace(PLURAL_SUFFIX, "");
  return EN[`${base}_other`] ?? EN[`${base}_one`] ?? EN[base];
}

function placeholders(text: string, ignoreCount: boolean): string {
  const names = [...text.matchAll(/\{\{\s*(.+?)\s*\}\}/g)].map((match) => match[1]);
  return [...new Set(names)]
    .filter((name) => !(ignoreCount && name === "count"))
    .sort()
    .join(",");
}

describe.each(LANGS)("%s", (lang) => {
  const entries = Object.entries(TRANSLATIONS[lang]);

  test("keeps the English {{placeholders}}", () => {
    const wrong = entries.filter(([key, text]) => {
      const english = englishFor(key);
      // A key with no English string to answer to is a typo, overlays aside.
      if (english === undefined) return !OVERLAY.test(key);
      // "1 day" may be written without its number: a _one form may drop {{count}}.
      const one = key.endsWith("_one");
      return placeholders(text, one) !== placeholders(english, one);
    });
    expect(wrong.map(([key]) => key)).toEqual([]);
  });

  test("short labels stay within the length budget", () => {
    const tooLong = entries.filter(([key, text]) => {
      const english = englishFor(key);
      if (english === undefined || english.length > SHORT_LABEL) return false;
      return text.length > budget(english) && !(key in LENGTH_EXCEPTIONS[lang]);
    });
    expect(
      tooLong.map(([key, text]) => `${key} (${text.length}/${englishFor(key)?.length})`),
    ).toEqual([]);
  });
});

test("Polish has all four plural forms for every English plural", () => {
  const bases = Object.keys(EN)
    .filter((key) => key.endsWith("_one") && `${key.slice(0, -4)}_other` in EN)
    .map((key) => key.slice(0, -4));
  const missing = bases.flatMap((base) =>
    ["one", "few", "many", "other"]
      .map((form) => `${base}_${form}`)
      .filter((key) => !(key in TRANSLATIONS.pl)),
  );
  expect(missing).toEqual([]);
});

test("no em dash in any string", () => {
  const all = { en: EN, ...TRANSLATIONS };
  const found = Object.entries(all).flatMap(([lang, strings]) =>
    Object.entries(strings)
      .filter(([, text]) => text.includes(EM_DASH))
      .map(([key]) => `${lang}:${key}`),
  );
  expect(found).toEqual([]);
});

// The spreadsheet import finds a column, a type or a status by its label.
describe.each(Object.entries({ en, fr, de, it, pl }))("%s spreadsheet labels", (_lang, locale) => {
  const { columns, ...groups } = locale.csv;
  const duplicates = (labels: string[]) => {
    const lower = labels.map((label) => label.trim().toLowerCase());
    return lower.filter((label, index) => lower.indexOf(label) !== index);
  };

  test("every column has a header, and no two headers are the same", () => {
    expect(CSV_COLUMNS.filter((column) => !columns[column]?.trim())).toEqual([]);
    expect(duplicates(Object.values(columns))).toEqual([]);
  });

  test("the values inside each group are all different", () => {
    for (const [group, values] of Object.entries(groups)) {
      expect(Object.values(values).filter((value) => !value.trim())).toEqual([]);
      expect(duplicates(Object.values(values)), group).toEqual([]);
    }
  });
});

// A file written in one language is read with all five label sets.
test("a spreadsheet label means the same thing in every language", () => {
  const meaning = new Map<string, string>();
  const clashes: string[] = [];
  for (const locale of [en, fr, de, it, pl]) {
    for (const [group, labels] of Object.entries(locale.csv)) {
      for (const [key, label] of Object.entries(labels)) {
        const id = `${group}:${label.trim().toLowerCase()}`;
        if (meaning.has(id) && meaning.get(id) !== key) clashes.push(id);
        meaning.set(id, key);
      }
    }
  }
  expect(clashes).toEqual([]);
});

test("the debug stretched English is longer and keeps every placeholder", () => {
  const stretched = flatten(stretchLocale(en));
  expect(Object.keys(stretched)).toEqual(Object.keys(EN));
  const wrong = Object.entries(EN).filter(
    ([key, text]) =>
      text !== "" &&
      (placeholders(stretched[key], false) !== placeholders(text, false) ||
        stretched[key].length < text.length * 1.3),
  );
  expect(wrong.map(([key]) => key)).toEqual([]);
});
