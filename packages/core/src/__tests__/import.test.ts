import { describe, expect, it } from "vitest";
import {
  buildImportPrompt,
  calendarDate,
  DEFAULT_CATEGORIES,
  extractImportDocument,
  fromMajor,
  parseImportDocument,
  type Account,
  type Category,
  type ImportContext,
  type RecurringImportDraft,
  type SplitImportDraft,
} from "../index";

// ---------------------------------------------------------------------------
// Fixture: the §6.1 worked example (fictional data) as the AI would return it.
// Accounts: Monzo + Revolut exist; "Boursorama" deliberately doesn't, so its
// items exercise the unmatched-account path.
// ---------------------------------------------------------------------------

const account = (id: string, name: string, currency: Account["currency"]): Account => ({
  id,
  name,
  currency,
  type: "checking",
  color: "#123456",
  icon: "bank",
  isArchived: false,
});

const categories: Category[] = DEFAULT_CATEGORIES.map((c) => ({
  id: c.id,
  name: c.name,
  icon: c.icon,
}));

const ctx: ImportContext = {
  defaultCurrency: "EUR",
  today: calendarDate("2026-06-15"),
  accounts: [account("acc-monzo", "Monzo", "GBP"), account("acc-revolut", "Revolut", "CHF")],
  categories,
};

const WORKED_EXAMPLE = {
  items: [
    // Monzo (GBP)
    {
      type: "subscription",
      name: "Netflix",
      currency: "GBP",
      amount: 12.99,
      settlement: "automatic",
      category: "streaming",
      cadence: { unit: "month", interval: 1 },
      firstDate: "2026-07-03",
      account: "Monzo",
      domain: "netflix.com",
      color: "#E50914",
    },
    {
      type: "subscription",
      name: "PureGym",
      currency: "GBP",
      amount: 24.99,
      settlement: "manual",
      category: "health",
      cadence: { unit: "month", interval: 1 },
      firstDate: "2026-07-01",
      account: "Monzo",
    },
    {
      type: "subscription",
      name: "Account fee",
      currency: "GBP",
      amount: 6,
      settlement: "automatic",
      category: "finance",
      cadence: { unit: "month", interval: 1 },
      firstDate: "2026-07-06",
      anchor: { week: 1, weekday: 1 },
      account: "Monzo",
    },
    {
      type: "subscription",
      name: "Aviva car insurance",
      currency: "GBP",
      amount: 540,
      settlement: "manual",
      category: "insurance",
      cadence: { unit: "year", interval: 1 },
      firstDate: "2026-03-01",
      account: "Monzo",
    },
    // Boursorama (EUR) — no such account exists
    {
      type: "subscription",
      name: "Disney+",
      currency: "EUR",
      amount: 0,
      settlement: "automatic",
      category: "streaming",
      cadence: { unit: "month", interval: 1 },
      firstDate: "2026-06-14",
      priceChange: { newAmount: 8.99, on: "2026-07-14" },
      account: "Boursorama",
    },
    {
      type: "subscription",
      name: "Amazon Prime",
      currency: "EUR",
      amount: 69.9,
      settlement: "automatic",
      category: "shopping",
      cadence: { unit: "year", interval: 1 },
      firstDate: "2026-10-05",
      account: "Boursorama",
    },
    {
      type: "subscription",
      name: "iCloud+",
      currency: "EUR",
      amount: 6.99,
      settlement: "automatic",
      category: "software",
      cadence: { unit: "month", interval: 1 },
      firstDate: "2026-06-28",
      account: "Boursorama",
    },
    {
      type: "split_payment",
      name: "Sofa",
      currency: "EUR",
      total: 720,
      installments: 3,
      provider: "klarna",
      settlement: "manual",
      category: "housing",
      cadence: { unit: "month", interval: 1 },
      firstDate: "2026-06-10",
      account: "Boursorama",
    },
    // Revolut (CHF)
    {
      type: "subscription",
      name: "ChatGPT Plus",
      currency: "USD",
      amount: 20,
      settlement: "automatic",
      category: "software",
      cadence: { unit: "month", interval: 1 },
      firstDate: "2026-06-22",
      account: "Revolut",
    },
    {
      type: "split_payment",
      name: "Concert tickets",
      currency: "CHF",
      total: 180,
      installments: 4,
      provider: "paypal_pay_in_x",
      settlement: "manual",
      category: "other",
      cadence: { unit: "month", interval: 1 },
      firstDate: "2026-05-01",
      account: "Revolut",
    },
    {
      type: "subscription",
      name: "Train pass",
      currency: "CHF",
      amount: 320,
      settlement: "manual",
      category: "transport",
      cadence: { unit: "year", interval: 1 },
      firstDate: "2026-09-12",
      priceChange: { newAmount: 360, on: "2027-09-12" },
      account: "Revolut",
    },
  ],
};

