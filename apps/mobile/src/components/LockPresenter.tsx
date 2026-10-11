// The "clear screen at expiry" (PROJECT_BRIEF §7.3): the FIRST time the app
// is seen locked (launch after day 45, or expiry crossing while open), the
// locked sheet presents itself, exactly once, never a nag. It lives inside
// the app-state tree so it can respect one rule the root layout could not:
// an EMPTY app is never greeted with a paywall. A reinstall after an old
// trial lands on the normal empty screen; the sheet waits for the first
// commitment (where the write gate shows it anyway).

import { useRouter } from "expo-router";
import { useEffect } from "react";

import { onEntitlementChange, shouldPresentLockOnce } from "../lib/entitlement";
import { useAppData } from "../state/app-state";

export function LockPresenter() {
  const router = useRouter();
  const { items } = useAppData();
  const hasData = items.length > 0;

  useEffect(() => {
    if (!hasData) return;
    const present = () =>
      void shouldPresentLockOnce().then((should) => {
        if (should) router.push("/locked");
      });
    present();
    return onEntitlementChange(present);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasData]);

  return null;
}
