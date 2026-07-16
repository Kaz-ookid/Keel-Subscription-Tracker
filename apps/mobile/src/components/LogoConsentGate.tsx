// Drop-in that surfaces the first-run logo-consent prompt on any screen that
// shows brand logos (the brand bank, the AI review). It renders nothing once
// the user has chosen, or before the stored choice has hydrated. Dismissing
// without choosing hides it until the surface remounts — the prompt still
// returns on the next logo surface, so the choice is never silently defaulted.

import { useState } from "react";

import { setLogoConsent, useLogoConsent } from "../lib/logo-consent";
import { LogoConsentSheet } from "./LogoConsentSheet";

export function LogoConsentGate() {
  const { status, hydrated } = useLogoConsent();
  const [dismissed, setDismissed] = useState(false);
  const visible = hydrated && status === "unset" && !dismissed;
  return (
    <LogoConsentSheet
      visible={visible}
      onChoose={setLogoConsent}
      onDismiss={() => setDismissed(true)}
    />
  );
}
