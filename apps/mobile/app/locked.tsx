// The locked state (PROJECT_BRIEF §7.3): the 45-day trial is over and Full
// Keel isn't owned. A CALM explanation, not a wall: what still works (your
// data, the charts, mark paid, export), what the one-time purchase unlocks,
// and the export right here — the data is never hostage. Every write gate
// in the app lands here (lock-gate.ts).

import { today } from "@keel/core";
import { File, Paths } from "expo-file-system";
import { useFocusEffect, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { SymbolView } from "expo-symbols";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";

import { FULL_KEEL_PRICE_LATER } from "../src/constants";
import { Button } from "../src/components/ui/Button";
import { useEntitlement } from "../src/lib/entitlement";
import { useAppActions } from "../src/state/app-state";
import { radius, spacing, typography, useTheme, withAlpha, type ThemeColors } from "../src/theme";

export default function LockedScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { exportData } = useAppActions();

  // A purchase can happen ABOVE this screen (the Full Keel sheet pushed from
  // here): once the entitlement unlocks, this wall is stale. Popping on
  // focus (not on change) keeps the "Full Keel is yours" hero undisturbed;
  // the swipe back then lands where the user was before the wall.
  const entitlement = useEntitlement();
  const unlocked = entitlement.hydrated && !entitlement.locked;
  useFocusEffect(
    useCallback(() => {
      if (!unlocked) return;
      if (router.canGoBack()) router.back();
      else router.replace("/(tabs)");
    }, [unlocked, router]),
  );

  // The same export as Settings › iCloud & data — right here, because "you
  // keep your data" must be one tap, not a treasure hunt.
  const exportBackup = async () => {
    try {
      const file = new File(Paths.cache, `keel-backup-${today()}.json`);
      if (file.exists) file.delete();
      file.create();
      file.write(JSON.stringify(exportData(), null, 2));
      try {
        await Sharing.shareAsync(file.uri, { mimeType: "application/json" });
      } finally {
        // The share sheet is done with the file: a full financial dump must
        // not linger in the cache (2026-09-14 security audit).
        if (file.exists) file.delete();
      }
    } catch {
      Alert.alert(t("settings.exportFailTitle"), t("settings.exportFailMsg"));
    }
  };

  // Unlocked and about to pop: an empty beat of the stage, not a flash of
  // the outdated wall mid-transition.
  if (unlocked) return <View style={styles.screen} />;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={styles.hero}>
        <SymbolView name="sailboat.fill" size={40} tintColor={colors.accent} />
        <Text style={styles.title}>{t("trial.lockedTitle")}</Text>
        <Text style={styles.body}>{t("trial.lockedBody")}</Text>
      </View>

      {/* Two honest columns: what never left, what the purchase returns. */}
      <View style={styles.card}>
        <Text style={styles.groupTitle}>{t("trial.keepsTitle")}</Text>
        {([1, 2, 3, 4] as const).map((n) => (
          <View key={n} style={styles.line}>
            <SymbolView name="checkmark.circle.fill" size={16} tintColor={colors.tones.success} />
            <Text style={styles.lineText}>{t(`trial.keeps${n}`)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.groupTitle}>{t("trial.unlocksTitle")}</Text>
        {([1, 2, 3] as const).map((n) => (
          <View key={n} style={styles.line}>
            <SymbolView name="lock.fill" size={16} tintColor={colors.mutedText} />
            <Text style={styles.lineText}>{t(`trial.unlocks${n}`)}</Text>
          </View>
        ))}
      </View>

      <Button
        icon="checkmark.seal.fill"
        label={`${t("fullkeel.cta")} · ${FULL_KEEL_PRICE_LATER}`}
        onPress={() => router.push("/fullkeel")}
      />
      <Button
        variant="secondary"
        icon="square.and.arrow.up"
        label={t("settings.exportBackup")}
        onPress={() => void exportBackup()}
      />

      <Text style={styles.footnote}>{t("trial.lockedFootnote")}</Text>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: "transparent" },
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
    hero: {
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: withAlpha(colors.accent, 0.12),
      borderWidth: 1,
      borderColor: withAlpha(colors.accent, 0.45),
      borderRadius: radius.xl,
      padding: spacing.lg,
    },
    title: { fontSize: 24, fontWeight: "700", color: colors.text, textAlign: "center" },
    body: { ...typography.body, color: colors.text, textAlign: "center", lineHeight: 22 },
    card: {
      backgroundColor: colors.material,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: radius.xl,
      padding: spacing.md,
      gap: spacing.sm,
    },
    groupTitle: { ...typography.label, color: colors.text },
    line: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    lineText: { ...typography.body, color: colors.text, flex: 1 },
    footnote: {
      ...typography.caption,
      color: colors.mutedText,
      textAlign: "center",
      lineHeight: 18,
    },
  });
}
