// Full Keel: the one-time supporter purchase. The pitch is honesty itself:
// everything you already use stays free for everyone, this unlocks the fast
// lane (unlimited AI reads + every future premium feature) and doubles as
// the thank-you. Until StoreKit is wired (dev-build era), the CTA explains
// that purchases arrive with the App Store release; the debug switch in
// Settings flips ownership for testing.

import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";

import { FULL_KEEL_PRICE, FULL_KEEL_PRICE_LATER } from "../src/constants";
import { Button } from "../src/components/ui/Button";
import { Sheen } from "../src/components/ui/Sheen";
import { useEntitlement } from "../src/lib/entitlement";
import { radius, spacing, typography, useTheme, withAlpha, type ThemeColors } from "../src/theme";

export default function FullKeelScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { full } = useEntitlement();
  const [cardWidth, setCardWidth] = useState(0);

  const buy = () =>
    Alert.alert(t("fullkeel.soonTitle"), t("fullkeel.soonMsg"), [{ text: t("common.done") }]);

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
        {cardWidth > 0 && <Sheen width={cardWidth} color={colors.accentStrong} />}
        {full ? (
          <>
            <SymbolView name="checkmark.seal.fill" size={34} tintColor={colors.accentStrong} />
            <Text style={styles.heroPrice}>{t("fullkeel.ownedTitle")}</Text>
            <Text style={styles.heroNote}>{t("fullkeel.ownedBody")}</Text>
          </>
        ) : (
          <>
            <SymbolView name="sailboat.fill" size={34} tintColor={colors.accentStrong} />
            <Text style={styles.heroPrice}>{FULL_KEEL_PRICE}</Text>
            <Text style={styles.heroTag}>{t("fullkeel.priceTag")}</Text>
            <Text style={styles.heroNote}>
              {t("fullkeel.priceNote", { later: FULL_KEEL_PRICE_LATER })}
            </Text>
          </>
        )}
      </View>

      <View style={styles.list}>
        {(["includeAi", "includeFuture", "includeFamily"] as const).map((key) => (
          <View key={key} style={styles.listRow}>
            <SymbolView name="checkmark.circle.fill" size={18} tintColor={colors.accentStrong} />
            <Text style={styles.listText}>{t(`fullkeel.${key}`)}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.honesty}>{t("fullkeel.honesty")}</Text>

      {!full && (
        <Button
          label={`${t("fullkeel.cta")} · ${FULL_KEEL_PRICE}`}
          onPress={buy}
          style={styles.cta}
        />
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
      borderColor: withAlpha(colors.accentStrong, 0.35),
      borderRadius: radius.xl,
      paddingVertical: spacing.xl,
      paddingHorizontal: spacing.md,
      overflow: "hidden",
    },
    heroOwned: {
      borderColor: withAlpha(colors.accentStrong, 0.55),
    },
    heroPrice: { ...typography.display, color: colors.text, marginTop: spacing.sm },
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
    list: { gap: spacing.sm, paddingHorizontal: spacing.xs },
    listRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    listText: { ...typography.body, color: colors.text, flex: 1 },
    honesty: {
      ...typography.caption,
      color: colors.mutedText,
      lineHeight: 18,
      paddingHorizontal: spacing.xs,
    },
    cta: { alignSelf: "stretch" },
  });
}
