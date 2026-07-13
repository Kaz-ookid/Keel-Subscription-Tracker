// First-launch onboarding: a four-pane tour on the app's own ambient stage
// (scroll-driven parallax, a drifting glow — aura language only, never the
// harbor's), then the method step: doors into a filled-in app (pick from the
// brand bank, import with AI, or just the + button), looping via "Add more"
// until the user says done. Also reachable from Settings with ?mode=browse,
// which skips straight to the picker.

import { SUGGESTED_COMMITMENTS, type SuggestedCommitment } from "@keel/core";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  FadeInRight,
  FadeOut,
  FadeOutLeft,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

import { Ambient } from "../src/components/Ambient";
import { SuggestionPicker } from "../src/components/SuggestionPicker";
import { Button } from "../src/components/ui/Button";
import {
  authenticate,
  getAuthKind,
  loadAppLockConfig,
  setAppLockEnabled,
  type AuthKind,
} from "../src/lib/app-lock";
import { markOnboardingSeen } from "../src/lib/onboarding";
import { requestPaymentsView } from "../src/lib/tabReset";
import { useAppState } from "../src/state/app-state";
import { spacing, radius, typography, useTheme, type ThemeColors } from "../src/theme";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;

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
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items, pending, addPendingSuggestions } = useAppState();

  // "browse" (Settings, the pending list) jumps straight to the picker;
  // "start" (the empty-state Get started button) skips the tour but keeps the
  // method step; a plain open is the full first-launch run.
  const [phase, setPhase] = useState<Phase>(
    mode === "browse" ? "pick" : mode === "start" ? "method" : "tour",
  );
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

  // The app-lock nudge on the way out: shown on the done pane when the device
  // can lock and the lock isn't already on.
  const [lockKind, setLockKind] = useState<AuthKind | null>(null);
  const [lockOn, setLockOn] = useState(false);
  useEffect(() => {
    void getAuthKind().then(setLockKind);
    void loadAppLockConfig().then((config) => setLockOn(config.enabled));
  }, []);
  const enableLock = async () => {
    const ok = await authenticate(t("applock.confirmPrompt"));
    if (!ok) return;
    await setAppLockEnabled(true);
    setLockOn(true);
  };
  const lockLabel =
    lockKind === "faceId"
      ? t("applock.lockFaceId")
      : lockKind === "touchId"
        ? t("applock.lockTouchId")
        : t("applock.lockGeneric");

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
    // Whatever the tour added lives under All: close onto it, so the first
    // real screen shows their own list instead of an empty Upcoming.
    if (lastAdd) requestPaymentsView("all");
    void markOnboardingSeen();
    router.back();
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
                styles={styles}
              />
            ))}
          </Animated.ScrollView>
          <View style={styles.dots}>
            {TOUR_PANES.map((p, i) => (
              <Dot key={p.titleKey} index={i} scrollX={scrollX} styles={styles} />
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
                {/* Browse mode's only exit; during onboarding, back covers it. */}
                {mode === "browse" && (
                  <Pressable onPress={finish} hitSlop={12}>
                    <Text style={styles.skip}>{t("onboarding.done")}</Text>
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
          {/* One quiet, clearly OPTIONAL nudge on the way out: lock the app.
              The overline says why this card is here; it never blocks. */}
          {lockKind !== null && lockKind !== "unavailable" && (
            <View style={styles.lockWrap}>
              <Text style={styles.lockOverline}>{t("onboarding.lockOverline")}</Text>
              <View style={styles.lockCard}>
                <SymbolView
                  name={lockOn ? "checkmark.circle.fill" : "faceid"}
                  size={24}
                  tintColor={lockOn ? colors.tones.success : colors.accent}
                />
                <View style={styles.lockTexts}>
                  <Text style={styles.lockTitle}>
                    {lockOn ? t("onboarding.lockOn") : lockLabel}
                  </Text>
                  {!lockOn && <Text style={styles.lockBody}>{t("onboarding.lockBody")}</Text>}
                </View>
                {!lockOn && (
                  <Button
                    size="sm"
                    label={t("onboarding.lockCta")}
                    onPress={() => void enableLock()}
                  />
                )}
              </View>
            </View>
          )}
          {/* The loop back to the method step: "Add more" after a batch, a
              plain Back for the changed mind that added nothing yet. */}
          <Button
            variant="secondary"
            label={lastAdd ? t("onboarding.addMore") : t("onboarding.back")}
            onPress={() => setPhase("method")}
            style={styles.ctaSecondary}
          />
          <Button label={t("onboarding.startUsing")} onPress={finish} style={styles.cta} />
        </Animated.View>
      )}
    </View>
  );
}

/** One tour pane whose text rides the scroll: the title and body slide and
 *  fade at slightly different speeds, so paging feels layered, not stamped. */
function TourPane({
  index,
  scrollX,
  title,
  body,
  styles,
}: {
  index: number;
  scrollX: SharedValue<number>;
  title: string;
  body: string;
  styles: ReturnType<typeof createStyles>;
}) {
  const range = [(index - 1) * SCREEN_WIDTH, index * SCREEN_WIDTH, (index + 1) * SCREEN_WIDTH];
  const titleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, range, [0, 1, 0], Extrapolation.CLAMP),
    transform: [
      { translateX: interpolate(scrollX.value, range, [36, 0, -36], Extrapolation.CLAMP) },
    ],
  }));
  const bodyStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, range, [0, 1, 0], Extrapolation.CLAMP),
    transform: [
      { translateX: interpolate(scrollX.value, range, [64, 0, -64], Extrapolation.CLAMP) },
    ],
  }));
  return (
    <View style={styles.pane}>
      <Animated.Text style={[styles.paneTitle, titleStyle]}>{title}</Animated.Text>
      <Animated.Text style={[styles.paneBody, bodyStyle]}>{body}</Animated.Text>
    </View>
  );
}

