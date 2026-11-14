// The one quiet, clearly OPTIONAL nudge to lock the app: a card the Payments
// screen shows once, after onboarding and a first real item. Self-contained:
// probes what the device can lock with, flips the setting via the OS prompt,
// and renders nothing when the device can't lock at all or the lock is on.

import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import {
  authenticate,
  getAuthKind,
  setAppLockEnabled,
  useAppLockConfig,
  type AuthKind,
} from "../../lib/app-lock";
import { radius, spacing, type ThemeColors, typography, useStyles, useTheme } from "../../theme";
import { Button } from "../ui/Button";

interface Props {
  /** Adds a ✕ to the card: "not now". The caller decides what that retires. */
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function LockNudge({ onDismiss, style }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useStyles(createStyles);

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
    <View style={[styles.card, style]}>
      <SymbolView name="faceid" size={24} tintColor={colors.accent} />
      <View style={styles.texts}>
        <Text style={styles.title}>{label}</Text>
        <Text style={styles.body}>{t("onboarding.lockBody")}</Text>
      </View>
      <Button size="sm" label={t("onboarding.lockCta")} onPress={() => void enable()} />
      {onDismiss && (
        <Pressable accessibilityLabel={t("common.close")} hitSlop={8} onPress={onDismiss}>
          <SymbolView name="xmark" size={13} tintColor={colors.mutedText} />
        </Pressable>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
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
