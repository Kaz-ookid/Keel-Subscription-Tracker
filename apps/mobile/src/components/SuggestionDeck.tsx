// The onboarding card deck: one common commitment at a time, swipe right =
// "I have this" (files it into the To-complete list), left = skip. The ✗ / ✓
// buttons mirror the gestures so the deck works without swiping at all.

import { DEFAULT_CATEGORIES, type SuggestedCommitment } from "@keel/core";
import { useMemo, useRef, useState } from "react";
import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { radius, spacing, typography, useTheme, type ThemeColors } from "../theme";
import { IconBadge } from "./IconBadge";

interface Props {
  suggestions: readonly SuggestedCommitment[];
  /** Fired per right-swipe, as it happens — progress survives a quit mid-deck. */
  onAccept: (suggestion: SuggestedCommitment) => void;
  /** Fired once, after the last card is decided. */
  onFinish: (acceptedCount: number) => void;
}

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;
const FLING_VELOCITY = 800;

export function SuggestionDeck({ suggestions, onAccept, onFinish }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [index, setIndex] = useState(0);
  const acceptedCount = useRef(0);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const current = suggestions[index];
  const next = suggestions[index + 1];

  const advance = (accepted: boolean) => {
    if (accepted && current) {
      acceptedCount.current += 1;
      onAccept(current);
    }
    translateX.value = 0;
    translateY.value = 0;
    if (index + 1 >= suggestions.length) {
      onFinish(acceptedCount.current);
    } else {
      setIndex(index + 1);
    }
  };

  const decide = (direction: 1 | -1) => {
    translateX.value = withTiming(direction * SCREEN_WIDTH * 1.4, { duration: 220 }, (finished) => {
      if (finished) runOnJS(advance)(direction === 1);
    });
  };

  const pan = Gesture.Pan()
    .onChange((e) => {
      translateX.value += e.changeX;
      translateY.value += e.changeY * 0.3;
    })
    // Reanimated shared values mimic refs, but this callback is a UI-thread
    // worklet, not render code — the rule is a false positive here.
    // eslint-disable-next-line react-hooks/refs
    .onEnd((e) => {
      const flung = Math.abs(e.velocityX) > FLING_VELOCITY;
      if (Math.abs(translateX.value) > SWIPE_THRESHOLD || flung) {
        const direction = (flung ? e.velocityX : translateX.value) > 0 ? 1 : -1;
        translateX.value = withTiming(
          direction * SCREEN_WIDTH * 1.4,
          { duration: 220 },
          (finished) => {
            if (finished) runOnJS(advance)(direction === 1);
          },
        );
      } else {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  const topCardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${translateX.value / 20}deg` },
    ],
  }));

  // The "Have it" / "Skip" hints fade in with the drag, on their own side.
  const haveItStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0, 1]),
  }));
  const skipStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-SWIPE_THRESHOLD, 0], [1, 0]),
  }));

  const nextCardStyle = useAnimatedStyle(() => {
    const progress = Math.min(Math.abs(translateX.value) / SWIPE_THRESHOLD, 1);
    return { transform: [{ scale: 0.94 + progress * 0.06 }] };
  });

  if (!current) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.progress}>
        {index + 1} of {suggestions.length}
      </Text>

      <View style={styles.stack}>
        {next && (
          <Animated.View style={[styles.card, styles.cardBehind, nextCardStyle]}>
            <CardFace suggestion={next} styles={styles} accent={colors.accent} />
          </Animated.View>
        )}
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.card, topCardStyle]}>
            <CardFace suggestion={current} styles={styles} accent={colors.accent} />
            <Animated.View style={[styles.hint, styles.hintHave, haveItStyle]}>
              <Text style={styles.hintText}>Have it</Text>
            </Animated.View>
            <Animated.View style={[styles.hint, styles.hintSkip, skipStyle]}>
              <Text style={styles.hintText}>Skip</Text>
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </View>

      <View style={styles.buttons}>
        <Pressable
          accessibilityLabel="I don't have this"
          onPress={() => decide(-1)}
          style={[styles.button, styles.buttonSkip]}
        >
          <Text style={styles.buttonSkipText}>✕</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="I have this"
          onPress={() => decide(1)}
          style={[styles.button, styles.buttonHave]}
        >
          <Text style={styles.buttonHaveText}>✓</Text>
        </Pressable>
      </View>
    </View>
  );
}

function CardFace({
  suggestion,
  styles,
  accent,
}: {
  suggestion: SuggestedCommitment;
  styles: ReturnType<typeof createStyles>;
  accent: string;
}) {
  const category = DEFAULT_CATEGORIES.find((c) => c.id === suggestion.categoryId);
  return (
    <View style={styles.cardFace}>
      <IconBadge
        icon={category?.icon}
        fallback={suggestion.name.charAt(0).toUpperCase()}
        color={accent}
        size={72}
      />
      <Text style={styles.cardName}>{suggestion.name}</Text>
      <Text style={styles.cardCaption}>
        usually {suggestion.unit === "month" ? "monthly" : "yearly"}
      </Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.lg,
    },
    progress: {
      ...typography.caption,
      color: colors.mutedText,
      fontWeight: "600",
    },
    stack: {
      width: SCREEN_WIDTH - spacing.xl * 2,
      height: 300,
    },
    card: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOpacity: 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    cardBehind: {
      opacity: 0.7,
    },
    cardFace: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.md,
      padding: spacing.lg,
    },
    cardName: {
      fontSize: 24,
      fontWeight: "700",
      color: colors.text,
      textAlign: "center",
    },
    cardCaption: {
      ...typography.caption,
      color: colors.mutedText,
    },
    hint: {
      position: "absolute",
      top: spacing.lg,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.sm,
      borderWidth: 2,
    },
    hintHave: {
      left: spacing.lg,
      borderColor: colors.accent,
      transform: [{ rotate: "-12deg" }],
    },
    hintSkip: {
      right: spacing.lg,
      borderColor: colors.mutedText,
      transform: [{ rotate: "12deg" }],
    },
    hintText: {
      ...typography.label,
      color: colors.text,
    },
    buttons: {
      flexDirection: "row",
      gap: spacing.xl,
    },
    button: {
      width: 60,
      height: 60,
      borderRadius: 30,
      alignItems: "center",
      justifyContent: "center",
    },
    buttonSkip: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    buttonSkipText: {
      fontSize: 24,
      color: colors.mutedText,
    },
    buttonHave: {
      backgroundColor: colors.accent,
    },
    buttonHaveText: {
      fontSize: 26,
      color: colors.white,
      fontWeight: "700",
    },
  });
}
