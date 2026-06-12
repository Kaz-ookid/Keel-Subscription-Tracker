// The app-wide store: payment items, the payment-event ledger, categories and
// accounts. Hydrates from the device on mount and re-persists on change. All
// domain logic (building an item, recording/accruing payments) is delegated to
// @keel/core — this layer only wires storage + React + id/clock to that logic.
//
// The ledger is the basis for future analytics: manual payments are logged when
// the user ticks them off; automatic payments are caught up (logged for every
// due date that has arrived) on load and on creation.

import { randomUUID } from "expo-crypto";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  accrueDueOccurrences,
  canMarkPaid,
  DEFAULT_CATEGORIES,
  isPaymentItemComplete,
  makeAccount,
  makeInstallmentPaymentItem,
  makeRecurringPaymentItem,
  markNextInstallmentPaid,
  now,
  pausePaymentItem,
  recordRecurringPayment,
  resumePaymentItem,
  rewindRecurringPayment,
  skipRecurringPayment,
  today,
  unmarkLastInstallmentPaid,
  updateInstallmentPaymentItem,
  updateRecurringPaymentItem,
  DEFAULT_CURRENCY,
  type Account,
  type CalendarDate,
  type Category,
  type CurrencyCode,
  type ExchangeRates,
  type NewAccountInput,
  type NewInstallmentInput,
  type NewRecurringInput,
  type PaymentItem,
  type PaymentOccurrence,
} from "@keel/core";

import { fetchRates, loadCachedRates } from "../lib/exchange-rates";
import { syncReminders } from "../lib/notifications";
import { buildSampleData } from "../lib/sample-data";
import { loadState, saveState } from "../lib/storage";

// Built-in seed categories presented as full Category records.
const BUILTIN_CATEGORIES: Category[] = DEFAULT_CATEGORIES.map((c) => ({
  id: c.id,
  name: c.name,
  icon: c.icon,
}));

interface AppStateValue {
  items: PaymentItem[];
  /** Append-only ledger of actual payment events (for the future analytics tab). */
  occurrences: PaymentOccurrence[];
  /** Built-in + user-created categories, for pickers. */
  categories: Category[];
  /** Active (non-archived) bank accounts, for assignment + the Accounts tab. */
  accounts: Account[];
  /** Big numbers merge into this currency everywhere. */
  displayCurrency: CurrencyCode;
  setDisplayCurrency: (currency: CurrencyCode) => void;
  /** ECB daily reference rates (cached; null until first successful fetch). */
  rates: ExchangeRates | null;
  loading: boolean;
  addSubscription: (input: NewRecurringInput) => void;
  /** Create a BNPL "Pay in X" installment plan. */
  addInstallmentPlan: (input: NewInstallmentInput) => void;
  /** Edit an existing recurring subscription. */
  updateSubscription: (id: string, input: NewRecurringInput) => void;
  /** Edit an existing installment plan. */
  updateInstallmentPlan: (id: string, input: NewInstallmentInput) => void;
  removeSubscription: (id: string) => void;
  /** Manual tick-off: log the running payment and advance the next due date. */
  markPaid: (id: string) => void;
  /** Deliberately sit out the running cycle: advances the date, logged as
   *  skipped, never counted as spending. */
  skipPayment: (id: string) => void;
  /** Undo the most recent manual tick-off or skip: removes the ledger entry
   *  and steps the billing date back one cycle. */
  undoPaid: (id: string) => void;
  /** Mark the next due installment of a BNPL plan as paid (current cycle only). */
  markInstallmentPaid: (id: string) => void;
  /** Undo the most recent installment payment. */
  undoInstallmentPaid: (id: string) => void;
  /** Pause an active item: kept, but not forecast/accrued/counted. */
  pauseSubscription: (id: string) => void;
  /** Resume a paused item; a recurring cursor skips the gap without charging it. */
  resumeSubscription: (id: string) => void;
  /** Create a custom category; returns it so the caller can select it. */
  addCategory: (name: string, icon: string) => Category;
  /** Create an account; returns it so the caller can select it. */
  addAccount: (input: NewAccountInput) => Account;
  /** Edit an existing account. */
  updateAccount: (id: string, input: NewAccountInput) => void;
  /** Soft delete — keeps history pointing at it, hides it everywhere. */
  archiveAccount: (id: string) => void;
  /** Debug/testing: wipe every item, ledger entry, category and account. */
  clearAllData: () => void;
  /** Debug/testing: replace everything with a realistic seeded household. */
  loadSampleData: () => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

/** Catch an automatic item up to today, logging any charges that have come due. */
function catchUp(item: PaymentItem): { item: PaymentItem; occurrences: PaymentOccurrence[] } {
  if (item.status !== "active" || item.settlementMode !== "automatic") {
    return { item, occurrences: [] };
  }
  return accrueDueOccurrences(item, today(), { now: now(), makeId: randomUUID });
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<PaymentItem[]>([]);
  const [occurrences, setOccurrences] = useState<PaymentOccurrence[]>([]);
  const [customCategories, setCustomCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>(DEFAULT_CURRENCY);
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadState().then((state) => {
      const accrued: PaymentOccurrence[] = [];
      const caughtUp = state.items.map((item) => {
        const result = catchUp(item);
        accrued.push(...result.occurrences);
        return result.item;
      });
      setItems(caughtUp);
      // Prune ledger entries whose item is gone (deleted before cascade
      // deletion existed) — they'd render as nameless "(removed)" rows.
      const knownIds = new Set(caughtUp.map((i) => i.id));
      const kept = state.occurrences.filter((o) => knownIds.has(o.paymentItemId));
      setOccurrences([...kept, ...accrued]);
      setCustomCategories(state.categories);
      setAccounts(state.accounts);
      setDisplayCurrency(state.displayCurrency);
      setLoading(false);
    });
    // Rates: last cached ones first (works offline), then today's, quietly.
    void loadCachedRates().then((cached) => {
      if (cached) setRates((current) => current ?? cached);
    });
    void fetchRates().then((fresh) => {
      if (fresh) setRates(fresh);
    });
  }, []);

