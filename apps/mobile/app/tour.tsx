// "Discover Keel": the four slides on what Keel does, opened from the card
// Settings offers once after a first launch. They used to stand between a
// new user and a first item; now they are an offer. The last slide hands
// over to "What Keel can do", which replaces this screen: back from there
// returns to Settings.

import { useRouter } from "expo-router";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LightField } from "../src/components/onboarding/LightField";
import { Dot, TourPane } from "../src/components/onboarding/TourElements";
import { Button } from "../src/components/ui/Button";
import { usePager } from "../src/components/ui/usePager";
import { useAiHidden } from "../src/lib/ai-visibility";
import { spacing, type ThemeColors, typography, useStyles, useTheme } from "../src/theme";

// Titles 1 to 3 are the first-launch screen's three lines.
const PANES = [
  { titleKey: "onboarding.line1", bodyKey: "tour.body1" },
  { titleKey: "onboarding.line2", bodyKey: "tour.body2" },
  { titleKey: "onboarding.line3", bodyKey: "tour.body3" },
  { titleKey: "tour.title4", bodyKey: "tour.body4" },
] as const;

export default function TourScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // The last slide is about the AI import: the hard AI lock hides it.
  const aiHidden = useAiHidden();
  const panes = aiHidden ? PANES.slice(0, 3) : PANES;

  const ref = useRef<ScrollView>(null);
  const pager = usePager({ ref, pageWidth: width, pageCount: panes.length });
  const last = pager.page === panes.length - 1;

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      <LightField accent={colors.accentStrong} />
      <ScrollView ref={ref} {...pager.scrollProps}>
        {panes.map((p, i) => (
          <TourPane
            key={p.titleKey}
            index={i}
            progress={pager.progress}
            title={t(p.titleKey)}
            body={t(p.bodyKey)}
            paneStyle={[styles.pane, { width }]}
            titleStyle={styles.paneTitle}
            bodyStyle={styles.paneBody}
          />
        ))}
      </ScrollView>
      <View style={styles.dots}>
        {panes.map((p, i) => (
          <Dot key={p.titleKey} index={i} progress={pager.progress} style={styles.dot} />
        ))}
      </View>
      <Button
        label={last ? t("guide.title") : t("tour.next")}
        onPress={() => (last ? router.replace("/guide") : pager.goTo(pager.page + 1))}
        style={styles.cta}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: "transparent" },
    pane: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.xl,
      gap: spacing.md,
    },
    paneTitle: {
      fontSize: 28,
      fontWeight: "700",
      color: colors.text,
      textAlign: "center",
    },
    paneBody: {
      ...typography.body,
      color: colors.mutedText,
      textAlign: "center",
      lineHeight: 24,
    },
    dots: {
      flexDirection: "row",
      justifyContent: "center",
      gap: spacing.sm,
      paddingVertical: spacing.md,
    },
    // Width and opacity are scroll-driven (see Dot).
    dot: {
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.accent,
    },
    // Layout-only: the look comes from ui/Button.
    cta: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.lg,
      alignSelf: "stretch",
    },
  });
}
