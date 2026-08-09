// The one quiet, clearly OPTIONAL nudge on onboarding's way out: lock the app.
// Self-contained — probes what the device can lock with, flips the setting via
// the OS prompt, and renders nothing when the device can't lock at all. The
// overline says why this card is here; it never blocks the exit.

import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

import {
  authenticate,
  getAuthKind,
  setAppLockEnabled,
  useAppLockConfig,
  type AuthKind,
} from "../../lib/app-lock";
import { radius, spacing, typography, useTheme, type ThemeColors } from "../../theme";
import { Button } from "../ui/Button";

export function LockNudge() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

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

  if (kind === null || kind === "unavailable") return null;

  const label =
    kind === "faceId"
      ? t("applock.lockFaceId")
      : kind === "touchId"
        ? t("applock.lockTouchId")
        : t("applock.lockGeneric");

  return (
    <View style={styles.wrap}>
      <Text style={styles.overline}>{t("onboarding.lockOverline")}</Text>
      <View style={styles.card}>
        <SymbolView
          name={on ? "checkmark.circle.fill" : "faceid"}
          size={24}
          tintColor={on ? colors.tones.success : colors.accent}
        />
        <View style={styles.texts}>
          <Text style={styles.title}>{on ? t("onboarding.lockOn") : label}</Text>
          {!on && <Text style={styles.body}>{t("onboarding.lockBody")}</Text>}
        </View>
        {!on && <Button size="sm" label={t("onboarding.lockCta")} onPress={() => void enable()} />}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      alignSelf: "stretch",
      gap: spacing.xs,
      marginTop: spacing.md,
    },
    overline: {
      ...typography.caption,
      color: colors.mutedText,
      textAlign: "center",
    },
    card: {
      alignSelf: "stretch",
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.material,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.hairline,
      padding: spacing.md,
    },
    texts: { flex: 1, gap: 2 },
    title: { ...typography.label, color: colors.text },
    body: { ...typography.caption, color: colors.mutedText, lineHeight: 17 },
  });
}
