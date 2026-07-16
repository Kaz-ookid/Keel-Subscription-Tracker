// The app-wide store: payment items, the payment-event ledger, categories and
// accounts. Hydrates from the device on mount and re-persists on change. All
// domain logic (building an item, recording/accruing payments) is delegated to
// @keel/core — this layer only wires storage + React + id/clock to that logic.
//
// Split into two contexts on purpose (React's "state + dispatch" pattern):
//   - AppData      — the values screens read; changes on every data change.
//   - AppActions   — the mutators; a STABLE object created once, so a component
//                    that only dispatches never re-renders on data changes, and
//                    handlers passed to children keep a stable identity.
// The handlers read the latest state through a ref (not a closure over state),
// which is what lets the actions object stay stable without going stale.
//
// The ledger is the basis for analytics: manual payments are logged when the
// user ticks them off; automatic payments are caught up (logged for every due
// date that has arrived) on load and on creation.

import { randomUUID } from "expo-crypto";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import {
  accrueDueInstallments,
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
  removePriceChange,
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
  type SuggestedCommitment,
} from "@keel/core";

import { autoBackupIfDue } from "../lib/backups";
import { fetchRates, loadCachedRates } from "../lib/exchange-rates";
import { syncReminders } from "../lib/notifications";
import { buildDemoData } from "../lib/demo-data";
import { buildSampleData } from "../lib/sample-data";
import {
  loadSnapshot,
  loadState,
  parsePersistedState,
  saveSnapshot as persistSnapshot,
  saveState,
  type PersistedState,
} from "../lib/storage";

// Built-in seed categories presented as full Category records.
const BUILTIN_CATEGORIES: Category[] = DEFAULT_CATEGORIES.map((c) => ({
  id: c.id,
  name: c.name,
  icon: c.icon,
}));

/** The values screens read. Re-renders a consumer whenever any of these change. */
export interface AppData {
  items: PaymentItem[];
  /** Append-only ledger of actual payment events (for the future analytics tab). */
  occurrences: PaymentOccurrence[];
  /** Built-in + user-created categories, for pickers. */
  categories: Category[];
  /** Active (non-archived) bank accounts, for assignment + the Accounts tab. */
  accounts: Account[];
  /** Big numbers merge into this currency everywhere. */
  displayCurrency: CurrencyCode;
  /** ECB daily reference rates (cached; null until first successful fetch). */
  rates: ExchangeRates | null;
  /** The "To complete" list: suggestions the user has but hasn't filled in. */
  pending: SuggestedCommitment[];
  loading: boolean;
  /** Debug: when the on-device snapshot was stashed (null when there is none). */
  snapshotSavedAt: string | null;
}

/** The mutators. One stable object — its identity never changes, so consumers
 *  that only dispatch never re-render. */
export interface AppActions {
  setDisplayCurrency: (currency: CurrencyCode) => void;
  addSubscription: (input: NewRecurringInput, options?: AddItemOptions) => void;
  /** Create a BNPL "Pay in X" installment plan. */
  addInstallmentPlan: (input: NewInstallmentInput, options?: AddItemOptions) => void;
  /** Edit an existing recurring subscription. An amount edit is a real
   *  price "change" (recorded) or a typo "correction" (rewritten in place). */
  updateSubscription: (
    id: string,
    input: NewRecurringInput,
    priceEdit?: "change" | "correction",
  ) => void;
  /** Edit an existing installment plan. */
  updateInstallmentPlan: (id: string, input: NewInstallmentInput) => void;
  /** Erase a wrongly recorded price change; the standing price reverts when
   *  the erased entry was the latest. */
  revertPriceChange: (id: string, effectiveFrom: CalendarDate) => void;
  /** Set or clear an item's reminder rule without touching anything else —
   *  the notifications screen's quick add/remove. */
  setItemReminder: (id: string, daysBefore: number | null) => void;
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
  /** Debug/testing: replace everything with the demo seed. */
  loadDemoData: () => void;
  addPendingSuggestions: (suggestions: SuggestedCommitment[]) => void;
  removePendingSuggestion: (id: string) => void;
  /** Backup: the exact persisted shape, ready to serialise and share. */
  exportData: () => PersistedState;
  /** Restore a backup (replaces everything); false when the JSON is invalid. */
  importData: (json: string) => boolean;
  /** Debug: stash the current data in the snapshot slot (overwrites it), so
   *  demo data / clear all can be played with and undone. */
  saveSnapshot: () => void;
  /** Debug: replace everything with the stashed snapshot. */
  restoreSnapshot: () => void;
}

export interface AddItemOptions {
  /** Record every occurrence due before today as paid, regardless of the
   *  settlement mode — for imports, where the past was paid outside the app
   *  and must not arrive as a wall of "overdue" cycles. */
  settlePastPayments?: boolean;
}

