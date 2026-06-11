// App state for subscriptions + the payment-event ledger. Holds both in React
// state, hydrates from the device on mount, and re-persists on change. All
// domain logic (building an item, recording/accruing payments) is delegated to
// @keel/core — this layer only wires storage + React + id/clock to that logic.
//
// The ledger is the basis for future analytics: manual payments are logged when
// the user ticks them off; automatic payments are caught up (logged for every
// due date that has arrived) on load and on creation.

import { randomUUID } from "expo-crypto";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  accrueDueOccurrences,
  calendarDate,
  DEFAULT_CATEGORIES,
  makeInstallmentPaymentItem,
  makeRecurringPaymentItem,
  now,
  recordRecurringPayment,
  updateInstallmentPaymentItem,
  updateRecurringPaymentItem,
  type CalendarDate,
  type Category,
  type NewInstallmentInput,
  type NewRecurringInput,
  type PaymentItem,
  type PaymentOccurrence,
} from "@keel/core";

import { loadState, saveState } from "../lib/storage";

// Built-in seed categories presented as full Category records.
const BUILTIN_CATEGORIES: Category[] = DEFAULT_CATEGORIES.map((c) => ({
  id: c.id,
  name: c.name,
  icon: c.icon,
}));

interface SubscriptionsContextValue {
  items: PaymentItem[];
  /** Append-only ledger of actual payment events (for the future analytics tab). */
  occurrences: PaymentOccurrence[];
  /** Built-in + user-created categories, for pickers. */
  categories: Category[];
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
  /** Create a custom category; returns it so the caller can select it. */
  addCategory: (name: string, icon: string) => Category;
}

const SubscriptionsContext = createContext<SubscriptionsContextValue | null>(null);

function today(): CalendarDate {
  return calendarDate(new Date().toISOString().slice(0, 10));
}

/** Catch an automatic item up to today, logging any charges that have come due. */
function catchUp(item: PaymentItem): { item: PaymentItem; occurrences: PaymentOccurrence[] } {
  if (item.status !== "active" || item.settlementMode !== "automatic") {
    return { item, occurrences: [] };
  }
  return accrueDueOccurrences(item, today(), { now: now(), makeId: randomUUID });
}

export function SubscriptionsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<PaymentItem[]>([]);
  const [occurrences, setOccurrences] = useState<PaymentOccurrence[]>([]);
  const [customCategories, setCustomCategories] = useState<Category[]>([]);
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
      setOccurrences([...state.occurrences, ...accrued]);
      setCustomCategories(state.categories);
      setLoading(false);
    });
  }, []);

  // Persist after the initial hydration completes.
  useEffect(() => {
    if (!loading) void saveState({ items, occurrences, categories: customCategories });
  }, [items, occurrences, customCategories, loading]);

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
  };

  const markPaid = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item || item.schedule.kind !== "RECURRING") return;
    const { item: advanced, occurrence } = recordRecurringPayment(item, {
      id: randomUUID(),
      paidDate: today(),
      now: now(),
    });
    setItems((prev) => prev.map((i) => (i.id === id ? advanced : i)));
    setOccurrences((prev) => [...prev, occurrence]);
  };

  const addCategory = (name: string, icon: string): Category => {
    const category: Category = { id: randomUUID(), name: name.trim(), icon };
    setCustomCategories((prev) => [...prev, category]);
    return category;
  };

  return (
    <SubscriptionsContext.Provider
      value={{
        items,
        occurrences,
        categories: [...BUILTIN_CATEGORIES, ...customCategories],
        loading,
        addSubscription,
        addInstallmentPlan,
        updateSubscription,
        updateInstallmentPlan,
        removeSubscription,
        markPaid,
        addCategory,
      }}
    >
      {children}
    </SubscriptionsContext.Provider>
  );
}

export function useSubscriptions(): SubscriptionsContextValue {
  const ctx = useContext(SubscriptionsContext);
  if (!ctx) throw new Error("useSubscriptions must be used within SubscriptionsProvider");
  return ctx;
}
