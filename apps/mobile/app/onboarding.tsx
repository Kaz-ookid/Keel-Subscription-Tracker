// First-launch onboarding: a four-pane tour on the app's own ambient stage
// (scroll-driven parallax, a drifting glow — aura language only, never the
// harbor's), then the method step: doors into a filled-in app (pick from the
// brand bank, import with AI, or just the + button), looping via "Add more"
// until the user says done. Also reachable from Settings with ?mode=browse,
// which skips straight to the picker. The scroll-driven pieces live in
// src/components/onboarding/.

import { SUGGESTED_COMMITMENTS, type SuggestedCommitment } from "@keel/core";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeIn,
  FadeInRight,
  FadeOut,
  FadeOutLeft,
  runOnJS,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Ambient } from "../src/components/Ambient";
import { useAiHidden } from "../src/lib/ai-visibility";
import { LightField } from "../src/components/onboarding/LightField";
import { LockNudge } from "../src/components/onboarding/LockNudge";
import { LogoConsentGate } from "../src/components/LogoConsentGate";
import { MethodDoor } from "../src/components/onboarding/MethodDoor";
import { Dot, TourPane } from "../src/components/onboarding/TourElements";
import { SuggestionPicker } from "../src/components/SuggestionPicker";
import { Button } from "../src/components/ui/Button";
import { OptionWheel } from "../src/components/ui/OptionWheel";
import { APP_LANGUAGES, LANGUAGE_LABELS, setLanguageMode, type AppLanguage } from "../src/i18n";
import { useLocked } from "../src/lib/lock-gate";
import { markOnboardingSeen } from "../src/lib/onboarding";
import { requestPaymentsView } from "../src/lib/tabReset";
import { useAppActions, useAppData } from "../src/state/app-state";
import { spacing, typography, useTheme, type ThemeColors } from "../src/theme";

const SCREEN_WIDTH = Dimensions.get("window").width;

const TOUR_PANES = [
  { titleKey: "onboarding.tour1Title", bodyKey: "onboarding.tour1Body" },
  { titleKey: "onboarding.tour2Title", bodyKey: "onboarding.tour2Body" },
  { titleKey: "onboarding.tour3Title", bodyKey: "onboarding.tour3Body" },
  { titleKey: "onboarding.tour4Title", bodyKey: "onboarding.tour4Body" },
] as const;

type Phase = "tour" | "method" | "pick" | "done";

