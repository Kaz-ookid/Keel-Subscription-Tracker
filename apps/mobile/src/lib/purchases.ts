// The Full Keel purchase bridge — DORMANT until the dev-build era (nothing
// imports this file yet; Expo Go has no StoreKit, so every function below
// answers "unavailable" there and the paywall keeps its coming-soon alert).
//
// Everything downstream already exists: the entitlement store, the 2-read
// meter, the paywall (app/fullkeel.tsx) and the Settings debug switch. On a
// successful purchase or restore this module only has to call
// setFullKeel(true) and the whole app lights up (entitlement.ts documents
// exactly that contract). One non-consumable product, no subscriptions.
//
// WIRING (dev-build era) — BACKLOG "Dev-build era unlocks" #10:
//   1. npx expo install expo-iap (and its config plugin in app.json if the
//      installed version ships one).
//   2. Delete the @ts-expect-error below and check the structural type
//      against the installed version's API (written blind; expect renames).
//   3. App Store Connect: create the non-consumable with EXACTLY the
//      product id below, launch price tier for 10 CHF (15 CHF later per
//      PROJECT_BRIEF §7.3), ENABLE Family Sharing on the product, and
//      enroll in the Small Business Program for the 15% rate.
//   4. app/fullkeel.tsx: replace the coming-soon alert in buy() with
//      buyFullKeel() (busy state on the CTA, alert only on "failed");
//      add a quiet "Restore purchases" text button under the CTA calling
//      restoreFullKeel() (App Review looks for it); optionally show
//      fullKeelDisplayPrice() instead of the hardcoded FULL_KEEL_PRICE
//      once it resolves, so the price is always the store's truth.
//   5. On-device QA (sandbox tester account): buy, relaunch (owned view
//      persists), delete + reinstall + restore, Family Sharing on a second
//      account, airplane-mode failure paths.

import { setFullKeel } from "./entitlement";

/** Must match the App Store Connect product id exactly (wiring step 3). */
export const FULL_KEEL_PRODUCT_ID = "com.keel.app.fullkeel";

export type PurchaseOutcome = "purchased" | "cancelled" | "failed" | "unavailable";
export type RestoreOutcome = "restored" | "none" | "failed" | "unavailable";

/** The lazy native door. Structural type only; verify at wiring step 2. */
async function store(): Promise<{
  initConnection(): Promise<boolean>;
  getProducts(skus: string[]): Promise<{ productId: string; displayPrice?: string }[]>;
  requestPurchase(request: { sku: string }): Promise<unknown>;
  getAvailablePurchases(): Promise<{ productId: string }[]>;
  finishTransaction(args: { purchase: unknown; isConsumable: boolean }): Promise<void>;
} | null> {
  try {
    // Lazy so the native module is only touched where it exists.
    // @ts-expect-error dormant dependency, installed in the dev-build era
    return await import("expo-iap");
  } catch {
    return null; // Expo Go / package missing: purchases simply stay off.
  }
}

/** The store's own localized price ("CHF 10.00"), or null before wiring /
 *  offline. The paywall can prefer this over the hardcoded display price. */
export async function fullKeelDisplayPrice(): Promise<string | null> {
  try {
    const iap = await store();
    if (!iap || !(await iap.initConnection())) return null;
    const products = await iap.getProducts([FULL_KEEL_PRODUCT_ID]);
    return products.find((p) => p.productId === FULL_KEEL_PRODUCT_ID)?.displayPrice ?? null;
  } catch {
    return null;
  }
}

/** The one purchase. Ownership flips via setFullKeel(true) on success, so
 *  every screen updates through the entitlement store. */
export async function buyFullKeel(): Promise<PurchaseOutcome> {
  const iap = await store();
  if (!iap) return "unavailable";
  try {
    if (!(await iap.initConnection())) return "unavailable";
  } catch {
    return "unavailable";
  }
  try {
    const purchase = await iap.requestPurchase({ sku: FULL_KEEL_PRODUCT_ID });
    // Non-consumable: acknowledge, then unlock. If finishing throws after a
    // real charge, restore remains the safety net.
    await iap.finishTransaction({ purchase, isConsumable: false });
    await setFullKeel(true);
    return "purchased";
  } catch (error) {
    // User-cancelled flows surface as an error code, not a result; treat
    // anything that names cancellation as a quiet non-event.
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("cancel")) return "cancelled";
    return "failed";
  }
}

/** Reinstall / new device / Family Sharing: adopt an existing purchase.
 *  App Review expects this button to exist next to any paywall. */
export async function restoreFullKeel(): Promise<RestoreOutcome> {
  const iap = await store();
  if (!iap) return "unavailable";
  try {
    if (!(await iap.initConnection())) return "unavailable";
  } catch {
    return "unavailable";
  }
  try {
    const purchases = await iap.getAvailablePurchases();
    if (purchases.some((p) => p.productId === FULL_KEEL_PRODUCT_ID)) {
      await setFullKeel(true);
      return "restored";
    }
    return "none";
  } catch {
    return "failed";
  }
}