  // Reschedule every reminder from current state after any change — a paid,
  // paused or edited commitment can never fire a stale notification.
  useEffect(() => {
    if (!loading) void syncReminders(items);
  }, [items, loading]);

  // Persist after the initial hydration completes.
  useEffect(() => {
    if (!loading)
      void saveState({
        items,
        occurrences,
        categories: customCategories,
        accounts,
        displayCurrency,
      });
  }, [items, occurrences, customCategories, accounts, displayCurrency, loading]);

  // One memoised value object: consumers only re-render when state actually
  // changes. Handlers live inside the memo so their closures (over `items`,
  // `occurrences`) are rebuilt whenever those change — never stale.
  const value = useMemo<AppStateValue>(() => {
    const addSubscription = (input: NewRecurringInput) => {
      const created = makeRecurringPaymentItem(input, { id: randomUUID(), now: now() });
      const { item, occurrences: accrued } = catchUp(created);
      setItems((prev) => [item, ...prev]);
      if (accrued.length > 0) setOccurrences((prev) => [...prev, ...accrued]);
    };

    const addInstallmentPlan = (input: NewInstallmentInput) => {
      const item = makeInstallmentPaymentItem(input, {
        id: randomUUID(),
        now: now(),
        makeId: randomUUID,
      });
      setItems((prev) => [item, ...prev]);
    };

    const updateSubscription = (id: string, input: NewRecurringInput) => {
      // The latest recorded charge anchors the recomputed next-charge cursor so it
      // never regresses behind a charge that already happened.
      const lastChargedDate = occurrences.reduce<CalendarDate | undefined>(
        (max, o) => (o.paymentItemId === id && (!max || o.dueDate > max) ? o.dueDate : max),
        undefined,
      );
      setItems((prev) =>
        prev.map((i) =>
          i.id === id ? updateRecurringPaymentItem(i, input, { now: now(), lastChargedDate }) : i,
        ),
      );
    };

    const updateInstallmentPlan = (id: string, input: NewInstallmentInput) => {
      setItems((prev) =>
        prev.map((i) =>
          i.id === id
            ? updateInstallmentPaymentItem(i, input, { now: now(), makeId: randomUUID })
            : i,
        ),
      );
    };

    const removeSubscription = (id: string) => {
      setItems((prev) => prev.filter((i) => i.id !== id));
      // Deleting an item takes its ledger with it — orphaned occurrences would
      // surface as nameless "(removed)" rows in analytics. (Keeping history is
      // what archive/end/pause are for; delete means "as if it never existed".)
      setOccurrences((prev) => prev.filter((o) => o.paymentItemId !== id));
    };

    const markPaid = (id: string) => {
      const item = items.find((i) => i.id === id);
      // One shared rule for both payment types: current month only.
      if (!item || item.schedule.kind !== "RECURRING" || !canMarkPaid(item, today())) return;
      const { item: advanced, occurrence } = recordRecurringPayment(item, {
        id: randomUUID(),
        paidDate: today(),
        now: now(),
      });
      setItems((prev) => prev.map((i) => (i.id === id ? advanced : i)));
      setOccurrences((prev) => [...prev, occurrence]);
    };

    const skipPayment = (id: string) => {
      const item = items.find((i) => i.id === id);
      if (!item || item.schedule.kind !== "RECURRING" || item.status !== "active") return;
      if (isPaymentItemComplete(item, today())) return;
      const { item: advanced, occurrence } = skipRecurringPayment(item, {
        id: randomUUID(),
        now: now(),
      });
      setItems((prev) => prev.map((i) => (i.id === id ? advanced : i)));
      setOccurrences((prev) => [...prev, occurrence]);
    };

    const markInstallmentPaid = (id: string) => {
      setItems((prev) =>
        prev.map((i) =>
          // One shared rule for both payment types: current month only.
          i.id === id && canMarkPaid(i, today())
            ? markNextInstallmentPaid(i, { paidDate: today(), now: now() })
            : i,
        ),
      );
    };

    const undoPaid = (id: string) => {
      const item = items.find((i) => i.id === id);
      if (!item || item.schedule.kind !== "RECURRING" || item.settlementMode !== "manual") return;
      // The most recent hand-recorded event (paid or skipped) for this item.
      const last = occurrences.reduce<PaymentOccurrence | undefined>(
        (latest, o) =>
          o.paymentItemId === id &&
          (o.status === "charged" || o.status === "skipped") &&
          (!latest || o.dueDate > latest.dueDate)
            ? o
            : latest,
        undefined,
      );
      if (!last) return;
      // Remove the ledger entry AND step the cursor back in one motion —
      // otherwise that month would double-count.
      setOccurrences((prev) => prev.filter((o) => o.id !== last.id));
      setItems((prev) =>
        prev.map((i) =>
          i.id === id ? rewindRecurringPayment(i, { toDueDate: last.dueDate, now: now() }) : i,
        ),
      );
    };

    const undoInstallmentPaid = (id: string) => {
      setItems((prev) =>
        prev.map((i) => (i.id === id ? unmarkLastInstallmentPaid(i, { now: now() }) : i)),
      );
    };

    const pauseSubscription = (id: string) => {
      setItems((prev) => prev.map((i) => (i.id === id ? pausePaymentItem(i, { now: now() }) : i)));
    };

    const resumeSubscription = (id: string) => {
      setItems((prev) =>
        prev.map((i) => (i.id === id ? resumePaymentItem(i, { now: now(), asOf: today() }) : i)),
      );
    };

    const addCategory = (name: string, icon: string): Category => {
      const category: Category = { id: randomUUID(), name: name.trim(), icon };
      setCustomCategories((prev) => [...prev, category]);
      return category;
    };

    const addAccount = (input: NewAccountInput): Account => {
      const account = makeAccount(input, { id: randomUUID() });
      setAccounts((prev) => [...prev, account]);
      return account;
    };

    const updateAccount = (id: string, input: NewAccountInput) => {
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === id ? { ...makeAccount(input, { id }), isArchived: a.isArchived } : a,
        ),
      );
    };

    const archiveAccount = (id: string) => {
      setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, isArchived: true } : a)));
    };

    const clearAllData = () => {
      setItems([]);
      setOccurrences([]);
      setCustomCategories([]);
      setAccounts([]);
    };

    const loadSampleData = () => {
      const sample = buildSampleData();
      setItems(sample.items);
      setOccurrences(sample.occurrences);
      setCustomCategories([]);
      setAccounts(sample.accounts);
    };

    return {
      items,
      occurrences,
      categories: [...BUILTIN_CATEGORIES, ...customCategories],
      accounts: accounts.filter((a) => !a.isArchived),
      displayCurrency,
      setDisplayCurrency,
      rates,
      loading,
      addSubscription,
      addInstallmentPlan,
      updateSubscription,
      updateInstallmentPlan,
      removeSubscription,
      markPaid,
      skipPayment,
      undoPaid,
      markInstallmentPaid,
      undoInstallmentPaid,
      pauseSubscription,
      resumeSubscription,
      addCategory,
      addAccount,
      updateAccount,
      archiveAccount,
      clearAllData,
      loadSampleData,
    };
  }, [items, occurrences, customCategories, accounts, displayCurrency, rates, loading]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}
