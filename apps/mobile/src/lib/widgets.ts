// The widget data bridge, LIVE since 2026-07-20: app-state's persist effect
// builds + writes the snapshot on every data change (and language switch).
//
// Widgets are a separate native process: no JS, no AsyncStorage. The app
// therefore pre-formats a small snapshot (names, amounts, colors, month
// total, all already localized) and drops it into the App Group's shared
// UserDefaults; the SwiftUI extension in targets/widgets/ only slices it per
// day and renders. All money and schedule math stays in @keel/core, on this
// side of the bridge. In Expo Go the native half is absent and the write is
// a loudly-logged no-op.

import {
  addDays,
  formatMoney,
  formatTotalsIn,
  projectCharges,
  sumByCurrency,
  today,
  type CurrencyCode,
  type ExchangeRates,
  type PaymentItem,
} from "@keel/core";

import { monthFull } from "../i18n/dates";
import { brandBleed } from "./brand";

/** Must match SharedStore.appGroup in targets/widgets/Shared.swift. */
export const WIDGET_APP_GROUP = "group.ch.keelapp.keel";
/** Must match SharedStore.key in targets/widgets/Shared.swift. */
export const WIDGET_SNAPSHOT_KEY = "keel.widget.snapshot.v1";

// A full year, so the widget always knows the NEXT payment even when it is
// months out: "All clear" must mean "nothing ahead at all", never "nothing
// in the next 30 days".
const HORIZON_DAYS = 365;
const MAX_PAYMENTS = 12;

/** Mirror of WidgetPayment in Shared.swift. */
export interface WidgetPayment {
  id: string;
  name: string;
  amount: string;
  dueDate: string;
  color: string;
  /** True for a charge whose day has passed unpaid — pinned first, shown in
   *  the warning tone. Optional so older Swift decoders keep working. */
  overdue?: boolean;
}

/** Mirror of WidgetSnapshot in Shared.swift. */
export interface WidgetSnapshot {
  version: 1;
  locale: "en" | "fr" | "de" | "it" | "pl";
  generatedAt: string;
  monthLabel: string;
  monthTotal: string;
  payments: WidgetPayment[];
}

/** Everything the widgets show, pre-formatted. `accentFallback` colors the
 *  brands the bleed rules can't resolve (pass the theme accent). */
export function buildWidgetSnapshot(
  items: readonly PaymentItem[],
  displayCurrency: CurrencyCode,
  rates: ExchangeRates | null,
  locale: "en" | "fr" | "de" | "it" | "pl",
  accentFallback: string,
): WidgetSnapshot {
  const asOf = today();
  const charges = projectCharges(items, addDays(asOf, HORIZON_DAYS));
  // An unpaid charge whose day has passed is the MOST urgent thing a widget
  // can show: overdue rides first, oldest debt leading, then the upcoming.
  const overdue = charges
    .filter((charge) => charge.dueDate < asOf)
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  const upcoming = charges.filter((charge) => charge.dueDate >= asOf);
  // The header total: what this month is still set to charge from today on.
  const monthCharges = upcoming.filter((charge) => charge.dueDate.slice(0, 7) === asOf.slice(0, 7));
  return {
    version: 1,
    locale,
    generatedAt: new Date().toISOString(),
    monthLabel: monthFull(Number(asOf.slice(5, 7)) - 1),
    monthTotal: formatTotalsIn(
      sumByCurrency(monthCharges.map((charge) => charge.amount)),
      displayCurrency,
      rates,
    ),
    payments: [
      ...overdue.map((charge) => ({ charge, overdue: true })),
      ...upcoming.map((charge) => ({ charge, overdue: false })),
    ]
      .slice(0, MAX_PAYMENTS)
      .map(({ charge, overdue: isOverdue }) => ({
        id: charge.paymentItemId,
        name: charge.name,
        amount: formatMoney(charge.amount),
        dueDate: charge.dueDate,
        color: brandBleed(charge, accentFallback),
        overdue: isOverdue,
      })),
  };
}

/** Hand the snapshot to the widgets and reload their timelines. Safe to call
 *  anywhere: in Expo Go (or before the package is installed) it is a no-op. */
export async function writeWidgetSnapshot(snapshot: WidgetSnapshot): Promise<void> {
  try {
    // Lazy so the native module is only touched where it exists.
    const targets = (await import("@bacons/apple-targets")) as {
      ExtensionStorage: {
        new (group: string): {
          set(key: string, value: string): void;
          get(key: string): string | null | undefined;
        };
        reloadWidget(name?: string): void;
      };
    };
    const storage = new targets.ExtensionStorage(WIDGET_APP_GROUP);
    storage.set(WIDGET_SNAPSHOT_KEY, JSON.stringify(snapshot));
    // The library degrades to SILENT no-op stubs when its native module is
    // not in the binary (Expo Go, stale build). Read the value back to tell
    // "written" from "swallowed": the stub's get returns undefined, the real
    // one returns the string. Without this, an unfed widget has no cause.
    const readBack = storage.get(WIDGET_SNAPSHOT_KEY);
    if (readBack === undefined) {
      console.warn(
        "[widgets] ExtensionStorage native module missing (Expo Go or a build older than the widget target): snapshot NOT written",
      );
      return;
    }
    if (__DEV__) {
      console.log(
        `[widgets] snapshot written: ${snapshot.payments.length} payments (${snapshot.payments.filter((p) => p.overdue).length} overdue)`,
      );
    }
    targets.ExtensionStorage.reloadWidget();
  } catch (error) {
    // Expo Go / package missing: the widgets simply stay unfed — but say so
    // in dev instead of hiding the reason.
    if (__DEV__) console.warn("[widgets] snapshot write failed:", error);
  }
}
