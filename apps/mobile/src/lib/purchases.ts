// The Full Keel purchase bridge (PROJECT_BRIEF §7.3): TWO non-consumable
// products for one entitlement — the early price while the buyer's own trial
// still runs, the regular price after. Apple has no discount mechanism for
// one-time purchases, so only the applicable product is ever offered, and
// restore accepts EITHER. Family Sharing is enabled on both in App Store
// Connect.
//
// The import stays lazy and guarded: in Expo Go or a dev client built before
// expo-iap, every function answers "unavailable" and the paywall falls back
// to its static prices. expo-iap v5 is EVENT-based for purchases: the
// request dispatches, the outcome arrives via purchaseUpdatedListener /
// purchaseErrorListener — buyFullKeel wraps that into one promise.
//
// App Store Connect (manual, before launch): create BOTH product ids below
// as non-consumables (12 CHF / 15 CHF), enable Family Sharing on both,
// enroll in the Small Business Program. Sandbox QA: buy, relaunch, delete +
// reinstall + restore, second family account, airplane-mode failures.

import { requireOptionalNativeModule } from "expo-modules-core";

import type { TrialState } from "@keel/core";

import { setFullKeel } from "./entitlement";

/** Must match App Store Connect exactly. `early` sells only while the
 *  buyer's trial runs (12 CHF); `full` is the regular price (15 CHF). */
export const FULL_KEEL_EARLY_PRODUCT_ID = "ch.keelapp.keel.full.early";
export const FULL_KEEL_PRODUCT_ID = "ch.keelapp.keel.full";

export type PurchaseOutcome = "purchased" | "cancelled" | "failed" | "unavailable";
export type RestoreOutcome = "restored" | "none" | "failed" | "unavailable";

/** Which product a buyer in `state` may purchase. */
export function fullKeelSku(state: TrialState): string {
  return state === "trial" || state === "fresh" ? FULL_KEEL_EARLY_PRODUCT_ID : FULL_KEEL_PRODUCT_ID;
}

/** The lazy native door: null in Expo Go / on builds without the module. */
async function store(): Promise<typeof import("expo-iap") | null> {
  // Probe availability FIRST — importing the JS package on a binary without
  // the native module logs a RED error even inside try/catch (its module
  // scope calls requireNativeModule). The optional probe stays silent.
  if (!requireOptionalNativeModule("ExpoIap")) return null;
  try {
    return await import("expo-iap");
  } catch {
    return null;
  }
}

async function connected(): Promise<typeof import("expo-iap") | null> {
  const iap = await store();
  if (!iap) return null;
  try {
    await iap.initConnection();
    return iap;
  } catch {
    return null;
  }
}

/** BOTH localized store prices ("CHF 12.00" / "CHF 15.00"), or nulls
 *  offline / before the products exist. The paywall prefers these over the
 *  hardcoded fallbacks — and strikes the full price through next to the
 *  early one, so the trial discount reads as real in every country. */
export async function fullKeelPrices(): Promise<{
  early: string | null;
  full: string | null;
}> {
  try {
    const iap = await connected();
    if (!iap) return { early: null, full: null };
    const products = await iap.fetchProducts({
      skus: [FULL_KEEL_EARLY_PRODUCT_ID, FULL_KEEL_PRODUCT_ID],
      type: "in-app",
    });
    const priceOf = (sku: string) =>
      (products ?? []).find((p) => p.id === sku)?.displayPrice ?? null;
    return {
      early: priceOf(FULL_KEEL_EARLY_PRODUCT_ID),
      full: priceOf(FULL_KEEL_PRODUCT_ID),
    };
  } catch {
    return { early: null, full: null };
  }
}

/** The one purchase, at the price `state` earns. Ownership flips via
 *  setFullKeel(true), so every screen updates through the entitlement
 *  store. Resolves when the StoreKit flow settles either way. */
export async function buyFullKeel(state: TrialState): Promise<PurchaseOutcome> {
  const iap = await connected();
  if (!iap) return "unavailable";
  const sku = fullKeelSku(state);
  return new Promise<PurchaseOutcome>((resolve) => {
    let settled = false;
    const settle = (outcome: PurchaseOutcome) => {
      if (settled) return;
      settled = true;
      updated.remove();
      failed.remove();
      resolve(outcome);
    };
    const updated = iap.purchaseUpdatedListener((purchase) => {
      void (async () => {
        try {
          // Non-consumable: acknowledge, then unlock. If finishing throws
          // after a real charge, restore remains the safety net.
          await iap.finishTransaction({ purchase, isConsumable: false });
        } catch {
          // The unlock below still stands; the queue retries on relaunch.
        }
        await setFullKeel(true);
        settle("purchased");
      })();
    });
    const failed = iap.purchaseErrorListener((error) => {
      const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
      settle(text.includes("cancel") ? "cancelled" : "failed");
    });
    iap.requestPurchase({ request: { apple: { sku } }, type: "in-app" }).catch(() => {
      settle("failed");
    });
  });
}

/** Reinstall / new device / Family Sharing: adopt an existing purchase of
 *  EITHER product. App Review expects this button next to any paywall. */
export async function restoreFullKeel(): Promise<RestoreOutcome> {
  const iap = await connected();
  if (!iap) return "unavailable";
  try {
    const purchases = await iap.getAvailablePurchases();
    const owned = purchases.some(
      (p) => p.productId === FULL_KEEL_PRODUCT_ID || p.productId === FULL_KEEL_EARLY_PRODUCT_ID,
    );
    if (owned) {
      await setFullKeel(true);
      return "restored";
    }
    return "none";
  } catch {
    return "failed";
  }
}
