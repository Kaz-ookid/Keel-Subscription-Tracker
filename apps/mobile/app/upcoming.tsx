// The widgets' landing pad: keel://upcoming resolves here and immediately
// swings to Payments › Upcoming (the tabReset request the Payments screen
// already consumes on focus). No UI of its own — a pure redirect.

import { Redirect } from "expo-router";
import { useState } from "react";

import { requestPaymentsView } from "../src/lib/tabReset";

export default function UpcomingDeepLink() {
  // Set the request once, before the redirect lands and Payments consumes it.
  useState(() => {
    requestPaymentsView("upcoming");
    return true;
  });
  return <Redirect href="/" />;
}
