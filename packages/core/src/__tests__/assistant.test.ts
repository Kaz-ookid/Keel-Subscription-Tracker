// The assistant contract: every model utterance resolves into typed, guarded
// operations or an explicit unresolved reason — never a guess, never a direct
// mutation. The apply transforms must behave exactly like their hand-driven
// equivalents (pause, price change, cursor move).

import { describe, expect, it } from "vitest";
import {
  appendAiActivity,
  applyAssistantOperation,
  calendarDate,
  DEFAULT_CATEGORIES,
  fromMajor,
  isDestructiveOperation,
  isValidAiActivityEntry,
  makeAccount,
  makeInstallmentPaymentItem,
  makeRecurringPaymentItem,
  now,
  parseAssistantPlan,
  buildAssistantPrompt,
  RECURRENCE_PRESETS,
  AI_ACTIVITY_CAP,
  type AiActivityEntry,
  type AssistantContext,
  type PaymentItem,
} from "../index";

const TODAY = calendarDate("2026-07-19");

let seq = 0;
const makeId = () => `id-${(seq += 1)}`;

const revolut = makeAccount(
  { name: "Revolut", type: "checking", currency: "EUR", color: "#333333", icon: "bank" },
  { id: "acc-revolut" },
);
const everyday = makeAccount(
  { name: "Everyday", type: "checking", currency: "EUR", color: "#444444", icon: "bank" },
  { id: "acc-everyday" },
);

function subscription(name: string, overrides?: Partial<PaymentItem>): PaymentItem {
  const item = makeRecurringPaymentItem(
    {
      name,
      amount: fromMajor(15.99, "EUR"),
      recurrence: RECURRENCE_PRESETS.MONTHLY,
      firstChargeDate: calendarDate("2026-07-01"),
      settlementMode: "automatic",
      accountId: revolut.id,
    },
    { id: makeId(), now: now() },
  );
  return { ...item, ...overrides };
}

function installment(name: string): PaymentItem {
  return makeInstallmentPaymentItem(
    {
      name,
      totalAmount: fromMajor(720, "EUR"),
      numberOfInstallments: 3,
      recurrence: RECURRENCE_PRESETS.MONTHLY,
      firstInstallmentDate: calendarDate("2026-07-01"),
      settlementMode: "manual",
    },
    { id: makeId(), now: now(), makeId },
  );
}

function context(items: PaymentItem[]): AssistantContext {
  return {
    items,
    accounts: [revolut, everyday],
    categories: DEFAULT_CATEGORIES.map((c) => ({ id: c.id, name: c.name, icon: c.icon })),
    defaultCurrency: "EUR",
    today: TODAY,
    takenNames: items.map((i) => i.name),
  };
}

