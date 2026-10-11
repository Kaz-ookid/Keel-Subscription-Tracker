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
import { Alert } from "react-native";
import {
  accrueDueInstallments,
  accrueDueOccurrences,
  appendAiActivity,
  applyAssistantOperation,
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
  reminderRules,
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
  type AiActivityEntry,
  type AssistantOperation,
  type CalendarDate,
  type Category,
  type CurrencyCode,
  type ExchangeRates,
  type ImportDraft,
  type NewAccountInput,
  type NewInstallmentInput,
  type NewRecurringInput,
  type PaymentItem,
  type PaymentOccurrence,
  type SuggestedCommitment,
} from "@keel/core";

import AsyncStorage from "@react-native-async-storage/async-storage";

import { COLOR_SWATCHES } from "../constants";
import { autoBackupIfDue, createBackup, readBackup } from "../lib/backups";
import { appLockConfigSnapshot, onAppLockChange } from "../lib/app-lock";
import { entitlementSnapshot, markTrialStarted, onEntitlementChange } from "../lib/entitlement";
import { fetchRates, loadCachedRates } from "../lib/exchange-rates";
import {
  chooseNewerState,
  downloadFromICloud,
  ICLOUD_ENABLED_KEY,
  uploadToICloud,
} from "../lib/icloud-backup";
import { syncReminders } from "../lib/notifications";
import { buildSampleData } from "../lib/sample-data";
import { buildWidgetSnapshot, writeWidgetSnapshot } from "../lib/widgets";
import { darkColors } from "../theme";
import {
  loadSnapshot,
  loadState,
  parsePersistedStateDetailed,
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
  /** The AI trace, newest first — what the assistant and the imports did. */
  aiActivity: AiActivityEntry[];
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
  addPendingSuggestions: (suggestions: SuggestedCommitment[]) => void;
  removePendingSuggestion: (id: string) => void;
  /** Backup: the exact persisted shape, ready to serialise and share. */
  exportData: () => PersistedState;
  /** Restore a backup (replaces everything). `ok` false when the JSON is
   *  not a backup at all; `dropped` counts entries the structural guards
   *  had to skip (corrupt or from an incompatible future shape). */
  importData: (json: string) => { ok: boolean; dropped: number };
  /** Debug: stash the current data in the snapshot slot (overwrites it), so
   *  demo data / clear all can be played with and undone. */
  saveSnapshot: () => void;
  /** Debug: replace everything with the stashed snapshot. */
  restoreSnapshot: () => void;
  /** Apply a REVIEWED assistant plan in one batch: a safety backup is written
   *  first, every operation lands through the same core mutations the screens
   *  use, and the whole action is recorded in the AI trace. */
  applyAssistantPlan: (
    operations: AssistantOperation[],
    additions: ImportDraft[],
  ) => { backupName: string | null; added: number; updated: number; removed: number };
  /** Record an AI action performed elsewhere (the import flows) in the trace. */
  logAiActivity: (entry: Omit<AiActivityEntry, "id" | "at">) => void;
  /** Snapshot the current data as an AI safety backup before an import lands,
   *  returning its name for the AI-history revert. */
  createAiBackup: () => string | undefined;
  /** Roll the DATA back to the safety backup of an AI action. The AI trace
   *  itself survives — history is the record of what happened, not part of
   *  what gets rolled back. False when the backup is gone or unreadable. */
  revertAiBackup: (backupName: string) => boolean;
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
  aiActivity: AiActivityEntry[];
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
  const [aiActivity, setAiActivity] = useState<AiActivityEntry[]>([]);
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
    aiActivity: [],
  });
  useLayoutEffect(() => {
    rawRef.current = {
      items,
      occurrences,
      customCategories,
      accounts,
      displayCurrency,
      pending,
      aiActivity,
    };
  });

  useEffect(() => {
    // Hydrate from disk, and where the iCloud switch is on, let the cloud
    // copy win when it is genuinely newer (another device wrote it) — the
    // BACKUP that follows the account, not a merge engine. Offline or
    // signed-out just means the local state stands.
    const hydrate = async () => {
      let state = await loadState();
      try {
        if ((await AsyncStorage.getItem(ICLOUD_ENABLED_KEY)) === "true") {
          const remote = await downloadFromICloud();
          const decision = await chooseNewerState(state, remote);
          state = decision.state;
        }
      } catch {
        // iCloud being unreachable must never delay or break launch.
      }
      return state;
    };
    hydrate().then((state) => {
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
      setAiActivity(state.aiActivity);
      setLoading(false);
      // Migration (§7.3 a-bis): data that predates the trial has commitments
      // but no anchor anywhere — the "first commitment" trigger can never
      // fire for it. Stamp now: the update that introduces the trial grants
      // the full 45 days. Idempotent: an existing anchor always wins.
      if (caughtUp.length > 0) void markTrialStarted();
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
  // The LOCK flipping (expiry crossed, purchase, debug switch) is a change
  // too: reminders cancel and the widget empties without any data edit, so
  // the entitlement store bumps a nonce that both effects depend on.
  const { i18n } = useTranslation();
  const [lockNonce, setLockNonce] = useState(0);
  const lockedRef = useRef(entitlementSnapshot().locked);
  const entHydratedRef = useRef(entitlementSnapshot().hydrated);
  useEffect(
    () =>
      onEntitlementChange(() => {
        const snapshot = entitlementSnapshot();
        // Re-derive reminders + widgets when the LOCK flips, and once when
        // the entitlement store finishes hydrating — a snapshot written
        // before hydration guessed at the lock and must be corrected.
        if (snapshot.locked !== lockedRef.current || snapshot.hydrated !== entHydratedRef.current) {
          lockedRef.current = snapshot.locked;
          entHydratedRef.current = snapshot.hydrated;
          setLockNonce((n) => n + 1);
        }
      }),
    [],
  );
  // The APP lock gates the widget snapshot too (a Face-ID-locked app must
  // not paint amounts on the home screen): flipping it rewrites widgets.
  const appLockEnabledRef = useRef(appLockConfigSnapshot().enabled);
  useEffect(
    () =>
      onAppLockChange((config) => {
        if (config.enabled !== appLockEnabledRef.current) {
          appLockEnabledRef.current = config.enabled;
          setLockNonce((n) => n + 1);
        }
      }),
    [],
  );
  useEffect(() => {
    if (!loading) void syncReminders(items);
  }, [items, loading, i18n.language, lockNonce]);

  // Persist after the initial hydration completes. A failed write retries
  // once, then warns (once per session): silently losing financial data is
  // the one failure this store must never swallow. Every later change
  // re-runs the effect, so persistence keeps trying to heal on its own.
  const saveWarned = useRef(false);
  useEffect(() => {
    if (loading) return;
    const state = {
      items,
      occurrences,
      categories: customCategories,
      accounts,
      displayCurrency,
      pending,
      aiActivity,
    };
    let stale = false;
    const attempt = (retriesLeft: number) => {
      saveState(state).catch(() => {
        // A newer state is already being saved; let its attempt report.
        if (stale) return;
        if (retriesLeft > 0) {
          setTimeout(() => attempt(retriesLeft - 1), 1500);
        } else if (!saveWarned.current) {
          saveWarned.current = true;
          Alert.alert(i18n.t("storage.saveFailedTitle"), i18n.t("storage.saveFailedBody"));
        }
      });
    };
    attempt(1);

    // The widgets eat a pre-formatted snapshot of the same state: rebuilt on
    // every change (and language switch) so "Tomorrow" and amounts never go
    // stale on the home screen. No-op where the native half is absent.
    const locale = (["en", "fr", "de", "it", "pl"] as const).find((l) =>
      i18n.language.startsWith(l),
    );
    void writeWidgetSnapshot(
      buildWidgetSnapshot(items, displayCurrency, rates, locale ?? "en", darkColors.accent),
    );

    // And where the iCloud switch is on, the same blob rides to the cloud,
    // fire-and-forget: the local write above is the source of truth.
    void AsyncStorage.getItem(ICLOUD_ENABLED_KEY).then((enabled) => {
      if (enabled === "true") void uploadToICloud(state);
    });

    return () => {
      stale = true;
    };
    // i18n is the stable singleton; it only matters for the alert's language.
  }, [
    lockNonce,
    items,
    occurrences,
    customCategories,
    accounts,
    displayCurrency,
    rates,
    pending,
    aiActivity,
    loading,
    i18n,
    i18n.language,
  ]);

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
      aiActivity,
    });
  }, [
    items,
    occurrences,
    customCategories,
    accounts,
    displayCurrency,
    pending,
    aiActivity,
    loading,
  ]);

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
      // The FIRST commitment saved starts the 45-day clock (§7.3). Idempotent
      // — an existing anchor always wins. Sample data and snapshot restores
      // bypass these actions on purpose, so they can never start it.
      void markTrialStarted();
    };

    const addInstallmentPlan = (input: NewInstallmentInput, options?: AddItemOptions) => {
      const created = makeInstallmentPaymentItem(input, {
        id: randomUUID(),
        now: now(),
        makeId: randomUUID,
      });
      const item = options?.settlePastPayments ? settleBacklog(created).item : created;
      setItems((prev) => [item, ...prev]);
      void markTrialStarted();
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
            ? updateRecurringPaymentItem(i, input, {
                now: now(),
                today: today(),
                lastChargedDate,
                priceEdit,
              })
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
    // schedule, price history and cursors stay untouched. null clears every
    // rule AND mutes the trial safety-net reminder (the explicit empty list
    // is the opt-out the planner honors); a number appends one rule (keeping
    // any the item already has), with the legacy single slot mirrored to the
    // first rule for older readers.
    const setItemReminder = (id: string, daysBefore: number | null) => {
      setItems((prev) =>
        prev.map((i) => {
          if (i.id !== id) return i;
          if (daysBefore === null) return { ...i, reminder: undefined, reminders: [] };
          const existing = reminderRules(i);
          const rules = existing.some((r) => r.daysBefore === daysBefore)
            ? existing
            : [...existing, { daysBefore }];
          return { ...i, reminder: rules[0], reminders: rules };
        }),
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
      if (isPaymentItemComplete(item)) return;
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
      setAiActivity([]);
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

    const exportData = (): PersistedState => {
      const s = rawRef.current;
      return {
        items: s.items,
        occurrences: s.occurrences,
        categories: s.customCategories,
        accounts: s.accounts,
        displayCurrency: s.displayCurrency,
        pending: s.pending,
        aiActivity: s.aiActivity,
      };
    };

    const importData = (json: string): { ok: boolean; dropped: number } => {
      const parsed = parsePersistedStateDetailed(json);
      if (!parsed) return { ok: false, dropped: 0 };
      const { state, dropped } = parsed;
      setItems(state.items);
      setOccurrences(state.occurrences);
      setCustomCategories(state.categories);
      setAccounts(state.accounts);
      setDisplayCurrency(state.displayCurrency);
      setPending(state.pending);
      setAiActivity(state.aiActivity);
      // Restored real data implies real commitments — the clock runs (§7.3).
      if (state.items.length > 0) void markTrialStarted();
      return { ok: true, dropped };
    };

    const logAiActivity = (entry: Omit<AiActivityEntry, "id" | "at">) => {
      setAiActivity((prev) =>
        appendAiActivity(prev, { ...entry, id: randomUUID(), at: new Date().toISOString() }),
      );
    };

    // Snapshot the current data as an "ai" safety backup BEFORE an AI action
    // lands (the import path takes it before adding). Returns the name so the
    // AI-history entry can offer a revert, like the assistant already does.
    const createAiBackup = (): string | undefined => createBackup(exportData(), "ai") ?? undefined;

    // The whole plan lands as ONE synchronous batch computed from the live
    // state: transforms, deletes and ledger-writing ops (mark paid / skip)
    // can't read each other's stale state, and React commits one change.
    const applyAssistantPlan = (
      operations: AssistantOperation[],
      additions: ImportDraft[],
    ): { backupName: string | null; added: number; updated: number; removed: number } => {
      // The safety net first: the exact pre-plan state, revertible from the
      // AI history for as long as the backup is kept.
      const backupName = createBackup(exportData(), "ai");
      const nowTs = now();
      const asOf = today();
      let nextItems = [...rawRef.current.items];
      let nextOccurrences = [...rawRef.current.occurrences];
      const itemNames: string[] = [];
      let updated = 0;
      let removed = 0;

      for (const op of operations) {
        const index = nextItems.findIndex((i) => i.id === op.item.id);
        if (index === -1) continue;
        const current = nextItems[index];
        itemNames.push(current.name);
        if (op.kind === "delete") {
          nextItems.splice(index, 1);
          nextOccurrences = nextOccurrences.filter((o) => o.paymentItemId !== current.id);
          removed++;
        } else if (op.kind === "mark_paid") {
          if (!canMarkPaid(current, asOf)) continue;
          if (current.schedule.kind === "INSTALLMENT") {
            nextItems[index] = markNextInstallmentPaid(current, { paidDate: asOf, now: nowTs });
          } else if (current.schedule.kind === "RECURRING") {
            const result = recordRecurringPayment(current, {
              id: randomUUID(),
              paidDate: asOf,
              now: nowTs,
            });
            nextItems[index] = result.item;
            nextOccurrences.push(result.occurrence);
          }
          updated++;
        } else if (op.kind === "skip") {
          if (
            current.schedule.kind !== "RECURRING" ||
            current.status !== "active" ||
            isPaymentItemComplete(current)
          ) {
            continue;
          }
          const result = skipRecurringPayment(current, { id: randomUUID(), now: nowTs });
          nextItems[index] = result.item;
          nextOccurrences.push(result.occurrence);
          updated++;
        } else {
          nextItems[index] = applyAssistantOperation(current, op, { now: nowTs, today: asOf });
          updated++;
        }
      }

      // Additions land exactly like the import review's confirm: unmatched
      // account names become real accounts, the past lands settled unless
      // the input said the user is behind.
      const createdAccounts: Account[] = [];
      const createdByName = new Map<string, Account>();
      for (const draft of additions) {
        let accountId = draft.input.accountId;
        if (!accountId && draft.accountName) {
          const key = draft.accountName.toLowerCase();
          let account = createdByName.get(key);
          if (!account) {
            const currency =
              draft.kind === "subscription"
                ? draft.input.amount.currency
                : draft.input.totalAmount.currency;
            account = makeAccount(
              {
                name: draft.accountName,
                type: "other",
                currency,
                color: COLOR_SWATCHES[createdByName.size % COLOR_SWATCHES.length],
                icon: "building.columns.fill",
              },
              { id: randomUUID() },
            );
            createdByName.set(key, account);
            createdAccounts.push(account);
          }
          accountId = account.id;
        }
        if (draft.kind === "subscription") {
          const created = makeRecurringPaymentItem(
            { ...draft.input, accountId },
            { id: randomUUID(), now: nowTs },
          );
          const landed = draft.settlePast ? settleBacklog(created) : catchUp(created);
          nextItems = [landed.item, ...nextItems];
          nextOccurrences.push(...landed.occurrences);
        } else {
          const created = makeInstallmentPaymentItem(
            { ...draft.input, accountId },
            { id: randomUUID(), now: nowTs, makeId: randomUUID },
          );
          nextItems = [draft.settlePast ? settleBacklog(created).item : created, ...nextItems];
        }
        itemNames.push(draft.input.name);
      }

      setItems(nextItems);
      setOccurrences(nextOccurrences);
      if (createdAccounts.length > 0) setAccounts((prev) => [...prev, ...createdAccounts]);
      // Assistant additions bypass addSubscription — hook the clock here too.
      if (additions.length > 0) void markTrialStarted();
      const summary = { added: additions.length, updated, removed };
      logAiActivity({
        tool: "assistant",
        summary,
        itemNames,
        backupName: backupName ?? undefined,
      });
      return { backupName, ...summary };
    };

    const revertAiBackup = (backupName: string): boolean => {
      const raw = readBackup(backupName);
      if (!raw) return false;
      const parsed = parsePersistedStateDetailed(raw);
      if (!parsed) return false;
      // The safety net for the safety net: snapshot NOW before going back,
      // so a revert is itself revertible.
      createBackup(exportData(), "ai");
      const { state } = parsed;
      setItems(state.items);
      setOccurrences(state.occurrences);
      setCustomCategories(state.categories);
      setAccounts(state.accounts);
      setDisplayCurrency(state.displayCurrency);
      setPending(state.pending);
      // aiActivity deliberately NOT restored: the trace records history and
      // must survive the history being rolled back.
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
      addPendingSuggestions,
      removePendingSuggestion,
      exportData,
      importData,
      saveSnapshot,
      restoreSnapshot,
      applyAssistantPlan,
      logAiActivity,
      createAiBackup,
      revertAiBackup,
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
      aiActivity,
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
      aiActivity,
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
