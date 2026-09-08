// The widgets' landing pad: keel://upcoming resolves here and immediately
// swings to Payments › Upcoming (the tabReset request the Payments screen
// already consumes on focus). No UI of its own — a pure redirect.
//
// COLLAPSES the stack instead of redirecting: a warm widget tap used to
// <Redirect href="/">, which REPLACED this screen with a fresh "(tabs)"
// instance on top of the existing one — every widget tap stacked another
// copy, and swiping back walked down through them. Dismissing to the
// stack's first screen (the real tabs) leaves nothing behind.

import { useRouter } from "expo-router";
import { useEffect, useState } from "react";

import { requestPaymentsView } from "../src/lib/tabReset";

export default function UpcomingDeepLink() {
  const router = useRouter();
  // Set the request once, before the tabs land and Payments consumes it.
  useState(() => {
    requestPaymentsView("upcoming");
    return true;
  });
  useEffect(() => {
    // Warm open: pop everything back to the existing tabs. Cold open (this
    // route is the whole stack): swap it for the tabs instead.
    if (router.canDismiss()) router.dismissAll();
    else router.replace("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