export default function OnboardingScreen() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const aiHidden = useAiHidden();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items, pending } = useAppData();
  const { addPendingSuggestions } = useAppActions();

  // "browse" (Settings, the pending list) jumps straight to the picker;
  // a plain open is the full first-launch run. (The empty-state Get started
  // button opens the Add sheet directly and never lands here.) Browse ADDS
  // pending commitments, which is a write: locked browse bounces to the
  // locked sheet. First-launch onboarding itself can never be locked (a
  // fresh install has no trial anchor).
  const locked = useLocked();
  useEffect(() => {
    if (locked && mode === "browse") router.replace("/locked");
  }, [locked, mode, router]);
  const [phase, setPhase] = useState<Phase>(mode === "browse" ? "pick" : "tour");
  const [pane, setPane] = useState(0);
  // The pager's live offset drives everything visual: pane parallax, the
  // dots' pill morph, and the aura's drift. One driver, no state races.
  const scrollX = useSharedValue(0);
  const onTourScroll = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });
  useAnimatedReaction(
    () => Math.round(scrollX.value / SCREEN_WIDTH),
    (next, previous) => {
      if (next !== previous && next >= 0 && next < TOUR_PANES.length) runOnJS(setPane)(next);
    },
  );
  const [savedCount, setSavedCount] = useState(0);
  // Set when the AI-import detour actually added items: the done pane then
  // celebrates the import instead of the To-complete queue.
  const [importedCount, setImportedCount] = useState(0);
  // What the LAST batch was: the done pane recaps it, and its "Add more"
  // loops back to the method step, re-worded now that something is in.
  const [lastAdd, setLastAdd] = useState<"pick" | "import" | null>(null);
  const pagerRef = useAnimatedRef<Animated.ScrollView>();

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

  // Language, offered on the very first screen: onboarding happens once, so
  // reading it in the wrong language wastes the one tour the user gets. The
  // globe shows the CURRENT language and opens the same wheel Settings has.
  const currentLanguage: AppLanguage = APP_LANGUAGES.find((l) => l === i18n.language) ?? "en";
  const [langWheel, setLangWheel] = useState(false);

  const finish = () => {
    // Whatever the tour added lives under All: close onto it, so the first
    // real screen shows their own list instead of an empty Upcoming.
    if (lastAdd) requestPaymentsView("all");
    void markOnboardingSeen();
    router.back();
    // Always land on Payments — a debug replay would otherwise drop the
    // user back on the Settings tab that launched it.
    router.navigate("/");
  };

  // The AI door: hand over to the import hub. Pushed (not replaced) so
  // backing out returns here; when focus comes back we count what the trip
  // brought in, and a successful import advances to the done pane instead of
  // stranding the user on the method step again.
  const itemsAtImport = useRef<number | null>(null);
  const goImport = () => {
    itemsAtImport.current = items.length;
    void markOnboardingSeen();
    router.push({ pathname: "/add/import", params: { direct: "1" } });
  };
  useFocusEffect(
    useCallback(() => {
      if (itemsAtImport.current === null) return;
      const gained = items.length - itemsAtImport.current;
      itemsAtImport.current = null;
      if (gained > 0) {
        setImportedCount(gained);
        setLastAdd("import");
        setPhase("done");
      }
    }, [items.length]),
  );

  const onAdd = (selected: SuggestedCommitment[]) => {
    addPendingSuggestions(selected);
    // After onboarding (Settings > browse), the tour chrome would be noise:
    // close and land on the All list, where the picks now live.
    if (mode === "browse") {
      requestPaymentsView("all");
      void markOnboardingSeen();
      router.back();
      router.navigate("/");
      return;
    }
    setSavedCount(selected.length);
    setLastAdd("pick");
    setPhase("done");
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* The app's own stage (§9), plus wandering light: the tour happens ON
          the product's atmosphere, not on flat paint. */}
      <Ambient />
      <LightField scrollX={scrollX} accent={colors.accentStrong} />
      {phase === "tour" && (
        <Animated.View
          style={styles.phaseFill}
          entering={FadeInRight.duration(320)}
          exiting={FadeOutLeft.duration(200)}
        >
          <View style={styles.topBar}>
            <Pressable onPress={() => setLangWheel(true)} hitSlop={12} style={styles.langButton}>
              <SymbolView name="globe" size={14} tintColor={colors.mutedText} />
              <Text style={styles.skip}>{LANGUAGE_LABELS[currentLanguage]}</Text>
            </Pressable>
            {/* On the last pane the main button IS the way forward; a Skip
                doing the same thing would just be noise. */}
            {pane < TOUR_PANES.length - 1 && (
              <Pressable onPress={() => setPhase("method")} hitSlop={12}>
                <Text style={styles.skip}>{t("onboarding.skip")}</Text>
              </Pressable>
            )}
          </View>
          <Animated.ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={onTourScroll}
          >
            {TOUR_PANES.map((p, i) => (
              <TourPane
                key={p.titleKey}
                index={i}
                scrollX={scrollX}
                title={t(p.titleKey)}
                body={t(p.bodyKey)}
                paneStyle={styles.pane}
                titleStyle={styles.paneTitle}
                bodyStyle={styles.paneBody}
              />
            ))}
          </Animated.ScrollView>
          <View style={styles.dots}>
            {TOUR_PANES.map((p, i) => (
              <Dot key={p.titleKey} index={i} scrollX={scrollX} style={styles.dot} />
            ))}
          </View>
          {/* The label change (Next → Continue) crossfades: the outgoing
              button fades in place while its successor fades in. */}
          <View style={styles.ctaSlot}>
            <Animated.View
              key={pane < TOUR_PANES.length - 1 ? "next" : "continue"}
              entering={FadeIn.duration(220)}
              exiting={FadeOut.duration(160)}
              style={StyleSheet.absoluteFill}
            >
              <Button
                label={
                  pane < TOUR_PANES.length - 1 ? t("onboarding.next") : t("onboarding.continue")
                }
                onPress={() => {
                  if (pane < TOUR_PANES.length - 1) {
                    // The scroll handler advances `pane` as the page passes
                    // its midpoint; setting it eagerly here too made the dots
                    // argue with the in-flight scroll and flicker.
                    pagerRef.current?.scrollTo({ x: (pane + 1) * SCREEN_WIDTH, animated: true });
                  } else {
                    setPhase("method");
                  }
                }}
                style={styles.ctaFill}
              />
            </Animated.View>
          </View>
        </Animated.View>
      )}

      {phase === "method" && (
        <Animated.View
          style={styles.methodPane}
          entering={FadeInRight.duration(320)}
          exiting={FadeOutLeft.duration(200)}
        >
          <Text style={styles.paneTitle}>
            {lastAdd ? t("onboarding.methodMoreTitle") : t("onboarding.methodTitle")}
          </Text>
          <MethodDoor
            icon="rectangle.stack.fill"
            title={t("onboarding.methodPick")}
            sub={t("onboarding.methodPickSub")}
            onPress={() => setPhase("pick")}
          />
          {!aiHidden && (
            <MethodDoor
              icon="sparkles"
              title={t("onboarding.methodAI")}
              sub={t("onboarding.methodAISub")}
              onPress={goImport}
            />
          )}
          <Text style={styles.methodNote}>{t("onboarding.methodNote")}</Text>
          {/* Structurally a skip, not a third door: "no thanks, I'll use +".
              Routed through the done pane so the lock nudge is still seen.
              After a batch it reads as closing the loop instead. */}
          <Pressable onPress={() => setPhase("done")} hitSlop={12} style={styles.methodSkip}>
            <Text style={styles.methodSkipText}>
              {lastAdd ? t("onboarding.methodDoneForNow") : t("onboarding.methodManual")}
            </Text>
          </Pressable>
        </Animated.View>
      )}

      {phase === "pick" &&
        (remaining > 0 ? (
          <Animated.View
            style={styles.phaseFill}
            entering={FadeInRight.duration(320)}
            exiting={FadeOutLeft.duration(200)}
          >
            <View style={styles.pickHeader}>
              {/* Equal-flex side slots keep the title truly centered whether
                  the left holds Back (onboarding) or the right holds Done
                  (browse). */}
              <View style={styles.pickSide}>
                {mode !== "browse" && (
                  <Pressable
                    onPress={() => setPhase("method")}
                    hitSlop={12}
                    accessibilityLabel={t("onboarding.back")}
                  >
                    <SymbolView name="chevron.left" size={18} tintColor={colors.accent} />
                  </Pressable>
                )}
              </View>
              <Text style={styles.pickTitle}>{t("onboarding.pickTitle")}</Text>
              <View style={[styles.pickSide, styles.pickSideRight]}>
                {/* Browse mode's only exit; during onboarding, back covers it.
                    "Close", muted: it just leaves — the per-selection Add
                    button below is what commits, and a "Done" up here read
                    like a second confirm. */}
                {mode === "browse" && (
                  <Pressable onPress={finish} hitSlop={12}>
                    <Text style={styles.skip}>{t("common.close")}</Text>
                  </Pressable>
                )}
              </View>
            </View>
            <SuggestionPicker
              suggestions={SUGGESTED_COMMITMENTS}
              addedIds={addedIds}
              onAdd={onAdd}
            />
          </Animated.View>
        ) : (
          <Animated.View
            style={styles.pane}
            entering={FadeInRight.duration(320)}
            exiting={FadeOutLeft.duration(200)}
          >
            <Text style={styles.paneTitle}>{t("onboarding.caughtUpTitle")}</Text>
            <Text style={styles.paneBody}>{t("onboarding.caughtUpBody")}</Text>
            <Button label={t("onboarding.done")} onPress={finish} style={styles.cta} />
          </Animated.View>
        ))}

      {phase === "done" && (
        <Animated.View
          style={styles.pane}
          entering={FadeInRight.duration(320)}
          exiting={FadeOutLeft.duration(200)}
        >
          <Text style={styles.paneTitle}>
            {lastAdd === "import"
              ? t("onboarding.importedTitle", { count: importedCount })
              : lastAdd === "pick"
                ? t("onboarding.savedTitle", { count: savedCount })
                : t("onboarding.allSetTitle")}
          </Text>
          <Text style={styles.paneBody}>
            {lastAdd === "import"
              ? t("onboarding.importedBody")
              : lastAdd === "pick"
                ? t("onboarding.savedBody")
                : t("onboarding.allSetBody")}
          </Text>
          {/* One quiet, clearly OPTIONAL nudge on the way out: lock the app. */}
          <LockNudge />
          {/* The loop back to the method step: "Add more" after a batch, a
              plain Back for the changed mind that added nothing yet. */}
          <Button
            variant="secondary"
            label={lastAdd ? t("onboarding.addMore") : t("onboarding.back")}
            onPress={() => setPhase("method")}
            style={styles.ctaSecondary}
          />
          <Button label={t("onboarding.startUsing")} onPress={finish} style={styles.cta} />
          {/* The logo question is a REQUIRED first-run decision. The picker
              and the AI review ask it in context; this is the catch-all for
              the manual path, since every route exits through this pane. It
              renders nothing once a choice exists. */}
          <LogoConsentGate />
        </Animated.View>
      )}

      <OptionWheel
        visible={langWheel}
        title={t("settings.language")}
        onClose={() => setLangWheel(false)}
        options={APP_LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_LABELS[l] }))}
        value={currentLanguage}
        onChange={(v) => void setLanguageMode(v as AppLanguage)}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    // Fixed height so the panes don't shift when Skip retires on the last one.
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      minHeight: 48,
    },
    langButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
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
      textAlign: "center",
    },
    pickSide: { flex: 1, alignItems: "flex-start" },
    pickSideRight: { alignItems: "flex-end" },
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
    methodNote: {
      ...typography.caption,
      color: colors.mutedText,
      textAlign: "center",
      paddingTop: spacing.sm,
    },
    methodSkip: {
      alignSelf: "center",
      paddingVertical: spacing.md,
    },
    methodSkipText: {
      ...typography.label,
      color: colors.accent,
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
    phaseFill: { flex: 1 },
    // Fixed-height stage for the crossfading CTA (both labels overlap here).
    ctaSlot: {
      height: 52,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.lg,
      alignSelf: "stretch",
    },
    ctaFill: { flex: 1 },
    ctaSecondary: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      alignSelf: "stretch",
    },
  });
}