/** The raw state the handlers read through a ref (the persisted shape, before
 *  the display-time derivations the data context applies). */
interface RawState {
  items: PaymentItem[];
  occurrences: PaymentOccurrence[];
  customCategories: Category[];
  accounts: Account[];
  displayCurrency: CurrencyCode;
  pending: SuggestedCommitment[];
}

const AppDataContext = createContext<AppData | null>(null);
const AppActionsContext = createContext<AppActions | null>(null);

/** Catch an automatic item up to today: recurring items log any charges that
 *  have come due; Pay-in-X plans mark any installments that have come due as
 *  paid (the provider debits them automatically). Manual items are untouched. */
function catchUp(item: PaymentItem): { item: PaymentItem; occurrences: PaymentOccurrence[] } {
  if (item.status !== "active" || item.settlementMode !== "automatic") {
    return { item, occurrences: [] };
  }
  return settleBacklog(item);
}

/** Catch ANY active item up to today, manual ones included — the import path,
 *  where whatever was due before today was paid outside the app. */
function settleBacklog(item: PaymentItem): {
  item: PaymentItem;
  occurrences: PaymentOccurrence[];
} {
  if (item.status !== "active") return { item, occurrences: [] };
  if (item.scheduleType === "INSTALLMENT") {
    return { item: accrueDueInstallments(item, today(), { now: now() }), occurrences: [] };
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
  const [pending, setPending] = useState<SuggestedCommitment[]>([]);
  const [snapshotSavedAt, setSnapshotSavedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // The latest COMMITTED state, readable synchronously from the stable handlers
  // below (they must never close over a stale render's state). Written in a
  // layout effect, not during render: a concurrent render that React discards
  // must never leak into an event handler. The initial value mirrors the
  // useState initials above, so the ref is correct even before the first
  // effect runs; every commit then re-syncs it before anything can be tapped.
  const rawRef = useRef<RawState>({
    items: [],
    occurrences: [],
    customCategories: [],
    accounts: [],
    displayCurrency: DEFAULT_CURRENCY,
    pending: [],
  });
  useLayoutEffect(() => {
    rawRef.current = { items, occurrences, customCategories, accounts, displayCurrency, pending };
  });

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
      setPending(state.pending);
      setLoading(false);
    });
    // Surface the stashed snapshot's date (if any) on the restore button.
    void loadSnapshot().then((snapshot) => {
      if (snapshot) setSnapshotSavedAt(snapshot.savedAt);
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
  // paused or edited commitment can never fire a stale notification. The
  // language is a dependency so scheduled texts follow a language switch.
  const { i18n } = useTranslation();
  useEffect(() => {
    if (!loading) void syncReminders(items);
  }, [items, loading, i18n.language]);

  // Persist after the initial hydration completes.
  useEffect(() => {
    if (!loading)
      void saveState({
        items,
        occurrences,
        categories: customCategories,
        accounts,
        displayCurrency,
        pending,
      });
  }, [items, occurrences, customCategories, accounts, displayCurrency, pending, loading]);

  // The daily local backup: once per launch, right after hydration — the
  // library itself skips days that already have one.
  const autoBackedUp = useRef(false);
  useEffect(() => {
    if (loading || autoBackedUp.current) return;
    autoBackedUp.current = true;
    autoBackupIfDue({
      items,
      occurrences,
      categories: customCategories,
      accounts,
      displayCurrency,
      pending,
    });
  }, [items, occurrences, customCategories, accounts, displayCurrency, pending, loading]);

  // The mutators, built ONCE (empty deps): they read the latest state through
  // rawRef and write through the stable setState functions, so their identity
  // never changes and consumers that only dispatch never re-render.
  const actions = useMemo<AppActions>(() => {
    const addSubscription = (input: NewRecurringInput, options?: AddItemOptions) => {
      const created = makeRecurringPaymentItem(input, { id: randomUUID(), now: now() });
      const { item, occurrences: accrued } = options?.settlePastPayments
        ? settleBacklog(created)
        : catchUp(created);
      setItems((prev) => [item, ...prev]);
      if (accrued.length > 0) setOccurrences((prev) => [...prev, ...accrued]);
    };

    const addInstallmentPlan = (input: NewInstallmentInput, options?: AddItemOptions) => {
      const created = makeInstallmentPaymentItem(input, {
        id: randomUUID(),
        now: now(),
        makeId: randomUUID,
      });
      const item = options?.settlePastPayments ? settleBacklog(created).item : created;
      setItems((prev) => [item, ...prev]);
    };

    const updateSubscription = (
      id: string,
      input: NewRecurringInput,
      priceEdit?: "change" | "correction",
    ) => {
      // The latest recorded charge anchors the recomputed next-charge cursor so it
      // never regresses behind a charge that already happened.
      const lastChargedDate = rawRef.current.occurrences.reduce<CalendarDate | undefined>(
        (max, o) => (o.paymentItemId === id && (!max || o.dueDate > max) ? o.dueDate : max),
        undefined,
      );
      setItems((prev) =>
        prev.map((i) =>
          i.id === id
            ? updateRecurringPaymentItem(i, input, { now: now(), lastChargedDate, priceEdit })
            : i,
        ),
      );
    };

    const revertPriceChange = (id: string, effectiveFrom: CalendarDate) => {
      setItems((prev) =>
        prev.map((i) => (i.id === id ? removePriceChange(i, { effectiveFrom, now: now() }) : i)),
      );
    };

    // Reminder is standalone metadata on the item — patched in place, so the
    // schedule, price history and cursors stay untouched.
    const setItemReminder = (id: string, daysBefore: number | null) => {
      setItems((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, reminder: daysBefore === null ? undefined : { daysBefore } } : i,
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
      const item = rawRef.current.items.find((i) => i.id === id);
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
      const item = rawRef.current.items.find((i) => i.id === id);
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
      const item = rawRef.current.items.find((i) => i.id === id);
      if (!item || item.schedule.kind !== "RECURRING" || item.settlementMode !== "manual") return;
      // The most recent hand-recorded event (paid or skipped) for this item.
      const last = rawRef.current.occurrences.reduce<PaymentOccurrence | undefined>(
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
      setPending([]);
    };

    const addPendingSuggestions = (suggestions: SuggestedCommitment[]) => {
      setPending((prev) => {
        const seen = new Set(prev.map((s) => s.id));
        const fresh = suggestions.filter((s) => !seen.has(s.id));
        return fresh.length > 0 ? [...prev, ...fresh] : prev;
      });
    };

    const removePendingSuggestion = (id: string) => {
      setPending((prev) => prev.filter((s) => s.id !== id));
    };

    const loadSampleData = () => {
      const sample = buildSampleData();
      setItems(sample.items);
      setOccurrences(sample.occurrences);
      setCustomCategories([]);
      setAccounts(sample.accounts);
    };

    const loadDemoData = () => {
      const demo = buildDemoData();
      setItems(demo.items);
      setOccurrences(demo.occurrences);
      setCustomCategories([]);
      setAccounts(demo.accounts);
    };

    const exportData = (): PersistedState => {
      const s = rawRef.current;
      return {
        items: s.items,
        occurrences: s.occurrences,
        categories: s.customCategories,
        accounts: s.accounts,
        displayCurrency: s.displayCurrency,
        pending: s.pending,
      };
    };

    const importData = (json: string): boolean => {
      const state = parsePersistedState(json);
      if (!state) return false;
      setItems(state.items);
      setOccurrences(state.occurrences);
      setCustomCategories(state.categories);
      setAccounts(state.accounts);
      setDisplayCurrency(state.displayCurrency);
      setPending(state.pending);
      return true;
    };

    const saveSnapshot = () => {
      void persistSnapshot(exportData()).then(setSnapshotSavedAt);
    };

    const restoreSnapshot = () => {
      void loadSnapshot().then((snapshot) => {
        if (!snapshot) return;
        setItems(snapshot.state.items);
        setOccurrences(snapshot.state.occurrences);
        setCustomCategories(snapshot.state.categories);
        setAccounts(snapshot.state.accounts);
        setDisplayCurrency(snapshot.state.displayCurrency);
        setPending(snapshot.state.pending);
      });
    };

    return {
      setDisplayCurrency,
      addSubscription,
      addInstallmentPlan,
      updateSubscription,
      updateInstallmentPlan,
      revertPriceChange,
      setItemReminder,
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
      loadDemoData,
      addPendingSuggestions,
      removePendingSuggestion,
      exportData,
      importData,
      saveSnapshot,
      restoreSnapshot,
    };
  }, []);

  const data = useMemo<AppData>(
    () => ({
      items,
      occurrences,
      categories: [...BUILTIN_CATEGORIES, ...customCategories],
      accounts: accounts.filter((a) => !a.isArchived),
      displayCurrency,
      rates,
      pending,
      loading,
      snapshotSavedAt,
    }),
    [
      items,
      occurrences,
      customCategories,
      accounts,
      displayCurrency,
      rates,
      pending,
      loading,
      snapshotSavedAt,
    ],
  );

  return (
    <AppActionsContext.Provider value={actions}>
      <AppDataContext.Provider value={data}>{children}</AppDataContext.Provider>
    </AppActionsContext.Provider>
  );
}

/** The app's data. Re-renders the caller whenever any field changes. */
export function useAppData(): AppData {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppStateProvider");
  return ctx;
}

/** The app's mutators. A stable object — reading it never causes a re-render. */
export function useAppActions(): AppActions {
  const ctx = useContext(AppActionsContext);
  if (!ctx) throw new Error("useAppActions must be used within AppStateProvider");
  return ctx;
}
