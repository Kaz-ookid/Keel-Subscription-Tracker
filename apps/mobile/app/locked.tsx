// The locked state (PROJECT_BRIEF §7.3): the 45-day trial is over and Full
// Keel isn't owned. A CALM explanation, not a wall: what still works (your
// data, the charts, mark paid, export), what the one-time purchase unlocks,
// and the export right here — the data is never hostage. Every write gate
// in the app lands here (lock-gate.ts).

import { useFocusEffect, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Button } from "../src/components/ui/Button";
import { showExportChoices } from "../src/lib/data-files";
import { useEntitlement } from "../src/lib/entitlement";
import { useFullKeelPrices } from "../src/lib/purchases";
import { useAppActions } from "../src/state/app-state";
import {
  radius,
  spacing,
  type ThemeColors,
  typography,
  useStyles,
  useTheme,
  withAlpha,
} from "../src/theme";

export default function LockedScreen() {
  const router = useRouter();
  const { colors, scheme } = useTheme();
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const { exportData } = useAppActions();
  const prices = useFullKeelPrices();

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
        <Text style={styles.title} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>
          {t("trial.lockedTitle")}
        </Text>
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
        // Live-or-nothing: the store's own price when it has answered,
        // plain CTA otherwise (the paywall shows it either way).
        label={prices.full === null ? t("fullkeel.cta") : `${t("fullkeel.cta")} · ${prices.full}`}
        onPress={() => router.push("/fullkeel")}
      />
      <Button
        variant="secondary"
        icon="square.and.arrow.up"
        // The same export as Settings › iCloud & data, right here, because
        // "you keep your data" must be one tap, not a treasure hunt.
        label={t("settings.export")}
        onPress={() => showExportChoices(exportData, scheme)}
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
