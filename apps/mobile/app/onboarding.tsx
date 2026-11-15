// First-launch onboarding, built to reach a first real item fast: ONE tour
// pane on the app's own ambient stage (what Keel does, the trial terms, the
// language), then the brand picker. Confirming picks stores them as pending
// and opens the Add form on the first one; saving it finishes onboarding onto
// Payments. Two quiet links under the picker cover the other ways in: the AI
// import, and "I'll add by hand". Also reachable with ?mode=browse (Settings,
// Add, the To-complete fold): the picker only, with Close.

import { SUGGESTED_COMMITMENTS, type SuggestedCommitment } from "@keel/core";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInRight, FadeOutLeft } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Ambient } from "../src/components/Ambient";
import { LightField } from "../src/components/onboarding/LightField";
import { SuggestionPicker } from "../src/components/SuggestionPicker";
import { Button } from "../src/components/ui/Button";
import { GlassButton } from "../src/components/ui/GlassButton";
import { OptionWheel } from "../src/components/ui/OptionWheel";
import { APP_NAME } from "../src/constants";
import { APP_LANGUAGES, LANGUAGE_LABELS, setLanguageMode, type AppLanguage } from "../src/i18n";
import { useAiHidden } from "../src/lib/ai-visibility";
import { useLocked } from "../src/lib/lock-gate";
import { markOnboardingSeen } from "../src/lib/onboarding";
import { pendingFormParams } from "../src/lib/suggestions";
import { requestPaymentsView } from "../src/lib/tabReset";
import { useAppActions, useAppData } from "../src/state/app-state";
import { spacing, type ThemeColors, typography, useStyles, useTheme } from "../src/theme";

// What Keel does, one line each.
const TOUR_LINES = ["onboarding.line1", "onboarding.line2", "onboarding.line3"] as const;

type Phase = "tour" | "pick";

