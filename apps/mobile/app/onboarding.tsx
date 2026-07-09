// First-launch onboarding: a three-pane tour of what the app is for, then the
// method step — three doors into a filled-in app (pick from the brand bank,
// import with AI, or just start using the + button), each one line of
// hand-holding. Also reachable any time from Settings with ?mode=browse,
// which skips straight to the picker.

import { SUGGESTED_COMMITMENTS, type SuggestedCommitment } from "@keel/core";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SuggestionPicker } from "../src/components/SuggestionPicker";
import { markOnboardingSeen } from "../src/lib/onboarding";
import { useAppState } from "../src/state/app-state";
import { spacing, radius, typography, useTheme, type ThemeColors } from "../src/theme";

const SCREEN_WIDTH = Dimensions.get("window").width;

const TOUR_PANES = [
  { titleKey: "onboarding.tour1Title", bodyKey: "onboarding.tour1Body" },
  { titleKey: "onboarding.tour2Title", bodyKey: "onboarding.tour2Body" },
  { titleKey: "onboarding.tour3Title", bodyKey: "onboarding.tour3Body" },
] as const;

type Phase = "tour" | "method" | "pick" | "done";

export default function OnboardingScreen() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items, pending, addPendingSuggestions } = useAppState();

  const [phase, setPhase] = useState<Phase>(mode === "browse" ? "pick" : "tour");
  const [pane, setPane] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const pagerRef = useRef<ScrollView>(null);

  // Tracked/pending entries stay visible but greyed ("already in your list")
  // — hiding them made the bank look like it was missing obvious brands.
  const addedIds = useMemo(() => {
    const taken = new Set(items.map((i) => i.name.trim().toLowerCase()));
    return new Set(
      SUGGESTED_COMMITMENTS.filter(
        (s) => taken.has(s.name.toLowerCase()) || pending.some((p) => p.id === s.id),
      ).map((s) => s.id),
    );
  }, [items, pending]);
  const remaining = SUGGESTED_COMMITMENTS.length - addedIds.size;

  const finish = () => {
    void markOnboardingSeen();
    router.back();
  };

  // The AI door: onboarding is done its job — hand over to the import hub.
  const goImport = () => {
    void markOnboardingSeen();
    router.replace("/import");
  };

  const onAdd = (selected: SuggestedCommitment[]) => {
    addPendingSuggestions(selected);
    setSavedCount(selected.length);
    setPhase("done");
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {phase === "tour" && (
        <>
          <View style={styles.topBar}>
            <Pressable onPress={() => setPhase("method")} hitSlop={12}>
              <Text style={styles.skip}>{t("onboarding.skip")}</Text>
            </Pressable>
          </View>
          <ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) =>
              setPane(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH))
            }
          >
            {TOUR_PANES.map((p) => (
              <View key={p.titleKey} style={styles.pane}>
                <Text style={styles.paneTitle}>{t(p.titleKey)}</Text>
                <Text style={styles.paneBody}>{t(p.bodyKey)}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={styles.dots}>
            {TOUR_PANES.map((p, i) => (
              <View key={p.titleKey} style={[styles.dot, i === pane && styles.dotActive]} />
            ))}
          </View>
          <Pressable
            style={styles.cta}
            onPress={() => {
              if (pane < TOUR_PANES.length - 1) {
                pagerRef.current?.scrollTo({ x: (pane + 1) * SCREEN_WIDTH, animated: true });
                setPane(pane + 1);
              } else {
                setPhase("method");
              }
            }}
          >
            <Text style={styles.ctaText}>
              {pane < TOUR_PANES.length - 1 ? t("onboarding.next") : t("onboarding.continue")}
            </Text>
          </Pressable>
        </>
      )}

      {phase === "method" && (
        <View style={styles.methodPane}>
          <Text style={styles.paneTitle}>{t("onboarding.methodTitle")}</Text>
          <MethodDoor
            icon="rectangle.stack.fill"
            title={t("onboarding.methodPick")}
            sub={t("onboarding.methodPickSub")}
            onPress={() => setPhase("pick")}
            styles={styles}
            colors={colors}
          />
          <MethodDoor
            icon="sparkles"
            title={t("onboarding.methodAI")}
            sub={t("onboarding.methodAISub")}
            onPress={goImport}
            styles={styles}
            colors={colors}
          />
          <MethodDoor
            icon="square.and.pencil"
            title={t("onboarding.methodManual")}
            sub={t("onboarding.methodManualSub")}
            onPress={finish}
            styles={styles}
            colors={colors}
          />
          <Text style={styles.methodNote}>{t("onboarding.methodNote")}</Text>
        </View>
      )}

      {phase === "pick" &&
        (remaining > 0 ? (
          <>
            <View style={styles.pickHeader}>
              <Text style={styles.pickTitle}>{t("onboarding.pickTitle")}</Text>
              <Pressable onPress={finish} hitSlop={12}>
                <Text style={styles.skip}>{t("onboarding.skip")}</Text>
              </Pressable>
            </View>
            <SuggestionPicker
              suggestions={SUGGESTED_COMMITMENTS}
              addedIds={addedIds}
              onAdd={onAdd}
            />
          </>
        ) : (
          <View style={styles.pane}>
            <Text style={styles.paneTitle}>{t("onboarding.caughtUpTitle")}</Text>
            <Text style={styles.paneBody}>{t("onboarding.caughtUpBody")}</Text>
            <Pressable style={styles.cta} onPress={finish}>
              <Text style={styles.ctaText}>{t("onboarding.done")}</Text>
            </Pressable>
          </View>
        ))}

      {phase === "done" && (
        <View style={styles.pane}>
          <Text style={styles.paneTitle}>
            {savedCount > 0
              ? t("onboarding.savedTitle", { count: savedCount })
              : t("onboarding.allSetTitle")}
          </Text>
          <Text style={styles.paneBody}>
            {savedCount > 0 ? t("onboarding.savedBody") : t("onboarding.allSetBody")}
          </Text>
          <Pressable style={styles.cta} onPress={finish}>
            <Text style={styles.ctaText}>{t("onboarding.done")}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function MethodDoor({
  icon,
  title,
  sub,
  onPress,
  styles,
  colors,
}: {
  icon: string;
  title: string;
  sub: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
}) {
  return (
    <Pressable style={styles.methodCard} onPress={onPress}>
      <SymbolView name={icon as never} size={24} tintColor={colors.accent} />
      <View style={styles.methodTexts}>
        <Text style={styles.methodTitle}>{title}</Text>
        <Text style={styles.methodSub}>{sub}</Text>
      </View>
      <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    topBar: {
      flexDirection: "row",
      justifyContent: "flex-end",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    skip: {
      ...typography.label,
      color: colors.mutedText,
    },
    pickHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    pickTitle: {
      ...typography.subtitle,
      fontWeight: "700",
      color: colors.text,
      flexShrink: 1,
    },
    pane: {
      width: SCREEN_WIDTH,
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
    methodPane: {
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: spacing.lg,
      gap: spacing.md,
    },
    methodCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
    },
    methodTexts: { flex: 1, gap: 2 },
    methodTitle: { ...typography.label, color: colors.text, fontSize: 17 },
    methodSub: { ...typography.caption, color: colors.mutedText, lineHeight: 18 },
    methodNote: {
      ...typography.caption,
      color: colors.mutedText,
      textAlign: "center",
      paddingTop: spacing.sm,
    },
    dots: {
      flexDirection: "row",
      justifyContent: "center",
      gap: spacing.sm,
      paddingVertical: spacing.md,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.border,
    },
    dotActive: {
      backgroundColor: colors.navy,
    },
    cta: {
      backgroundColor: colors.navy,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xl,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.lg,
      alignItems: "center",
      alignSelf: "stretch",
    },
    ctaText: {
      ...typography.label,
      color: colors.white,
    },
  });
}