const sub = (drafts: ReturnType<typeof parseImportDocument>["drafts"], name: string) =>
  drafts.find((d) => d.input.name === name) as RecurringImportDraft;
const split = (drafts: ReturnType<typeof parseImportDocument>["drafts"], name: string) =>
  drafts.find((d) => d.input.name === name) as SplitImportDraft;

describe("parseImportDocument — worked example", () => {
  const result = parseImportDocument(JSON.stringify(WORKED_EXAMPLE), ctx);

  it("reads all 11 items with nothing skipped", () => {
    expect(result.error).toBeUndefined();
    expect(result.skipped).toBe(0);
    expect(result.drafts).toHaveLength(11);
    expect(result.drafts.filter((d) => d.kind === "split")).toHaveLength(2);
  });

  it("maps a plain subscription completely", () => {
    const netflix = sub(result.drafts, "Netflix");
    expect(netflix.kind).toBe("subscription");
    expect(netflix.input.amount).toEqual(fromMajor(12.99, "GBP"));
    expect(netflix.input.recurrence).toEqual({ unit: "month", interval: 1 });
    expect(netflix.input.firstChargeDate).toBe("2026-07-03");
    expect(netflix.input.settlementMode).toBe("automatic");
    expect(netflix.input.categoryId).toBe("streaming");
    expect(netflix.input.accountId).toBe("acc-monzo");
    expect(netflix.input.domain).toBe("netflix.com");
    expect(netflix.input.color).toBe("#E50914");
    expect(netflix.warnings).toEqual([]);
  });

  it("rejects near-black, near-white and malformed brand colors", () => {
    const base = {
      type: "subscription",
      name: "X",
      currency: "EUR",
      amount: 5,
      settlement: "automatic",
      category: "other",
      cadence: { unit: "month", interval: 1 },
      firstDate: "2026-07-03",
    };
    const doc = JSON.stringify({
      version: 1,
      items: [
        { ...base, name: "Black", color: "#000000" },
        { ...base, name: "White", color: "#FFFFFF" },
        { ...base, name: "Bad", color: "red" },
        { ...base, name: "Good", color: "#1781F2" },
      ],
    });
    const parsed = parseImportDocument(doc, ctx);
    expect(sub(parsed.drafts, "Black").input.color).toBeUndefined();
    expect(sub(parsed.drafts, "White").input.color).toBeUndefined();
    expect(sub(parsed.drafts, "Bad").input.color).toBeUndefined();
    expect(sub(parsed.drafts, "Good").input.color).toBe("#1781F2");
  });

  it("keeps weekday anchors ('1st Monday' account fee)", () => {
    const fee = sub(result.drafts, "Account fee");
    expect(fee.input.recurrence.anchor).toEqual({ week: 1, weekday: 1 });
  });

  it("turns a free trial's priceChange into an introOffer", () => {
    const disney = sub(result.drafts, "Disney+");
    expect(disney.input.amount).toEqual(fromMajor(0, "EUR"));
    expect(disney.input.introOffer).toEqual({
      regularAmount: fromMajor(8.99, "EUR"),
      convertsOn: "2026-07-14",
    });
  });

  it("turns a plain future increase into an introOffer too", () => {
    const train = sub(result.drafts, "Train pass");
    expect(train.input.introOffer).toEqual({
      regularAmount: fromMajor(360, "CHF"),
      convertsOn: "2027-09-12",
    });
  });

  it("maps split payments to installment inputs", () => {
    const sofa = split(result.drafts, "Sofa");
    expect(sofa.kind).toBe("split");
    expect(sofa.input.totalAmount).toEqual(fromMajor(720, "EUR"));
    expect(sofa.input.numberOfInstallments).toBe(3);
    expect(sofa.input.provider).toBe("klarna");
    expect(sofa.input.firstInstallmentDate).toBe("2026-06-10");
    expect(sofa.input.settlementMode).toBe("manual");
    expect(split(result.drafts, "Concert tickets").input.provider).toBe("paypal_pay_in_x");
  });

  it("flags unmatched accounts and keeps the written name", () => {
    const disney = sub(result.drafts, "Disney+");
    expect(disney.input.accountId).toBeUndefined();
    expect(disney.accountName).toBe("Boursorama");
    expect(disney.warnings).toContainEqual({ code: "account-unmatched", detail: "Boursorama" });
  });

  it("flags a currency that differs from the matched account's", () => {
    const gpt = sub(result.drafts, "ChatGPT Plus");
    expect(gpt.input.accountId).toBe("acc-revolut");
    expect(gpt.input.amount).toEqual(fromMajor(20, "USD"));
    expect(gpt.warnings).toContainEqual({ code: "currency-mismatch", detail: "Revolut" });
  });
});