describe("parseAssistantPlan", () => {
  it("resolves a full plan of manage operations", () => {
    const items = [
      subscription("Netflix"),
      subscription("Spotify"),
      subscription("Gym", { status: "paused" }),
    ];
    const plan = parseAssistantPlan(
      JSON.stringify({
        actions: [
          { op: "pause", item: "Netflix" },
          { op: "resume", item: "Gym" },
          { op: "set_amount", item: "Spotify", amount: 12.95, currency: "EUR" },
          { op: "set_date", item: "Netflix", date: "2026-08-12" },
          { op: "rename", item: "Spotify", name: "Spotify Duo" },
          { op: "set_account", item: "Netflix", account: "Everyday" },
        ],
        note: "Done.",
      }),
      context(items),
    );
    expect(plan.error).toBeUndefined();
    expect(plan.unresolved).toHaveLength(0);
    expect(plan.operations.map((o) => o.kind)).toEqual([
      "pause",
      "resume",
      "set_amount",
      "set_date",
      "rename",
      "set_account",
    ]);
    expect(plan.note).toBe("Done.");
  });

  it("matches names case-insensitively and by unique substring", () => {
    const items = [subscription("Netflix Premium")];
    const plan = parseAssistantPlan(
      JSON.stringify({ actions: [{ op: "pause", item: "netflix" }] }),
      context(items),
    );
    expect(plan.operations).toHaveLength(1);
  });

  it("refuses to guess between ambiguous matches", () => {
    const items = [subscription("Gym City"), subscription("Gym Home")];
    const plan = parseAssistantPlan(
      JSON.stringify({ actions: [{ op: "pause", item: "Gym" }] }),
      context(items),
    );
    expect(plan.operations).toHaveLength(0);
    expect(plan.unresolved[0].reason).toBe("item-ambiguous");
  });

  it("guards each op against the item's type and state", () => {
    const items = [
      subscription("Netflix"),
      subscription("Gym", { status: "paused" }),
      installment("Sofa"),
    ];
    const plan = parseAssistantPlan(
      JSON.stringify({
        actions: [
          { op: "pause", item: "Gym" }, // already paused
          { op: "end", item: "Sofa" }, // installments can't end early
          { op: "set_date", item: "Netflix", date: "2026-01-01" }, // past
          { op: "set_amount", item: "Netflix", amount: 9.99, currency: "PESO" },
          { op: "mark_paid", item: "Netflix" }, // automatic, not manual
          { op: "explode", item: "Netflix" },
          { op: "rename", item: "Ghost", name: "X" }, // unknown item
        ],
      }),
      context(items),
    );
    expect(plan.operations).toHaveLength(0);
    expect(plan.unresolved.map((u) => u.reason)).toEqual([
      "already-so",
      "not-supported",
      "past-date",
      "bad-value",
      "not-supported",
      "unknown-op",
      "item-not-found",
    ]);
  });

  it("allows mark_paid on a manual subscription due this month", () => {
    const items = [subscription("Rent", { settlementMode: "manual" })];
    const plan = parseAssistantPlan(
      JSON.stringify({ actions: [{ op: "mark_paid", item: "Rent" }] }),
      context(items),
    );
    expect(plan.operations.map((o) => o.kind)).toEqual(["mark_paid"]);
  });

  it("routes additions through the import pipeline", () => {
    const plan = parseAssistantPlan(
      JSON.stringify({
        actions: [],
        additions: [
          {
            type: "subscription",
            name: "Spotify",
            amount: 12.95,
            currency: "EUR",
            cadence: { unit: "month", interval: 1 },
            firstDate: "2026-07-05",
            settlement: "automatic",
            category: "music",
          },
        ],
      }),
      context([]),
    );
    expect(plan.additions).toHaveLength(1);
    expect(plan.additions[0].kind).toBe("subscription");
  });

  it("reads a fenced reply and reports unusable ones", () => {
    const fenced = parseAssistantPlan(
      '```json\n{"actions":[{"op":"pause","item":"Netflix"}]}\n```',
      context([subscription("Netflix")]),
    );
    expect(fenced.operations).toHaveLength(1);
    expect(parseAssistantPlan("sorry, no idea", context([])).error).toBe("no-json");
    expect(parseAssistantPlan('{"actions":[]}', context([])).error).toBe("empty");
  });

  it("marks delete and end as destructive", () => {
    const items = [subscription("Netflix"), subscription("Spotify")];
    const plan = parseAssistantPlan(
      JSON.stringify({
        actions: [
          { op: "delete", item: "Netflix" },
          { op: "pause", item: "Spotify" },
        ],
      }),
      context(items),
    );
    expect(plan.operations.map(isDestructiveOperation)).toEqual([true, false]);
  });
});

describe("applyAssistantOperation", () => {
  const ctx = { now: now(), today: TODAY };

  it("pauses, resumes, ends and renames like the hand-driven paths", () => {
    const item = subscription("Netflix");
    const paused = applyAssistantOperation(item, { id: "op-1", kind: "pause", item }, ctx);
    expect(paused.status).toBe("paused");
    const resumed = applyAssistantOperation(
      paused,
      { id: "op-2", kind: "resume", item: paused },
      ctx,
    );
    expect(resumed.status).toBe("active");
    const ended = applyAssistantOperation(item, { id: "op-3", kind: "end", item }, ctx);
    expect(ended.schedule.kind === "RECURRING" && ended.schedule.endDate).toBe(TODAY);
    const renamed = applyAssistantOperation(
      item,
      { id: "op-4", kind: "rename", item, name: "Netflix 4K" },
      ctx,
    );
    expect(renamed.name).toBe("Netflix 4K");
  });

  it("records a price change with today's date, once", () => {
    const item = subscription("Spotify");
    const amount = fromMajor(12.95, "EUR");
    const changed = applyAssistantOperation(
      item,
      { id: "op-1", kind: "set_amount", item, amount, previous: fromMajor(15.99, "EUR") },
      ctx,
    );
    if (changed.schedule.kind !== "RECURRING") throw new Error("expected recurring");
    expect(changed.schedule.amount).toEqual(amount);
    const last = changed.schedule.priceHistory[changed.schedule.priceHistory.length - 1];
    expect(last).toEqual({ amount, effectiveFrom: TODAY });
  });

  it("moves the next-charge cursor", () => {
    const item = subscription("Netflix");
    const moved = applyAssistantOperation(
      item,
      {
        id: "op-1",
        kind: "set_date",
        item,
        date: calendarDate("2026-08-12"),
        previous: calendarDate("2026-08-01"),
      },
      ctx,
    );
    expect(moved.schedule.kind === "RECURRING" && moved.schedule.nextChargeDate).toBe("2026-08-12");
  });

  it("reassigns the account and leaves store-level ops untouched", () => {
    const item = subscription("Netflix");
    const moved = applyAssistantOperation(
      item,
      { id: "op-1", kind: "set_account", item, account: everyday, previous: revolut },
      ctx,
    );
    expect(moved.accountId).toBe(everyday.id);
    expect(applyAssistantOperation(item, { id: "op-2", kind: "delete", item }, ctx)).toBe(item);
  });
});

