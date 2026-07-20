// The widget data bridge — DORMANT until the dev-build era (nothing imports
// this file yet; Expo Go can't load the native half).
//
// Widgets are a separate native process: no JS, no AsyncStorage. The app
// therefore pre-formats a small snapshot (names, amounts, colors, month
// total, all already localized) and drops it into the App Group's shared
// UserDefaults; the SwiftUI extension in targets/widgets/ only slices it per
// day and renders. All money and schedule math stays in @keel/core, on this
// side of the bridge.
//
// WIRING (dev-build era) — full steps in targets/widgets/README.md:
//   1. npx expo install @bacons/apple-targets, add it to app.json plugins,
//      add the App Group to app.json ios.entitlements.
//   2. In app-state's persist effect, build + write the snapshot on every
//      change (see the README for the exact snippet).
//   3. Delete the @ts-expect-error below once the package exists.

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

const HORIZON_DAYS = 30;
const MAX_PAYMENTS = 12;

/** Mirror of WidgetPayment in Shared.swift. */
export interface WidgetPayment {
  id: string;
  name: string;
  amount: string;
  dueDate: string;
  color: string;
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
  const charges = projectCharges(items, addDays(asOf, HORIZON_DAYS)).filter(
    (charge) => charge.dueDate >= asOf,
  );
  // The header total: what this month is still set to charge from today on.
  const monthCharges = charges.filter((charge) => charge.dueDate.slice(0, 7) === asOf.slice(0, 7));
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
    payments: charges.slice(0, MAX_PAYMENTS).map((charge) => ({
      id: charge.paymentItemId,
      name: charge.name,
      amount: formatMoney(charge.amount),
      dueDate: charge.dueDate,
      color: brandBleed(charge, accentFallback),
    })),
  };
}

/** Hand the snapshot to the widgets and reload their timelines. Safe to call
 *  anywhere: in Expo Go (or before the package is installed) it is a no-op. */
export async function writeWidgetSnapshot(snapshot: WidgetSnapshot): Promise<void> {
  try {
    // Lazy so the native module is only touched where it exists.
    // @ts-expect-error dormant dependency, installed in the dev-build era
    const targets = (await import("@bacons/apple-targets")) as {
      ExtensionStorage: {
        new (group: string): { set(key: string, value: string): void };
        reloadWidget(name?: string): void;
      };
    };
    const storage = new targets.ExtensionStorage(WIDGET_APP_GROUP);
    storage.set(WIDGET_SNAPSHOT_KEY, JSON.stringify(snapshot));
    targets.ExtensionStorage.reloadWidget();
  } catch {
    // Expo Go / package missing: the widgets simply stay unfed.
  }
}
