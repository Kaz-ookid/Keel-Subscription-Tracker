import { describe, expect, it } from "vitest";
import {
  buildImportPrompt,
  buildKeelReadsPrompt,
  calendarDate,
  DEFAULT_CATEGORIES,
  extractImportDocument,
  findSuggestedBrand,
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
    expect(result).toEqual({ drafts: [], skipped: 0, skippedNames: [], error: "no-json" });
  });

  it('treats {"items":[]} as empty', () => {
    expect(parseImportDocument('{"items":[]}', ctx).error).toBe("empty");
  });

  it("carries weekendShift onto the input, drops junk with a warning", () => {
    const doc = (shift: unknown) =>
      JSON.stringify({
        items: [
          {
            type: "subscription",
            name: "Rent",
            amount: 1200,
            currency: "EUR",
            cadence: { unit: "month", interval: 1 },
            firstDate: "2026-08-01",
            settlement: "automatic",
            weekendShift: shift,
          },
        ],
      });
    const good = parseImportDocument(doc("after"), ctx).drafts[0];
    if (good.kind !== "subscription") throw new Error("expected subscription");
    expect(good.input.weekendShift).toBe("after");

    const junk = parseImportDocument(doc("weekdays-only"), ctx).drafts[0];
    if (junk.kind !== "subscription") throw new Error("expected subscription");
    expect(junk.input.weekendShift).toBeUndefined();
    expect(junk.warnings.some((w) => w.code === "date-defaulted")).toBe(true);
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
    // The nameless one and the non-object are skipped; the one without an
    // amount is kept at 0 with its amount flagged (the review screen asks).
    expect(result.drafts).toHaveLength(2);
    expect(result.skipped).toBe(2);
    expect(result.drafts[1].uncertainFields).toContain("amount");
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
          currency: "IDR",
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
    expect(messy.input.firstChargeDate).toBe("2026-06-15"); // stated junk → today
    const codes = messy.warnings.map((w) => w.code);
    expect(codes).toEqual(
      expect.arrayContaining(["currency-defaulted", "category-unknown", "date-defaulted"]),
    );
    // The ABSENT fields (settlement, cadence) default quietly as assumptions,
    // not warnings — v2's omission-is-the-signal posture.
    expect(codes).not.toContain("cadence-defaulted");
    expect(messy.assumedFields).toEqual(expect.arrayContaining(["settlement", "cadence"]));
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

  it("survives hostile pastes: brace floods stay fast, item floods cap, proto keys don't pass", () => {
    // A page of "{" (a malicious clipboard) must return quickly, not hang
    // the JS thread in the balanced-brace rescue scan.
    const started = Date.now();
    expect(parseImportDocument("{".repeat(400_000), ctx).error).toBe("no-json");
    expect(Date.now() - started).toBeLessThan(3_000);
    // A very long digit-run name must not stall the suspect-name regex.
    const longName = "9".repeat(100_000);
    const t2 = Date.now();
    const flagged = parseImportDocument(
      JSON.stringify({ items: [{ name: longName, amount: 5 }] }),
      ctx,
    );
    expect(Date.now() - t2).toBeLessThan(3_000);
    expect(flagged.drafts[0].uncertainFields).toContain("name");
    // 600 items cap at 500 drafts, the overflow counted as skipped.
    const flood = { items: Array.from({ length: 600 }, (_, i) => ({ name: `x${i}`, amount: 1 })) };
    const capped = parseImportDocument(JSON.stringify(flood), ctx);
    expect(capped.drafts.length).toBe(500);
    expect(capped.skipped).toBe(100);
    // Prototype-chain keys must not satisfy the provider whitelist.
    const proto = parseImportDocument(
      JSON.stringify({
        items: [{ name: "x", total: 9, installments: 3, provider: "constructor" }],
      }),
      ctx,
    );
    expect(proto.drafts[0].kind).toBe("split");
    expect((proto.drafts[0].input as { provider?: string }).provider).toBeUndefined();
    expect(proto.drafts[0].warnings).toContainEqual({
      code: "provider-unknown",
      detail: "constructor",
    });
  });

  it("merges a v1 reply's assumed/uncertain declarations into the computed report", () => {
    const doc = {
      items: [
        {
          name: "Mystery",
          amount: 5,
          currency: "EUR",
          cadence: { unit: "month", interval: 1 },
          settlement: "automatic",
          category: "other",
          firstDate: "2026-06-20",
          assumed: ["settlement", "firstDate", "bogus-field"],
          uncertain: ["name"],
        },
      ],
    };
    const draft = parseImportDocument(JSON.stringify(doc), ctx).drafts[0];
    // Everything was stated, so the computed set is empty; the v1 self-report
    // survives, filtered to known field names, in stable field order.
    expect(draft.assumedFields).toEqual(["settlement", "firstDate"]);
    expect(draft.uncertainFields).toEqual(["name"]);
  });

  it("computes assumptions for every omitted field, and resolves billingDay in code", () => {
    const doc = {
      items: [
        { type: "subscription", name: "Sparse", amount: 9.9, billingDay: 26 },
        { type: "subscription", name: "Bare", amount: 4 },
        { type: "subscription", name: "Clamped", amount: 4, billingDay: 31 },
      ],
    };
    const result = parseImportDocument(JSON.stringify(doc), ctx);
    const sparse = sub(result.drafts, "Sparse");
    // billingDay counts as extracted: the 26th of the current month, and
    // firstDate is NOT among the assumptions.
    expect(sparse.input.firstChargeDate).toBe("2026-06-26");
    expect(sparse.assumedFields).toEqual(["currency", "settlement", "category", "cadence"]);
    expect(sparse.warnings).toEqual([]);
    const bare = sub(result.drafts, "Bare");
    expect(bare.input.firstChargeDate).toBe("2026-06-01"); // 1st of the month
    expect(bare.assumedFields).toContain("firstDate");
    // A day the current month doesn't have clamps to its last day.
    expect(sub(result.drafts, "Clamped").input.firstChargeDate).toBe("2026-06-30");
  });

  it("defaults an omitted cadence to the brand's usual cycle when the bank knows it", () => {
    const doc = {
      items: [{ type: "subscription", name: "Amazon Prime", amount: 89, billingDay: 22 }],
    };
    const draft = sub(parseImportDocument(JSON.stringify(doc), ctx).drafts, "Amazon Prime");
    expect(draft.input.recurrence).toEqual({ unit: "year", interval: 1 }); // Prime bills yearly
    expect(draft.assumedFields).toContain("cadence");
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

  it("embeds today (for reading stated dates) but no default currency", () => {
    expect(prompt).toContain("2026-06-15");
    // v2: defaulting is the parser's job — the prompt never teaches it.
    expect(prompt).not.toContain("default currency");
  });

  it("pins the output contract and format version", () => {
    expect(prompt).toContain('{"items":[ ... ]}');
    expect(prompt).toContain("import format v2");
    expect(prompt).toContain("screenshots");
    expect(prompt).toContain("code block"); // copy-at-once answer
    expect(prompt).toContain("backlogUnpaid"); // paid-so-far stays code-side default
    expect(prompt).toContain("billingDay"); // bare days extracted, not resolved
    expect(prompt).not.toContain("{{"); // no unfilled template slots
    expect(prompt).not.toContain("—"); // banned in user-visible text
  });

  it("asks for extraction only: no self-reporting, no brand colors", () => {
    expect(prompt).not.toContain('"assumed"');
    // v2.1: identity may be inferred when declared, money never (2026-10-11)
    expect(prompt).toContain('list "name" in "uncertain"');
    expect(prompt).toContain("Never infer amounts, dates or currencies");
    expect(prompt).not.toContain('"color"');
  });

  it("teaches the gather-then-emit conversation and bank-statement judgment", () => {
    expect(prompt).toContain("Do NOT reply with the JSON right away");
    expect(prompt).toContain("statement"); // bank/card summaries are expected input
    expect(prompt).toContain("One-time spending does not belong");
  });
});

// ---------------------------------------------------------------------------
// Brand-bank backfill + the on-device prompt (added 2026-07-20): the small
// on-device model omits logos/colours and over-flags names; the parser and a
// tuned prompt make up the difference.
// ---------------------------------------------------------------------------

const oneDraft = (item: Record<string, unknown>) =>
  parseImportDocument(JSON.stringify({ items: [item] }), ctx).drafts[0] as RecurringImportDraft;

describe("brand-bank backfill", () => {
  it("fills the logo domain, colour and category the model omitted", () => {
    const draft = oneDraft({
      name: "Amazon Prime",
      amount: 19,
      currency: "EUR",
      cadence: { unit: "month", interval: 1 },
      firstDate: "2026-03-22",
      category: "other",
    });
    expect(draft.input.domain).toBe("amazon.com");
    expect(draft.input.color).toBe("#FF9900");
    expect(draft.input.categoryId).toBe("streaming");
  });

  it("never overrides a value the model DID provide", () => {
    const draft = oneDraft({
      name: "Netflix",
      amount: 12.99,
      currency: "EUR",
      cadence: { unit: "month", interval: 1 },
      firstDate: "2026-07-03",
      domain: "custom.example",
      color: "#123456",
      category: "music",
    });
    expect(draft.input.domain).toBe("custom.example");
    expect(draft.input.color).toBe("#123456");
    expect(draft.input.categoryId).toBe("music");
  });

  it("drops a spurious name flag on a known brand, keeps it on a placeholder", () => {
    const known = oneDraft({
      name: "Amazon Prime",
      amount: 19,
      currency: "EUR",
      cadence: { unit: "month", interval: 1 },
      firstDate: "2026-03-22",
      uncertain: ["name"],
    });
    expect(known.uncertainFields).not.toContain("name");

    const placeholder = oneDraft({
      name: "a 1200 HKD payment",
      amount: 140,
      currency: "EUR",
      cadence: { unit: "month", interval: 1 },
      firstDate: "2026-03-22",
    });
    expect(placeholder.uncertainFields).toContain("name");
  });

  it("matches by exact name or alias, and knows the new Swiss brands", () => {
    expect(findSuggestedBrand("amazon prime")?.id).toBe("amazon-prime");
    expect(findSuggestedBrand("Prime")?.id).toBe("amazon-prime");
    expect(findSuggestedBrand("SERAFE")?.domain).toBe("serafe.ch");
    expect(findSuggestedBrand("Helsana")?.domain).toBe("helsana.ch");
    expect(findSuggestedBrand("nothing here")).toBeUndefined();
  });
});

describe("folding a price change the model split into two rows", () => {
  const netflixRow = (amount: number, firstDate: string) => ({
    type: "subscription",
    name: "Netflix",
    amount,
    currency: "EUR",
    cadence: { unit: "month", interval: 1 },
    firstDate,
    settlement: "automatic",
    account: "Boursorama",
  });

  it("merges two same-name rows with different prices into one priceChange", () => {
    const result = parseImportDocument(
      JSON.stringify({ items: [netflixRow(20, "2025-05-25"), netflixRow(24, "2026-01-25")] }),
      ctx,
    );
    expect(result.drafts).toHaveLength(1);
    const netflix = result.drafts[0] as RecurringImportDraft;
    expect(netflix.input.amount).toEqual(fromMajor(20, "EUR"));
    expect(netflix.input.firstChargeDate).toBe("2025-05-25");
    expect(netflix.input.introOffer).toEqual({
      regularAmount: fromMajor(24, "EUR"),
      convertsOn: "2026-01-25",
    });
  });

  it("orders by date regardless of the order the model emitted them", () => {
    const result = parseImportDocument(
      JSON.stringify({ items: [netflixRow(24, "2026-01-25"), netflixRow(20, "2025-05-25")] }),
      ctx,
    );
    expect(result.drafts).toHaveLength(1);
    const netflix = result.drafts[0] as RecurringImportDraft;
    expect(netflix.input.amount).toEqual(fromMajor(20, "EUR"));
    expect(netflix.input.introOffer?.regularAmount).toEqual(fromMajor(24, "EUR"));
  });

  it("leaves genuinely different or identical rows alone", () => {
    // Different names: two items.
    const diff = parseImportDocument(
      JSON.stringify({
        items: [netflixRow(20, "2025-05-25"), { ...netflixRow(24, "2026-01-25"), name: "Spotify" }],
      }),
      ctx,
    );
    expect(diff.drafts).toHaveLength(2);
    // Same amount = a plain duplicate, not a change: not merged.
    const dup = parseImportDocument(
      JSON.stringify({ items: [netflixRow(20, "2025-05-25"), netflixRow(20, "2026-01-25")] }),
      ctx,
    );
    expect(dup.drafts).toHaveLength(2);
  });
});

describe("buildKeelReadsPrompt", () => {
  const prompt = buildKeelReadsPrompt({
    today: calendarDate("2026-10-11"),
    defaultCurrency: "EUR",
  });

  it("teaches the currency symbols, dollars included", () => {
    expect(prompt).toContain("a plain $ means USD");
    expect(prompt).toContain("A receipt, invoice or statement always shows its currency");
    expect(
      buildImportPrompt({ today: calendarDate("2026-10-11"), defaultCurrency: "EUR" }),
    ).toContain("a plain $ means USD");
  });

  it("teaches documents: policies, OCR layout, the blanked-out marker", () => {
    expect(prompt).toContain("insurance policies, contracts, invoices");
    expect(prompt).toContain('"[removed]" marks a personal detail');
    expect(prompt).toContain("READING A DOCUMENT");
    expect(prompt).toContain("Prime annuelle");
    expect(prompt).toContain('"QR-facture" mean "manual"');
  });

  it("keeps an item whose amount the model dropped, flagged for the user to type", () => {
    const answer = {
      items: [
        {
          type: "subscription",
          name: "Assurly Home Assurance ménage",
          currency: "CHF",
          settlement: "manual",
          category: "insurance",
          cadence: { unit: "year", interval: 1 },
          firstDate: "2026-10-01",
        },
      ],
    };
    const result = parseImportDocument(JSON.stringify(answer), { ...ctx, defaultCurrency: "CHF" });
    expect(result.drafts).toHaveLength(1);
    const policy = result.drafts[0] as RecurringImportDraft;
    expect(policy.input.amount).toEqual(fromMajor(0, "CHF"));
    expect(policy.uncertainFields).toContain("amount");
    expect(policy.input.recurrence).toEqual({ unit: "year", interval: 1 });
  });

  it("reads what the model left out off the item's own typed line", () => {
    const material =
      "spotify duo 17,6 CHF 13th of the month (account BCV, CHF)\nCSS assurance 372.95 CHF, manual, set it for 26th of the month, started in march 2026 (account BCV, CHF)\n- 6th of the month, 689,55€ car loan reimbursement (account Boursorama, EUR)";
    const answer = {
      items: [
        { type: "subscription", name: "spotify duo", amount: 17.6, account: "BCV" },
        { type: "subscription", name: "CSS assurance", amount: 372.95, account: "BCV" },
        { type: "subscription", name: "car loan reimbursement", account: "Boursorama" },
      ],
    };
    const result = parseImportDocument(JSON.stringify(answer), {
      ...ctx,
      defaultCurrency: "USD",
      today: calendarDate("2026-10-12"),
      material,
    });
    expect(result.drafts).toHaveLength(3);
    const [claude, css, loan] = result.drafts as RecurringImportDraft[];
    expect(claude.input.amount).toEqual(fromMajor(17.6, "CHF"));
    expect(claude.input.firstChargeDate).toBe("2026-10-13");
    expect(claude.assumedFields).not.toContain("currency");
    expect(claude.assumedFields).not.toContain("firstDate");
    expect(css.input.settlementMode).toBe("manual");
    expect(css.input.firstChargeDate).toBe("2026-03-26");
    expect(css.assumedFields).not.toContain("settlement");
    expect(loan.input.amount).toEqual(fromMajor(689.55, "EUR"));
    expect(loan.uncertainFields).not.toContain("amount");
  });

  it("does not call a name inferred when it sits word for word in the material", () => {
    const answer = {
      items: [
        { type: "subscription", name: "spotify duo", amount: 17, uncertain: ["name"] },
        { type: "subscription", name: "Acme Cloud Max plan", amount: 108.1, uncertain: ["name"] },
      ],
    };
    const result = parseImportDocument(JSON.stringify(answer), {
      ...ctx,
      material: "spotify duo 17 CHF manual\nReceipt from Acme Cloud, Inc. $108.10",
    });
    expect(result.drafts[0]?.uncertainFields).not.toContain("name");
    expect(result.drafts[1]?.uncertainFields).toContain("name");
  });

  it("believes an unpaid-backlog flag only when the material speaks of it", () => {
    const answer = {
      items: [{ type: "subscription", name: "Internet Home XL", amount: 25, backlogUnpaid: true }],
    };
    const invoice = "Facture 9297585\nInternet Home XL\nTotal CHF 25.00";
    const invented = parseImportDocument(JSON.stringify(answer), { ...ctx, material: invoice });
    expect(invented.drafts[0]?.settlePast).toBe(true);
    const behind = parseImportDocument(JSON.stringify(answer), {
      ...ctx,
      material: "Internet Home XL 25 CHF, I'm behind, last two unpaid",
    });
    expect(behind.drafts[0]?.settlePast).toBe(false);
    const enRetard = parseImportDocument(JSON.stringify(answer), {
      ...ctx,
      material: "Internet Home XL 25 CHF, deux factures impayées",
    });
    expect(enRetard.drafts[0]?.settlePast).toBe(false);
    // A pasted answer has no material: the flag stands as the user's own AI wrote it.
    expect(parseImportDocument(JSON.stringify(answer), ctx).drafts[0]?.settlePast).toBe(false);
  });

  it("names what it could not read", () => {
    const answer = {
      items: [
        { type: "subscription", name: "Netflix", amount: 12.99 },
        { type: "split_payment", name: "Sofa", total: 720 },
        { type: "subscription", amount: 5 },
      ],
    };
    const result = parseImportDocument(JSON.stringify(answer), ctx);
    expect(result.drafts).toHaveLength(1);
    expect(result.skipped).toBe(2);
    expect(result.skippedNames).toEqual(["Sofa"]);
  });

  it("takes a document's premium line when the model dropped the amount, flagged", () => {
    const material =
      "Home Assurance ménage - Police d'assurance HOME7310288\nFréquence de paiement    annuel\nAperçu des primes\nPrime annuelle    CHF 164.15\nTaxes légales    CHF 7.80\nPayable annuel";
    const answer = {
      items: [
        {
          type: "subscription",
          name: "Home Assurance ménage - Police d'assurance HOME7310288",
          currency: "CHF",
          settlement: "manual",
          cadence: { unit: "year", interval: 1 },
        },
      ],
    };
    const result = parseImportDocument(JSON.stringify(answer), {
      ...ctx,
      defaultCurrency: "CHF",
      material,
    });
    const policy = result.drafts[0] as RecurringImportDraft;
    expect(policy.input.amount).toEqual(fromMajor(164.15, "CHF"));
    expect(policy.uncertainFields).toContain("amount");
  });

  it("lands an insurance policy's answer as a yearly, manual insurance item", () => {
    // What the model should say for a Swiss home-insurance policy: yearly
    // premium, billed by invoice, contract 01.10.2026 to 30.09.2027.
    const answer = {
      items: [
        {
          type: "subscription",
          name: "Simpego assurance ménage",
          amount: 164.15,
          currency: "CHF",
          settlement: "manual",
          category: "insurance",
          cadence: { unit: "year", interval: 1 },
          firstDate: "2026-10-01",
          endDate: "2027-09-30",
          domain: "simpego.ch",
        },
      ],
    };
    const result = parseImportDocument(JSON.stringify(answer), {
      ...ctx,
      defaultCurrency: "CHF",
      today: calendarDate("2026-10-12"),
    });
    expect(result.error).toBeUndefined();
    expect(result.drafts).toHaveLength(1);
    const policy = result.drafts[0] as RecurringImportDraft;
    expect(policy.input.amount).toEqual(fromMajor(164.15, "CHF"));
    expect(policy.input.recurrence).toEqual({ unit: "year", interval: 1 });
    expect(policy.input.firstChargeDate).toBe("2026-10-01");
    expect(policy.input.endDate).toBe("2027-09-30");
    expect(policy.input.settlementMode).toBe("manual");
  });

  it("states the lessons from real reads: split dates, copied names, loans, foreign currencies", () => {
    expect(prompt).toContain("never the 1st");
    expect(prompt).toContain("is NOT uncertain");
    expect(prompt).toContain("loan or credit repayment included");
    expect(prompt).toContain("HK$ means HKD");
    expect(prompt).toContain("use the listed equivalent");
    expect(prompt).toContain("final TOTAL including taxes");
    expect(prompt).toContain("is never a note");
    expect(prompt).toContain("the heading itself is not an item");
  });

  it("is one-shot: no conversation protocol, same rules", () => {
    expect(prompt).not.toContain("Do NOT reply with the JSON right away");
    expect(prompt).not.toContain("code block");
    expect(prompt).toContain("do not ask questions");
    expect(prompt).toContain("backlogUnpaid");
    expect(prompt).toContain("billingDay");
    expect(prompt).toContain("One-time spending does not belong");
    expect(prompt).not.toContain("—");
  });
});