describe("AI activity history", () => {
  const entry = (id: string): AiActivityEntry => ({
    id,
    at: new Date().toISOString(),
    tool: "assistant",
    summary: { added: 1, updated: 2, removed: 0 },
    itemNames: ["Netflix"],
    backupName: "keel-ai-2026-07-19T10-00-00.json",
  });

  it("validates entries structurally", () => {
    expect(isValidAiActivityEntry(entry("a"))).toBe(true);
    expect(isValidAiActivityEntry({ ...entry("a"), tool: "telepathy" })).toBe(false);
    expect(isValidAiActivityEntry({ ...entry("a"), summary: { added: -1 } })).toBe(false);
    expect(isValidAiActivityEntry({ ...entry("a"), backupName: undefined })).toBe(true);
  });

  it("prepends newest first and caps the history", () => {
    let list: AiActivityEntry[] = [];
    for (let i = 0; i < AI_ACTIVITY_CAP + 5; i++) list = appendAiActivity(list, entry(`e-${i}`));
    expect(list).toHaveLength(AI_ACTIVITY_CAP);
    expect(list[0].id).toBe(`e-${AI_ACTIVITY_CAP + 4}`);
  });
});

describe("buildAssistantPrompt", () => {
  it("grounds the model in the user's real names", () => {
    const prompt = buildAssistantPrompt({
      items: [subscription("Netflix")],
      accounts: [revolut],
      today: TODAY,
      defaultCurrency: "EUR",
    });
    expect(prompt).toContain('"Netflix"');
    expect(prompt).toContain('"Revolut"');
    expect(prompt).toContain(TODAY);
    expect(prompt).toContain('"actions"');
  });
});

describe("targeting same-named items", () => {
  it("resolves a specific item by its [number] handle", () => {
    const items = [subscription("Netflix"), subscription("Netflix")];
    const plan = parseAssistantPlan(
      JSON.stringify({ actions: [{ op: "delete", item: "2" }] }),
      context(items),
    );
    expect(plan.operations).toHaveLength(1);
    expect(plan.operations[0].item.id).toBe(items[1].id);
    // Bracketed form works too.
    const bracketed = parseAssistantPlan(
      JSON.stringify({ actions: [{ op: "delete", item: "[1]" }] }),
      context(items),
    );
    expect(bracketed.operations[0].item.id).toBe(items[0].id);
  });

  it("still refuses the shared NAME (the model must use a number to disambiguate)", () => {
    const items = [subscription("Netflix"), subscription("Netflix")];
    const plan = parseAssistantPlan(
      JSON.stringify({ actions: [{ op: "delete", item: "Netflix" }] }),
      context(items),
    );
    expect(plan.operations).toHaveLength(0);
    expect(plan.unresolved[0].reason).toBe("item-ambiguous");
  });

  it("an out-of-range handle is not found, never a wrong item", () => {
    const plan = parseAssistantPlan(
      JSON.stringify({ actions: [{ op: "pause", item: "9" }] }),
      context([subscription("Netflix")]),
    );
    expect(plan.unresolved[0].reason).toBe("item-not-found");
  });
});
