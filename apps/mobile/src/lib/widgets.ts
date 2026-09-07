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

import i18n from "../i18n";
import { monthFull, monthShort } from "../i18n/dates";
import { themeModeSnapshot } from "../theme";
import { brandBleed } from "./brand";
import { entitlementSnapshot } from "./entitlement";

/** Must match SharedStore.appGroup in targets/widgets/Shared.swift. */
export const WIDGET_APP_GROUP = "group.ch.keelapp.keel";
/** Must match SharedStore.key in targets/widgets/Shared.swift. */
export const WIDGET_SNAPSHOT_KEY = "keel.widget.snapshot.v1";

// A full year, so the widget always knows the NEXT payment even when it is
// months out: "All clear" must mean "nothing ahead at all", never "nothing
// in the next 30 days".
const HORIZON_DAYS = 365;
// Large shows up to 12 rows; a few beyond that keep the "+N more" honest.
const MAX_PAYMENTS = 16;

/** Mirror of WidgetPayment in Shared.swift. */
export interface WidgetPayment {
  /** Unique PER OCCURRENCE (`itemId:dueDate`): a monthly item appears once
   *  per cycle, and SwiftUI's ForEach corrupts rows on duplicate ids (the
   *  bug that painted a future cycle as overdue). */
  id: string;
  /** The item, for the deep link. */
  itemId: string;
  name: string;
  amount: string;
  dueDate: string;
  /** Pre-localized short date ("25 Jul" / "25. Jul"): the trigger date the
   *  rows show alongside the relative label. For an overdue charge this is
   *  the day it SHOULD have been paid. */
  dateLabel: string;
  color: string;
  /** True for a charge whose day has passed unpaid — pinned first, shown in
   *  the warning tone. Optional so older Swift decoders keep working. */
  overdue?: boolean;
  /** True when the user settles this one by hand — the widget marks it,
   *  since it will not pay itself. */
  manual?: boolean;
}

/** Mirror of WidgetSnapshot in Shared.swift. */
export interface WidgetSnapshot {
  version: 1;
  locale: "en" | "fr" | "de" | "it" | "pl";
  generatedAt: string;
  monthLabel: string;
  monthTotal: string;
  payments: WidgetPayment[];
  /** Set while the app is LOCKED (§7.3): the widget shows this instead of
   *  its "all clear" line, and `payments` is empty — the home screen must
   *  never show stale data pretending to be live. */
  lockedLine?: string;
  /** The app's appearance preference; the widget follows it ("system" =
   *  the device scheme). Absent = the historical always-dark look. */
  theme?: "system" | "light" | "dark";
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
  // Widgets are a paid surface (§7.3): locked writes an EMPTY snapshot that
  // says so, never a frozen list that looks alive. HYDRATED is part of the
  // gate: at launch the persist effect can run before the entitlement store
  // has read the anchor, and a pre-hydration guess must never write "locked"
  // onto the home screen (the post-hydration rewrite corrects the rare
  // opposite miss within a beat).
  const entitlement = entitlementSnapshot();
  if (entitlement.hydrated && entitlement.locked) {
    return {
      version: 1,
      locale,
      generatedAt: new Date().toISOString(),
      monthLabel: monthFull(Number(asOf.slice(5, 7)) - 1),
      monthTotal: "",
      payments: [],
      lockedLine: i18n.t("widgets.locked"),
      theme: themeModeSnapshot(),
    };
  }
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
    theme: themeModeSnapshot(),
    payments: [
      ...overdue.map((charge) => ({ charge, overdue: true })),
      ...upcoming.map((charge) => ({ charge, overdue: false })),
    ]
      .slice(0, MAX_PAYMENTS)
      .map(({ charge, overdue: isOverdue }) => ({
        id: `${charge.paymentItemId}:${charge.dueDate}`,
        itemId: charge.paymentItemId,
        // A split payment says which slice this is: "Sofa · 2/4".
        name:
          charge.installmentIndex !== undefined && charge.installmentCount !== undefined
            ? `${charge.name} · ${charge.installmentIndex}/${charge.installmentCount}`
            : charge.name,
        amount: formatMoney(charge.amount),
        dueDate: charge.dueDate,
        dateLabel: shortDate(charge.dueDate, locale),
        color: brandBleed(charge, accentFallback),
        overdue: isOverdue,
        manual: charge.settlementMode === "manual",
      })),
  };
}

/** "25 Jul" (German swaps in its "25. Jul" form) — the month name comes from
 *  the app's own localized calendar, so it follows the APP language. */
function shortDate(date: string, locale: "en" | "fr" | "de" | "it" | "pl"): string {
  const day = Number(date.slice(8, 10));
  const month = monthShort(Number(date.slice(5, 7)) - 1);
  return locale === "de" ? `${day}. ${month}` : `${day} ${month}`;
}

/** Hand the snapshot to the widgets and reload their timelines. Safe to call
 *  anywhere: in Expo Go (or before the package is installed) it is a no-op. */
export async function writeWidgetSnapshot(snapshot: WidgetSnapshot): Promise<void> {
  try {
    // Our own local native module (modules/extension-storage): the mechanism
    // EAS provably compiles, unlike the equivalent pod from the widget
    // plugin's package, which its autolinking silently skipped. Lazy so it
    // is only touched where the native half exists.
    const storage = (await import("../../modules/extension-storage")).default;
    const payload = JSON.stringify(snapshot);
    storage.setString(WIDGET_SNAPSHOT_KEY, payload, WIDGET_APP_GROUP);
    // Write verification: read the suite back. A mismatch means the write
    // landed somewhere the widget can't see (entitlement problem) — the one
    // failure that must never stay silent.
    const readBack = storage.getString(WIDGET_SNAPSHOT_KEY, WIDGET_APP_GROUP);
    if (readBack !== payload) {
      console.warn("[widgets] snapshot readback mismatch: App Group not writable?");
      return;
    }
    if (__DEV__) {
      console.log(
        `[widgets] snapshot written: ${snapshot.payments.length} payments (${snapshot.payments.filter((p) => p.overdue).length} overdue)`,
      );
    }
    storage.reloadWidgets();
  } catch (error) {
    // Expo Go or a build without the module: the widgets simply stay unfed,
    // but say why in dev instead of hiding the reason.
    if (__DEV__) console.warn("[widgets] native module unavailable:", error);
  }
}
