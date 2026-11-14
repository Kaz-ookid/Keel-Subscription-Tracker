import { describe, expect, it } from "vitest";
import {
  calendarDate,
  csvToImportDocument,
  CSV_COLUMNS,
  DEFAULT_CATEGORIES,
  fromMajor,
  itemsToCsv,
  makeAccount,
  makeInstallmentPaymentItem,
  makeRecurringPaymentItem,
  now,
  parseImportDocument,
  planCancellation,
  RECURRENCE_PRESETS,
} from "../index";
import type { CsvColumn, CsvLabels, PaymentItem } from "../index";

const asOf = calendarDate("2026-01-01");

/** English labels spelled like the column ids; "fr" proves any set reads. */
const labels = (prefix: string): CsvLabels => ({
  columns: Object.fromEntries(CSV_COLUMNS.map((c) => [c, prefix + c])) as Record<CsvColumn, string>,
  type: { subscription: prefix + "Subscription", split: prefix + "Split payment" },
  payment: { automatic: prefix + "Automatic", manual: prefix + "Manual" },
  status: {
    active: prefix + "Active",
    paused: prefix + "Paused",
    ended: prefix + "Ended",
    toCancel: prefix + "To cancel",
  },
  unit: {
    day: prefix + "day",
    week: prefix + "week",
    month: prefix + "month",
    year: prefix + "year",
  },
  weekend: { before: prefix + "Friday before", after: prefix + "Monday after" },
});
const en = labels("");
const fr = labels("fr ");

const account = makeAccount(
  { name: "Main; account", type: "checking", currency: "CHF", color: "#000", icon: "x" },
  { id: "acc1" },
);
const category = DEFAULT_CATEGORIES[0];

const netflix = makeRecurringPaymentItem(
  {
    name: 'Netflix "4K"',
    amount: fromMajor(17.9, "CHF"),
    recurrence: RECURRENCE_PRESETS.MONTHLY,
    firstChargeDate: calendarDate("2026-01-15"),
    settlementMode: "automatic",
    accountId: account.id,
    categoryId: category.id,
    notes: "- shared, cancel in March",
    reminder: { daysBefore: 2 },
  },
  { id: "n", now: now() },
);
const fee = makeRecurringPaymentItem(
  {
    name: "Account fee",
    amount: fromMajor(2, "EUR"),
    recurrence: { unit: "month", interval: 1, anchor: { week: 1, weekday: 4 } },
    firstChargeDate: calendarDate("2026-01-01"),
    settlementMode: "automatic",
    weekendShift: "after",
  },
  { id: "f", now: now() },
);
const trial = makeRecurringPaymentItem(
  {
    name: "Cloud",
    amount: fromMajor(0, "EUR"),
    recurrence: RECURRENCE_PRESETS.YEARLY,
    firstChargeDate: calendarDate("2026-02-01"),
    settlementMode: "manual",
    introOffer: { regularAmount: fromMajor(99, "EUR"), convertsOn: calendarDate("2026-02-01") },
  },
  { id: "t", now: now() },
);
const sofa = makeInstallmentPaymentItem(
  {
    name: "Sofa",
    totalAmount: fromMajor(900, "EUR"),
    numberOfInstallments: 3,
    recurrence: RECURRENCE_PRESETS.MONTHLY,
    firstInstallmentDate: calendarDate("2026-01-10"),
    settlementMode: "manual",
    provider: "klarna",
  },
  { id: "s", now: now(), makeId: () => "i" },
);
const items: PaymentItem[] = [
  planCancellation(netflix, { now: now(), today: asOf }),
  fee,
  trial,
  sofa,
];

const write = (decimalComma: boolean, set = en) =>
  itemsToCsv(items, {
    asOf,
    labels: set,
    decimalComma,
    accounts: [account],
    categoryName: (id) => (id === category.id ? "Streaming" : undefined),
  });
const read = (csv: string) =>
  csvToImportDocument(csv, {
    labelSets: [en, fr],
    categoryId: (name) => (name === "Streaming" ? category.id : undefined),
  });

describe("itemsToCsv", () => {
  it("writes a BOM, a header row and one row per item, next payment first", () => {
    const csv = write(false);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines).toHaveLength(5);
    expect(lines[0].split(",").slice(0, 4)).toEqual(["name", "type", "amount", "currency"]);
    expect(lines.slice(1).map((l) => l.split(",")[1])).toEqual([
      "Subscription", // fee, due 2026-01-01
      "Split payment", // sofa, 2026-01-10
      "Subscription", // netflix, 2026-01-15
      "Subscription", // cloud, 2026-02-01
    ]);
  });

  it("uses semicolons and decimal commas where Excel expects them", () => {
    const csv = write(true);
    expect(csv).toContain(";17,90;CHF;");
    expect(csv).toContain('"Main; account"');
  });

  it("quotes quotes and writes a formula-looking cell as text", () => {
    const csv = write(false);
    expect(csv).toContain('"Netflix ""4K"""');
    expect(csv).toContain("'- shared");
    expect(csv).toContain("To cancel");
    expect(csv).toContain("2026-01-14"); // cancel by: the day before the next charge
  });
});

describe("csvToImportDocument", () => {
  it.each([
    ["point decimals", false, en],
    ["comma decimals", true, en],
    ["another language", true, fr],
  ])("reads its own export back (%s)", (_label, decimalComma, set) => {
    const doc = read(write(decimalComma, set));
    expect(doc?.items).toHaveLength(4);
    const byName = Object.fromEntries((doc?.items ?? []).map((i) => [i.name, i]));
    expect(byName['Netflix "4K"']).toMatchObject({
      type: "subscription",
      amount: 17.9,
      currency: "CHF",
      settlement: "automatic",
      category: category.id,
      cadence: { unit: "month", interval: 1 },
      firstDate: "2026-01-15",
      account: "Main; account",
      notes: "- shared, cancel in March",
      reminderDaysBefore: 2,
    });
    expect(byName["Account fee"]).toMatchObject({
      anchor: { week: 1, weekday: 4 },
      weekendShift: "after",
    });
    expect(byName["Cloud"]).toMatchObject({
      amount: 0,
      priceChange: { newAmount: 99, on: "2026-02-01" },
    });
    expect(byName["Sofa"]).toMatchObject({
      type: "split_payment",
      total: 900,
      installments: 3,
      provider: "klarna",
    });
  });

  it("feeds the import parser, which turns every row into a draft", () => {
    const doc = read(write(true));
    const result = parseImportDocument(JSON.stringify(doc), {
      defaultCurrency: "CHF",
      today: asOf,
      accounts: [account],
      categories: DEFAULT_CATEGORIES,
    });
    expect(result.error).toBeUndefined();
    expect(result.drafts).toHaveLength(4);
    expect(result.skipped).toBe(0);
  });

  it("accepts dates a spreadsheet rewrote, and refuses a file that is not Keel's", () => {
    const rewritten = write(false).replace("2026-01-15", "15.01.2026");
    const netflixBack = read(rewritten)?.items.find((i) => i.name.startsWith("Netflix"));
    expect(netflixBack?.firstDate).toBe("2026-01-15");
    expect(read("date,merchant,amount\n2026-01-01,Netflix,17.90\n")).toBeNull();
    expect(read('{"items": []}')).toBeNull();
  });
});
