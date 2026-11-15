// The one quiet, clearly OPTIONAL nudge to lock the app: a card the Payments
// screen shows once, after onboarding and a first real item. Self-contained:
// probes what the device can lock with, flips the setting via the OS prompt,
// and renders nothing when the device can't lock at all or the lock is on.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { type StyleProp, type ViewStyle } from "react-native";

import {
  authenticate,
  getAuthKind,
  setAppLockEnabled,
  useAppLockConfig,
  type AuthKind,
} from "../../lib/app-lock";
import { NudgeCard } from "../ui/NudgeCard";

interface Props {
  /** Adds a ✕ to the card: "not now". The caller decides what that retires. */
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function LockNudge({ onDismiss, style }: Props) {
  const { t } = useTranslation();

  const [kind, setKind] = useState<AuthKind | null>(null);
  const { enabled: on } = useAppLockConfig();
  useEffect(() => {
    void getAuthKind().then(setKind);
  }, []);

  // Authenticate on the way IN so enabling can never lock the user out.
  const enable = async () => {
    const ok = await authenticate(t("applock.confirmPrompt"));
    if (!ok) return;
    await setAppLockEnabled(true);
  };

  if (on || kind === null || kind === "unavailable") return null;

  const label =
    kind === "faceId"
      ? t("applock.lockFaceId")
      : kind === "touchId"
        ? t("applock.lockTouchId")
        : t("applock.lockGeneric");

  return (
    <NudgeCard
      icon="faceid"
      title={label}
      body={t("onboarding.lockBody")}
      cta={t("onboarding.lockCta")}
      onPress={() => void enable()}
      onDismiss={onDismiss}
      style={style}
    />
  );
}