export default function OnboardingScreen() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const aiHidden = useAiHidden();
  const styles = useStyles(createStyles);
  const { items, pending } = useAppData();
  const { addPendingSuggestions } = useAppActions();

  // "browse" (Settings, Add, the pending list) jumps straight to the picker;
  // a plain open is the first-launch run. (The empty-state Get started button
  // opens the Add sheet directly and never lands here.) Browse ADDS pending
  // commitments, which is a write: locked browse bounces to the locked sheet.
  // First-launch onboarding CAN be locked: a reinstall keeps the old trial's
  // anchor. It then stores the picks and closes onto All, like browse; the
  // write gates there explain the trial (see onAdd).
  const browse = mode === "browse";
  const locked = useLocked();
  useEffect(() => {
    if (locked && browse) router.replace("/locked");
  }, [locked, browse, router]);
  const [phase, setPhase] = useState<Phase>(browse ? "pick" : "tour");

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

  const finish = useCallback(
    (view?: "all") => {
      if (view) requestPaymentsView(view);
      void markOnboardingSeen();
      router.back();
      // Always land on Payments — a debug replay would otherwise drop the
      // user back on the Settings tab that launched it.
      router.navigate("/");
    },
    [router],
  );
  // First launch lands on All while picks still wait there (the To-complete
  // fold shows them), on the default Upcoming otherwise. Browse leaves the
  // Payments view alone unless it added picks.
  const landing = !browse && pending.length > 0 ? "all" : undefined;

  // The Add form and the AI import are detours: pushed (not replaced) so
  // leaving them without saving returns here, picks still pending. When focus
  // comes back with more items than at departure, the detour did its job and
  // onboarding is over. Marked seen on the way out: a user who quits inside
  // the detour is never sent through the tour again.
  const itemsAtDetour = useRef<number | null>(null);
  const startDetour = () => {
    itemsAtDetour.current = items.length;
    void markOnboardingSeen();
  };
  useFocusEffect(
    useCallback(() => {
      if (itemsAtDetour.current === null || items.length <= itemsAtDetour.current) return;
      itemsAtDetour.current = null;
      // The Add sheet is still sliding away when focus returns, and iOS
      // drops a dismissal asked for during another one: closing onboarding
      // waits for that animation. If it were ever dropped anyway, the
      // picker's "Done" link still finishes.
      const timer = setTimeout(() => finish(landing), 450);
      return () => clearTimeout(timer);
    }, [items.length, landing, finish]),
  );

  const goImport = () => {
    startDetour();
    router.push({ pathname: "/add/import", params: { direct: "1" } });
  };

  const onAdd = (selected: SuggestedCommitment[]) => {
    addPendingSuggestions(selected);
    // Browse: close and land on the All list, where the picks now live.
    // Same when the trial has expired: the form would bounce to the locked
    // sheet in the middle of the tour.
    if (browse || locked) {
      finish("all");
      return;
    }
    // First launch: straight into the form on the first pick, pre-filled.
    // Saving turns it into a real item; the others wait under All.
    startDetour();
    router.push({ pathname: "/add/form", params: pendingFormParams(selected[0]) });
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* The app's own stage (§9), plus wandering light: the tour happens ON
          the product's atmosphere, not on flat paint. */}
      <Ambient />
      <LightField accent={colors.accentStrong} />
      {phase === "tour" && (
        <Animated.View
          style={styles.phaseFill}
          entering={FadeInRight.duration(320)}
          exiting={FadeOutLeft.duration(200)}
        >
          <View style={styles.topBar}>
            <Pressable onPress={() => setLangWheel(true)} hitSlop={12} style={styles.langButton}>
              <SymbolView name="globe" size={14} tintColor={colors.mutedText} />
              <Text style={styles.topLabel}>{LANGUAGE_LABELS[currentLanguage]}</Text>
            </Pressable>
          </View>
          <View style={styles.pane}>
            <Text style={styles.paneTitle}>{APP_NAME}</Text>
            {TOUR_LINES.map((key) => (
              <Text key={key} style={styles.tourLine}>
                {t(key)}
              </Text>
            ))}
          </View>
          {/* Day-one honesty (§7.3, user decision 2026-08-12): the trial
              model is on the FIRST screen, not buried at the exit. 45 free
              days from the first commitment, what read-only keeps, what the
              one purchase returns. Surprise is what writes one-star reviews. */}
          <Text style={styles.disclosure}>{t("onboarding.trialBody")}</Text>
          <GlassButton
            tinted
            large
            label={t("common.getStarted")}
            onPress={() => setPhase("pick")}
            style={styles.cta}
          />
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
                  the left holds Back (onboarding) or the right holds Close
                  (browse). */}
              <View style={styles.pickSide}>
                {!browse && (
                  <Pressable
                    onPress={() => setPhase("tour")}
                    hitSlop={12}
                    accessibilityLabel={t("onboarding.back")}
                  >
                    <SymbolView name="chevron.left" size={18} tintColor={colors.accent} />
                  </Pressable>
                )}
              </View>
              <Text style={styles.pickTitle}>{t("onboarding.pickTitle")}</Text>
              <View style={[styles.pickSide, styles.pickSideRight]}>
                {/* Browse mode's only exit; during onboarding, the links
                    below cover it. "Close", muted: it just leaves — the
                    per-selection Add button below is what commits, and a
                    "Done" up here read like a second confirm. */}
                {browse && (
                  <Pressable onPress={() => finish()} hitSlop={12}>
                    <Text style={styles.topLabel}>{t("common.close")}</Text>
                  </Pressable>
                )}
              </View>
            </View>
            {/* The picker asks the REQUIRED first-run logo question itself
                (LogoConsentGate), and every first-launch route passes here. */}
            <SuggestionPicker
              suggestions={SUGGESTED_COMMITMENTS}
              addedIds={addedIds}
              onAdd={onAdd}
            />
            {/* The other ways in, kept quiet: the list above is the fast
                path. The second link is also the exit once picks wait under
                All (back from the form without saving). */}
            {!browse && (
              <View style={styles.links}>
                {!aiHidden && (
                  <Button
                    variant="quiet"
                    size="sm"
                    label={t("onboarding.methodAI")}
                    onPress={goImport}
                  />
                )}
                <Button
                  variant="quiet"
                  size="sm"
                  label={pending.length > 0 ? t("onboarding.done") : t("onboarding.methodManual")}
                  onPress={() => finish(landing)}
                />
              </View>
            )}
          </Animated.View>
        ) : (
          <Animated.View
            style={styles.pane}
            entering={FadeInRight.duration(320)}
            exiting={FadeOutLeft.duration(200)}
          >
            <Text style={styles.paneTitle}>{t("onboarding.caughtUpTitle")}</Text>
            <Text style={styles.paneBody}>{t("onboarding.caughtUpBody")}</Text>
            <GlassButton
              tinted
              large
              label={t("onboarding.done")}
              onPress={() => finish(landing)}
              style={styles.cta}
            />
          </Animated.View>
        ))}

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
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      minHeight: 48,
    },
    langButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    // The muted bar labels: the language name, browse mode's Close.
    topLabel: {
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
    // Wraps to two rows when a language makes the links long.
    links: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      columnGap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xs,
    },
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
    tourLine: {
      ...typography.body,
      color: colors.text,
      textAlign: "center",
    },
    // The trial terms above the tour's button: a caption, not a nag.
    disclosure: {
      ...typography.caption,
      color: colors.mutedText,
      textAlign: "center",
      lineHeight: 18,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
    },
    // Layout-only: the look comes from ui/GlassButton.
    cta: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.lg,
      alignSelf: "stretch",
    },
    phaseFill: { flex: 1 },
  });
}
