// A light explainer popup: a rounded card that slides over a dimmed backdrop,
// closes on tap-outside, the ✕, or dragging the card down by its grabber.
// ALL informative content uses this shape (window taxonomy, DESIGN.md §3.5) —
// short tips at the default height, long reads (the full AI instructions) as
// the `tall` variant. It never contains navigation.

import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { radius, spacing, typography, useTheme, type ThemeColors } from "../theme";

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** Near-full-height card for long content; the backdrop stays visible so it
   *  still reads as a popup, not a screen. */
  tall?: boolean;
  children: ReactNode;
}

export function InfoPopup({ visible, title, onClose, tall, children }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Drag-to-dismiss, attached to the grabber + header only so the body
  // ScrollView keeps its own pan untouched.
  const dragY = useSharedValue(0);
  useEffect(() => {
    if (visible) dragY.value = 0;
  }, [visible, dragY]);
  // Reanimated shared values are driven by assigning `.value` inside gesture
  // worklets — the library's API, not a state mutation to police.
  const pan = Gesture.Pan()
    .onChange((e) => {
      // eslint-disable-next-line react-hooks/immutability
      dragY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 90 || e.velocityY > 700) {
        runOnJS(onClose)();
      } else {
        // eslint-disable-next-line react-hooks/immutability
        dragY.value = withTiming(0, { duration: 150 });
      }
    });
  const cardDrag = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.value }] }));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.backdrop}>
          {/* The dimmed area behind the card closes; the card itself is a
              plain view so its ScrollView owns the pan gesture. */}
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <Animated.View
            style={[
              styles.card,
              tall && styles.cardTall,
              { paddingBottom: Math.max(insets.bottom, spacing.lg) },
              cardDrag,
            ]}
          >
            <GestureDetector gesture={pan}>
              <View>
                <View style={styles.grabber} />
                <View style={styles.header}>
                  <Text style={styles.title}>{title}</Text>
                  <Pressable onPress={onClose} hitSlop={10}>
                    <SymbolView name="xmark.circle.fill" size={24} tintColor={colors.mutedText} />
                  </Pressable>
                </View>
              </View>
            </GestureDetector>
            <ScrollView
              style={styles.bodyScroll}
              contentContainerStyle={styles.body}
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
    },
    backdrop: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: colors.scrim,
    },
    card: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingTop: spacing.sm,
      paddingHorizontal: spacing.lg,
      maxHeight: "72%",
    },
    cardTall: {
      maxHeight: "88%",
    },
    grabber: {
      alignSelf: "center",
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: spacing.sm,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
      paddingBottom: spacing.md,
    },
    title: {
      ...typography.subtitle,
      fontWeight: "700",
      color: colors.text,
      flexShrink: 1,
    },
    bodyScroll: { flexGrow: 0 },
    body: { paddingBottom: spacing.md, gap: spacing.md },
  });
}
