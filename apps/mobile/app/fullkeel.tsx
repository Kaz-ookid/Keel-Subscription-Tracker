// Full Keel: the one-time purchase (PROJECT_BRIEF §7.3). The pitch is
// honesty itself: your data and charts stay yours forever, this returns the
// working tools once the 45-day trial ends, and nothing ever renews. TWO
// prices, one mechanism: 12 CHF while YOUR trial still runs (deciding early
// is rewarded), 15 CHF after. The live localized store price leads when
// StoreKit can supply it; the constants are the offline fallback. On
// binaries without StoreKit (Expo Go, old dev clients) buying explains
// itself instead of failing; the Settings debug switch stays the tester
// escape hatch.

import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";

import { FULL_KEEL_PRICE, FULL_KEEL_PRICE_LATER } from "../src/constants";
import { Button } from "../src/components/ui/Button";
import { Sheen } from "../src/components/ui/Sheen";
import { useAiHidden } from "../src/lib/ai-visibility";
import { useEntitlement } from "../src/lib/entitlement";
import { buyFullKeel, fullKeelPrices, restoreFullKeel } from "../src/lib/purchases";
import { radius, spacing, typography, useTheme, withAlpha, type ThemeColors } from "../src/theme";

export default function FullKeelScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const entitlement = useEntitlement();
  const full = entitlement.owned;
  const [cardWidth, setCardWidth] = useState(0);
  const [busy, setBusy] = useState(false);
  // The store's own localized prices, when it can answer; fallback constants
  // otherwise. Both are fetched so the full price can sit struck-through
  // next to the early one — the discount stays true in every country.
  const [livePrices, setLivePrices] = useState<{ early: string | null; full: string | null }>({
    early: null,
    full: null,
  });
  const aiHidden = useAiHidden();

  const earlyPrice = entitlement.state !== "expired";
  const laterPrice = livePrices.full ?? FULL_KEEL_PRICE_LATER;
  const price = earlyPrice ? (livePrices.early ?? FULL_KEEL_PRICE) : laterPrice;

  useEffect(() => {
    let alive = true;
    void fullKeelPrices().then((resolved) => {
      if (alive) setLivePrices(resolved);
    });
    return () => {
      alive = false;
    };
  }, []);

  const buy = async () => {
    setBusy(true);
    const outcome = await buyFullKeel(entitlement.state);
    setBusy(false);
    if (outcome === "failed") {
      Alert.alert(t("fullkeel.buyFailTitle"), t("fullkeel.buyFailMsg"));
    } else if (outcome === "unavailable") {
      // Expo Go / a build without StoreKit: say so instead of a dead button.
      Alert.alert(t("fullkeel.soonTitle"), t("fullkeel.soonMsg"), [{ text: t("common.done") }]);
    }
    // "purchased" needs no dialog: the owned hero takes over the screen.
  };

  const restore = async () => {
    setBusy(true);
    const outcome = await restoreFullKeel();
    setBusy(false);
    if (outcome === "none") {
      Alert.alert(t("fullkeel.restoreNoneTitle"), t("fullkeel.restoreNoneMsg"));
    } else if (outcome === "failed" || outcome === "unavailable") {
      Alert.alert(t("fullkeel.buyFailTitle"), t("fullkeel.buyFailMsg"));
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Text style={styles.largeTitle}>{t("fullkeel.title")}</Text>
      <Text style={styles.subtitle}>{t("fullkeel.subtitle")}</Text>

      {/* The glass hero: price (or ownership), with the light sweeping by. */}
      <View
        style={[styles.hero, full && styles.heroOwned]}
        onLayout={(e) => setCardWidth(e.nativeEvent.layout.width)}
      >
        {cardWidth > 0 && <Sheen width={cardWidth} color={colors.accent} />}
        {full ? (
          <>
            <SymbolView name="checkmark.seal.fill" size={34} tintColor={colors.accent} />
            <Text style={styles.heroPrice}>{t("fullkeel.ownedTitle")}</Text>
            <Text style={styles.heroNote}>{t("fullkeel.ownedBody")}</Text>
          </>
        ) : (
          <>
            <SymbolView name="sailboat.fill" size={34} tintColor={colors.accent} />
            {/* While the buyer's trial runs, the FULL price sits struck
                through next to the early one — the discount is visibly a
                real sale, in the store's own currency. */}
            <View style={styles.priceRow}>
              <Text style={styles.heroPrice}>{price}</Text>
              {earlyPrice && <Text style={styles.strikePrice}>{laterPrice}</Text>}
            </View>
            <Text style={styles.heroTag}>
              {earlyPrice ? t("fullkeel.priceTag") : t("fullkeel.priceTagLater")}
            </Text>
            <Text style={styles.heroNote}>
              {earlyPrice
                ? t("fullkeel.priceNote", { later: laterPrice })
                : t("fullkeel.priceNoteLater")}
            </Text>
            {/* Family Sharing deserves hero billing, not just a list row:
                one purchase covering five people changes the price's story. */}
            <Text style={styles.heroNote}>{t("fullkeel.familyNote")}</Text>
            {entitlement.state === "trial" && (
              <Text style={styles.countdown}>
                {t("trial.daysLeft", { count: entitlement.daysLeft })}
              </Text>
            )}
          </>
        )}
      </View>

      <View style={styles.list}>
        {(["includeTools", "includeAi", "includeFuture", "includeFamily"] as const)
          .filter((key) => !(aiHidden && key === "includeAi"))
          .map((key) => (
            <View key={key} style={styles.listRow}>
              <SymbolView name="checkmark.circle.fill" size={18} tintColor={colors.accent} />
              <Text style={styles.listText}>{t(`fullkeel.${key}`)}</Text>
            </View>
          ))}
      </View>

      <Text style={styles.honesty}>{t("fullkeel.honesty")}</Text>

      {!full && busy && (
        <View style={styles.busyRow}>
          <ActivityIndicator color={colors.accent} />
        </View>
      )}
      {!full && !busy && (
        <>
          <Button
            label={`${t("fullkeel.cta")} · ${price}`}
            onPress={() => void buy()}
            style={styles.cta}
          />
          {/* App Review expects a restore affordance next to every paywall. */}
          <Button
            variant="secondary"
            label={t("fullkeel.restore")}
            onPress={() => void restore()}
            style={styles.cta}
          />
        </>
      )}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: "transparent" },
    content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
    largeTitle: { fontSize: 34, fontWeight: "700", color: colors.text },
    subtitle: { ...typography.body, color: colors.mutedText, marginTop: -spacing.sm },
    hero: {
      alignItems: "center",
      gap: spacing.xs,
      backgroundColor: colors.material,
      borderWidth: 1,
      borderColor: withAlpha(colors.accent, 0.35),
      borderRadius: radius.xl,
      paddingVertical: spacing.xl,
      paddingHorizontal: spacing.md,
      overflow: "hidden",
    },
    heroOwned: {
      borderColor: withAlpha(colors.accent, 0.55),
    },
    priceRow: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    heroPrice: { ...typography.display, color: colors.text },
    strikePrice: {
      ...typography.label,
      color: colors.mutedText,
      textDecorationLine: "line-through",
    },
    heroTag: {
      ...typography.caption,
      fontWeight: "600",
      color: colors.accent,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    heroNote: {
      ...typography.caption,
      color: colors.mutedText,
      textAlign: "center",
      lineHeight: 18,
    },
    countdown: {
      ...typography.caption,
      fontWeight: "600",
      color: colors.tones.warning,
    },
    list: { gap: spacing.sm, paddingHorizontal: spacing.xs },
    listRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    listText: { ...typography.body, color: colors.text, flex: 1 },
    honesty: {
      ...typography.caption,
      color: colors.mutedText,
      lineHeight: 18,
      paddingHorizontal: spacing.xs,
    },
    busyRow: { alignItems: "center", paddingVertical: spacing.md },
    cta: { alignSelf: "stretch" },
  });
}
