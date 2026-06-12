// First-launch onboarding: a three-pane tour of what the app is for, then the
// suggestion deck (swipe right = "I have this" → the To-complete list). Also
// reachable any time from Settings with ?mode=deck, which skips the tour.

import { SUGGESTED_COMMITMENTS, type SuggestedCommitment } from "@keel/core";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SuggestionDeck } from "../src/components/SuggestionDeck";
import { markOnboardingSeen } from "../src/lib/onboarding";
import { useAppState } from "../src/state/app-state";
import { spacing, radius, typography, useTheme, type ThemeColors } from "../src/theme";

const SCREEN_WIDTH = Dimensions.get("window").width;

const TOUR_PANES = [
  {
    title: "Every commitment, one place",
    body: "Subscriptions, bills and Pay-in-X plans side by side — including the ones that only hit once a year.",
  },
  {
    title: "Know what hits, and from where",
    body: "Each payment is assigned to a bank account, so you can see what's about to leave which account, and when.",
  },
  {
    title: "Understand your year",
    body: "Insights smooths yearly costs into a monthly number and shows what you actually paid, not just the theory.",
  },
] as const;

type Phase = "tour" | "deck" | "done";

export default function OnboardingScreen() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items, pending, addPendingSuggestions } = useAppState();

  const [phase, setPhase] = useState<Phase>(mode === "deck" ? "deck" : "tour");
  const [pane, setPane] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const pagerRef = useRef<ScrollView>(null);

  // On a revisit the deck only shows what isn't already tracked or pending.
  const deck = useMemo(() => {
    const taken = new Set(items.map((i) => i.name.trim().toLowerCase()));
    const pendingIds = new Set(pending.map((p) => p.id));
    return SUGGESTED_COMMITMENTS.filter(
      (s) => !taken.has(s.name.toLowerCase()) && !pendingIds.has(s.id),
    );
  }, [items, pending]);

  const finish = () => {
    void markOnboardingSeen();
    router.back();
  };

  const acceptSuggestion = (s: SuggestedCommitment) => addPendingSuggestions([s]);

  const onDeckFinish = (count: number) => {
    setSavedCount(count);
    setPhase("done");
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {phase === "tour" && (
        <>
          <View style={styles.topBar}>
            <Pressable onPress={() => setPhase("deck")} hitSlop={12}>
              <Text style={styles.skip}>Skip</Text>
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
              <View key={p.title} style={styles.pane}>
                <Text style={styles.paneTitle}>{p.title}</Text>
                <Text style={styles.paneBody}>{p.body}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={styles.dots}>
            {TOUR_PANES.map((p, i) => (
              <View key={p.title} style={[styles.dot, i === pane && styles.dotActive]} />
            ))}
          </View>
          <Pressable
            style={styles.cta}
            onPress={() => {
              if (pane < TOUR_PANES.length - 1) {
                pagerRef.current?.scrollTo({ x: (pane + 1) * SCREEN_WIDTH, animated: true });
                setPane(pane + 1);
              } else {
                setPhase("deck");
              }
            }}
          >
            <Text style={styles.ctaText}>{pane < TOUR_PANES.length - 1 ? "Next" : "Continue"}</Text>
          </Pressable>
        </>
      )}

      {phase === "deck" &&
        (deck.length > 0 ? (
          <>
            <View style={styles.topBar}>
              <Pressable onPress={finish} hitSlop={12}>
                <Text style={styles.skip}>Skip</Text>
              </Pressable>
            </View>
            <View style={styles.deckIntro}>
              <Text style={styles.paneTitle}>Which of these do you pay for?</Text>
              <Text style={styles.paneBody}>
                Swipe right on the ones you have — they'll wait in a list so you can fill in the
                details later.
              </Text>
            </View>
            <SuggestionDeck
              suggestions={deck}
              onAccept={acceptSuggestion}
              onFinish={onDeckFinish}
            />
          </>
        ) : (
          <View style={styles.pane}>
            <Text style={styles.paneTitle}>All caught up</Text>
            <Text style={styles.paneBody}>
              Everything in our list of common commitments is already tracked or waiting in your
              To-complete list.
            </Text>
            <Pressable style={styles.cta} onPress={finish}>
              <Text style={styles.ctaText}>Done</Text>
            </Pressable>
          </View>
        ))}

      {phase === "done" && (
        <View style={styles.pane}>
          <Text style={styles.paneTitle}>
            {savedCount > 0 ? `${savedCount} saved to your To-complete list` : "All set"}
          </Text>
          <Text style={styles.paneBody}>
            {savedCount > 0
              ? "You'll find them under All on the Payments tab — each one opens the form pre-filled, so adding takes a couple of taps."
              : "Add your first commitment with the + tab whenever you're ready."}
          </Text>
          <Pressable style={styles.cta} onPress={finish}>
            <Text style={styles.ctaText}>Done</Text>
          </Pressable>
        </View>
      )}
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
      justifyContent: "flex-end",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    skip: {
      ...typography.label,
      color: colors.mutedText,
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
    deckIntro: {
      paddingHorizontal: spacing.xl,
      gap: spacing.sm,
      alignItems: "center",
    },
  });
}