/** A dot that morphs into a pill as its pane arrives — driven by the scroll
 *  itself, so it can never disagree with the page. */
function Dot({
  index,
  scrollX,
  styles,
}: {
  index: number;
  scrollX: SharedValue<number>;
  styles: ReturnType<typeof createStyles>;
}) {
  const range = [(index - 1) * SCREEN_WIDTH, index * SCREEN_WIDTH, (index + 1) * SCREEN_WIDTH];
  const style = useAnimatedStyle(() => ({
    width: interpolate(scrollX.value, range, [8, 22, 8], Extrapolation.CLAMP),
    opacity: interpolate(scrollX.value, range, [0.35, 1, 0.35], Extrapolation.CLAMP),
  }));
  return <Animated.View style={[styles.dot, style]} />;
}

/** One soft light source: drifts along its own slow loop (each with its own
 *  period, so they never sync), swells slightly, and parallax-shifts against
 *  the pager. Several of these overlapping read like light through water:
 *  pure aura language, no scenery. */
function Glow({
  scrollX,
  size,
  color,
  peak,
  top,
  left,
  driftX,
  driftY,
  duration,
  parallax,
}: {
  scrollX: SharedValue<number>;
  size: number;
  color: string;
  /** Center-stop opacity: how strong the light reads. */
  peak: number;
  top: number;
  left: number;
  driftX: number;
  driftY: number;
  duration: number;
  parallax: number;
}) {
  const phase = useSharedValue(0);
  useEffect(() => {
    // Reanimated shared values are driven by assigning `.value`.
    phase.value = withRepeat(
      withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [phase, duration]);
  const style = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(phase.value, [0, 1], [0, driftX]) - scrollX.value * parallax,
      },
      { translateY: interpolate(phase.value, [0, 1], [0, driftY]) },
      { scale: 1 + phase.value * 0.12 },
    ],
  }));
  const gradientId = `glow-${top}-${left}`;
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", top, left }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={gradientId} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={peak} />
            <Stop offset="60%" stopColor={color} stopOpacity={peak * 0.3} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${gradientId})`} />
      </Svg>
    </Animated.View>
  );
}

/** The water-surface layer: three unsynchronized glows over the Ambient
 *  stage. Different sizes, periods and drift directions keep the light
 *  wandering without ever repeating visibly. */
function LightField({ scrollX, accent }: { scrollX: SharedValue<number>; accent: string }) {
  return (
    <>
      <Glow
        scrollX={scrollX}
        size={560}
        color={accent}
        peak={0.3}
        top={-190}
        left={SCREEN_WIDTH * 0.4}
        driftX={-80}
        driftY={60}
        duration={11000}
        parallax={0.12}
      />
      <Glow
        scrollX={scrollX}
        size={400}
        color={accent}
        peak={0.18}
        top={SCREEN_HEIGHT * 0.42}
        left={-170}
        driftX={70}
        driftY={-90}
        duration={16000}
        parallax={0.06}
      />
      <Glow
        scrollX={scrollX}
        size={300}
        color={accent}
        peak={0.14}
        top={SCREEN_HEIGHT * 0.66}
        left={SCREEN_WIDTH * 0.55}
        driftX={-60}
        driftY={-70}
        duration={9000}
        parallax={0.18}
      />
    </>
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
    // Fixed height so the panes don't shift when Skip retires on the last one.
    topBar: {
      flexDirection: "row",
      justifyContent: "flex-end",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      minHeight: 48,
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
    methodSkip: {
      alignSelf: "center",
      paddingVertical: spacing.md,
    },
    methodSkipText: {
      ...typography.label,
      color: colors.accent,
    },
    lockWrap: {
      alignSelf: "stretch",
      gap: spacing.xs,
      marginTop: spacing.md,
    },
    lockOverline: {
      ...typography.caption,
      color: colors.mutedText,
      textAlign: "center",
    },
    lockCard: {
      alignSelf: "stretch",
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
    },
    lockTexts: { flex: 1, gap: 2 },
    lockTitle: { ...typography.label, color: colors.text },
    lockBody: { ...typography.caption, color: colors.mutedText, lineHeight: 17 },
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
