// A light explainer popup: a rounded card that slides over a dimmed backdrop,
// closes on tap-outside, the ✕, or dragging the card down by its grabber.
// ALL informative content uses this shape (window taxonomy, DESIGN.md §3.5) —
// short tips at the default height, long reads (the full AI instructions) as
// the `tall` variant. It never contains navigation.

import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, type ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  SlideInDown,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
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

  // Drag-to-dismiss on the WHOLE card. The pan runs alongside the body
  // ScrollView: it only accumulates while the scroll sits at its top, and it
  // re-baselines while the user is scrolling, so scrolling up through content
  // and then continuing past the top flows straight into the dismiss drag.
  const dragY = useSharedValue(0);
  const scrollTop = useSharedValue(0);
  const dragBase = useSharedValue(0);
  useEffect(() => {
    if (visible) dragY.value = 0;
  }, [visible, dragY]);
  // Reanimated shared values are driven by assigning `.value` inside gesture
  // worklets — the library's API, not a state mutation to police.
  /* eslint-disable react-hooks/immutability */
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollTop.value = e.contentOffset.y;
  });
  // The inner ScrollView's native gesture, declared so the pan can run
  // alongside it instead of fighting it.
  const scrollGesture = Gesture.Native();
  const pan = Gesture.Pan()
    .simultaneousWithExternalGesture(scrollGesture)
    .onStart(() => {
      dragBase.value = 0;
    })
    .onChange((e) => {
      if (scrollTop.value <= 0) {
        dragY.value = Math.max(0, e.translationY - dragBase.value);
      } else {
        dragBase.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (dragY.value > 90 || (dragY.value > 20 && e.velocityY > 700)) {
        scheduleOnRN(onClose);
      } else {
        dragY.value = withTiming(0, { duration: 150 });
      }
    });
  /* eslint-enable react-hooks/immutability */
  const cardDrag = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.value }] }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.backdrop}>
          {/* The dimmed area behind the card closes. */}
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <GestureDetector gesture={pan}>
            <Animated.View
              entering={SlideInDown.duration(280)}
              style={[
                styles.card,
                tall && styles.cardTall,
                { paddingBottom: Math.max(insets.bottom, spacing.lg) },
                cardDrag,
              ]}
            >
              <View style={styles.grabber} />
              <View style={styles.header}>
                <Text style={styles.title}>{title}</Text>
                <Pressable onPress={onClose} hitSlop={10}>
                  <SymbolView name="xmark.circle.fill" size={24} tintColor={colors.mutedText} />
                </Pressable>
              </View>
              <GestureDetector gesture={scrollGesture}>
                <Animated.ScrollView
                  style={styles.bodyScroll}
                  contentContainerStyle={styles.body}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                  scrollEventThrottle={16}
                  onScroll={onScroll}
                >
                  {children}
                </Animated.ScrollView>
              </GestureDetector>
            </Animated.View>
          </GestureDetector>
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
      backgroundColor: colors.materialStrong,
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