describe("parseImportDocument — tolerance and recovery", () => {
  it("accepts prose + fenced JSON (the realistic chat answer)", () => {
    const chatty = `Here's your Keel import:\n\n\`\`\`json\n${JSON.stringify(WORKED_EXAMPLE)}\n\`\`\`\n\nLet me know if you need anything else!`;
    expect(parseImportDocument(chatty, ctx).drafts).toHaveLength(11);
  });

  it("finds a bare JSON object buried in prose (no fences)", () => {
    const doc = { items: [WORKED_EXAMPLE.items[0]] };
    const buried = `Sure {ok} — here you go: ${JSON.stringify(doc)} Anything else?`;
    expect(parseImportDocument(buried, ctx).drafts).toHaveLength(1);
  });

  it("rejects a paste with no JSON at all as no-json", () => {
    const result = parseImportDocument("netflix 12.99 monthly\nspotify 9.99", ctx);
    expect(result).toEqual({ drafts: [], skipped: 0, error: "no-json" });
  });

  it('treats {"items":[]} as empty', () => {
    expect(parseImportDocument('{"items":[]}', ctx).error).toBe("empty");
  });

  it("skips broken items but keeps the good ones", () => {
    const doc = {
      items: [
        WORKED_EXAMPLE.items[0],
        { type: "subscription", currency: "EUR" }, // no name
        { type: "subscription", name: "No amount" },
        "not even an object",
      ],
    };
    const result = parseImportDocument(JSON.stringify(doc), ctx);
    expect(result.drafts).toHaveLength(1);
    expect(result.skipped).toBe(3);
  });

  it("infers the type when it's missing", () => {
    const doc = {
      items: [
        { name: "Inferred sub", amount: 5, firstDate: "2026-06-20" },
        { name: "Inferred split", total: 100, installments: 4, firstDate: "2026-06-20" },
      ],
    };
    const result = parseImportDocument(JSON.stringify(doc), ctx);
    expect(result.drafts.map((d) => d.kind)).toEqual(["subscription", "split"]);
  });

  it("recovers unknown currency, category, cadence, date and provider with warnings", () => {
    const doc = {
      items: [
        {
          type: "subscription",
          name: "Messy",
          currency: "HKD",
          amount: 12,
          category: "gadgets",
          firstDate: "sometime in june",
        },
        {
          type: "split_payment",
          name: "Messy split",
          total: 90,
          installments: 3,
          provider: "sofa4x",
          firstDate: "2026-06-20",
          cadence: { unit: "month", interval: 1 },
        },
      ],
    };
    const result = parseImportDocument(JSON.stringify(doc), ctx);
    const messy = sub(result.drafts, "Messy");
    expect(messy.input.amount).toEqual(fromMajor(12, "EUR")); // default currency
    expect(messy.input.categoryId).toBe("other");
    expect(messy.input.recurrence).toEqual({ unit: "month", interval: 1 });
    expect(messy.input.firstChargeDate).toBe("2026-06-15"); // today
    const codes = messy.warnings.map((w) => w.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "currency-defaulted",
        "category-unknown",
        "cadence-defaulted",
        "date-defaulted",
      ]),
    );
    const messySplit = split(result.drafts, "Messy split");
    expect(messySplit.input.provider).toBeUndefined();
    expect(messySplit.warnings).toContainEqual({ code: "provider-unknown", detail: "sofa4x" });
  });

  it("flags description-like names as uncertain and duplicates of tracked items", () => {
    const doc = {
      items: [
        { name: "a 1200HKD payment", amount: 5, firstDate: "2026-06-20" },
        { name: "Hong kong purchase", amount: 5, firstDate: "2026-06-20" },
        { name: "Mobilis Zone 11/12", amount: 5, firstDate: "2026-06-20" },
        { name: "netflix", amount: 5, firstDate: "2026-06-20" },
      ],
    };
    const { drafts } = parseImportDocument(JSON.stringify(doc), {
      ...ctx,
      takenNames: ["Netflix"],
    });
    const byName = (name: string) => drafts.find((d) => d.input.name === name);
    expect(byName("a 1200HKD payment")?.uncertainFields).toContain("name");
    expect(byName("Hong kong purchase")?.uncertainFields).toContain("name");
    expect(byName("Mobilis Zone 11/12")?.uncertainFields).not.toContain("name"); // digits alone are fine
    expect(byName("netflix")?.warnings.map((w) => w.code)).toContain("duplicate");
  });

  it("keeps the AI's assumed/uncertain declarations, filtered to known fields", () => {
    const doc = {
      items: [
        {
          name: "Mystery",
          amount: 5,
          firstDate: "2026-06-20",
          assumed: ["settlement", "firstDate", "bogus-field"],
          uncertain: ["name"],
        },
      ],
    };
    const draft = parseImportDocument(JSON.stringify(doc), ctx).drafts[0];
    expect(draft.assumedFields).toEqual(["settlement", "firstDate"]);
    expect(draft.uncertainFields).toEqual(["name"]);
  });

  it("assumes past payments were made unless backlogUnpaid says otherwise", () => {
    const doc = {
      items: [
        { name: "Paid up", amount: 5, firstDate: "2026-01-20" },
        { name: "Behind", amount: 5, firstDate: "2026-01-20", backlogUnpaid: true },
      ],
    };
    const { drafts } = parseImportDocument(JSON.stringify(doc), ctx);
    expect(drafts.find((d) => d.input.name === "Paid up")?.settlePast).toBe(true);
    expect(drafts.find((d) => d.input.name === "Behind")?.settlePast).toBe(false);
  });

  it("matches accounts case-insensitively and maps anchor week 5 to 'last'", () => {
    const doc = {
      items: [
        {
          type: "subscription",
          name: "Cased",
          amount: 3,
          currency: "GBP",
          firstDate: "2026-06-26",
          cadence: { unit: "month", interval: 1 },
          anchor: { week: 5, weekday: 5 },
          account: "monzo",
        },
      ],
    };
    const cased = sub(parseImportDocument(JSON.stringify(doc), ctx).drafts, "Cased");
    expect(cased.input.accountId).toBe("acc-monzo");
    expect(cased.input.recurrence.anchor).toEqual({ week: "last", weekday: 5 });
  });
});

describe("extractImportDocument", () => {
  it("returns null for empty or brace-less input", () => {
    expect(extractImportDocument("")).toBeNull();
    expect(extractImportDocument("just words")).toBeNull();
  });

  it("ignores balanced non-document objects while scanning", () => {
    const doc = '{"items":[]}';
    expect(extractImportDocument(`config {"a":1} then ${doc}`)).toEqual({ items: [] });
  });
});

describe("buildImportPrompt", () => {
  const prompt = buildImportPrompt({
    today: calendarDate("2026-06-15"),
    defaultCurrency: "CHF",
  });

  it("embeds today and the default currency", () => {
    expect(prompt).toContain("2026-06-15");
    expect(prompt).toContain("default currency: CHF");
  });

  it("pins the output contract and format version", () => {
    expect(prompt).toContain('{"items":[ ... ]}');
    expect(prompt).toContain("import format v1");
    expect(prompt).toContain("screenshots");
    expect(prompt).toContain("code block"); // copy-at-once answer
    expect(prompt).toContain("backlogUnpaid"); // paid-so-far default assumption
    expect(prompt).not.toContain("{{"); // no unfilled template slots
    expect(prompt).not.toContain("—"); // banned in user-visible text
  });
});
