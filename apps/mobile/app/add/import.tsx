// The AI-import hub: two pages, swipeable and pill-switched. "Keel reads it
// for you" (Apple's cloud model, opt-in) comes first; "Your own AI" (copy
// our instructions, paste the answer) second. Where the cloud model cannot
// exist on this phone the hub opens on the second page and the first one
// explains itself. Pager and pills are the Payments tab's: a clamped paging
// ScrollView whose own scroll drives the selection wash, so the highlight
// follows the finger instead of teleporting when the page settles.

import { Stack, useLocalSearchParams } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";

import { KeelReadsPanel } from "../../src/components/import/KeelReadsPanel";
import { OwnAiPanel } from "../../src/components/import/OwnAiPanel";
import { ModalClose } from "../../src/components/ModalClose";
import { isKeelReadsOffered, keelReadsAvailability } from "../../src/lib/apple-intelligence";
import { useLockedRedirect } from "../../src/lib/lock-gate";
import { spacing, typography, useTheme, withAlpha, type ThemeColors } from "../../src/theme";

const PAGES = ["pageKeel", "pageOwn"] as const;

export default function ImportHubScreen() {
  // Write screen: a locked mount bounces to the locked sheet (deep links
  // and stale stacks included).
  const locked = useLockedRedirect();
  // Settings and onboarding open the import directly (?direct=1): it is then
  // the sheet's first screen and needs its own leave affordance.
  const { direct } = useLocalSearchParams<{ direct?: string }>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width: pageWidth } = useWindowDimensions();
  // Not a scroll view at the top level, so the transparent glass header
  // needs manual clearance (same as the add chooser).
  const headerHeight = useHeaderHeight();

  // null until the probe answers: the pager mounts once, on the right page.
  const [offered, setOffered] = useState<boolean | null>(null);
  const [page, setPage] = useState(0);
  const pagerRef = useRef<ScrollView>(null);
  useEffect(() => {
    void keelReadsAvailability().then((a) => {
      const yes = isKeelReadsOffered(a);
      setOffered(yes);
      setPage(yes ? 0 : 1);
    });
  }, []);

  // The selection wash slides with the pager: its x is the scroll progress
  // in pill widths (Reanimated shared values are driven by assigning
  // `.value`). Placed under the starting pill when the track measures, and
  // re-asserted under the page on every settle.
  const [trackWidth, setTrackWidth] = useState(0);
  const pillWidth = trackWidth > 0 ? (trackWidth - 2 - 6 - 3) / 2 : 0; // border+padding+gap
  const highlightX = useSharedValue(0);
  const onTrackLayout = (width: number) => {
    setTrackWidth(width);
    highlightX.value = page * ((width - 2 - 6 - 3) / 2 + 3);
  };
  const highlightStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: highlightX.value }],
  }));

  const goTo = (next: number) => {
    // The animated scroll's own events carry the wash along.
    setPage(next);
    pagerRef.current?.scrollTo({ x: next * pageWidth, animated: true });
  };
  // Reanimated shared values are driven by assigning `.value` from scroll
  // handlers: the library's API, not a state mutation to police (InfoPopup
  // and SwipeRow carry the same note).
  /* eslint-disable react-hooks/immutability */
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const progress = Math.min(1, Math.max(0, e.nativeEvent.contentOffset.x / pageWidth));
    highlightX.value = progress * (pillWidth + 3);
  };
  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
    setPage(next);
    highlightX.value = next * (pillWidth + 3);
  };
  const dragEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // A release with momentum settles in onMomentumScrollEnd; only a
    // dead-stop release settles here (the Payments pager's lesson).
    if (Math.abs(e.nativeEvent.velocity?.x ?? 0) < 0.05) settle(e);
  };

  if (locked || offered === null) return null;
  const initial = offered ? 0 : 1;
  return (
    <View style={[styles.screen, { paddingTop: headerHeight }]}>
      {direct ? <Stack.Screen options={{ headerLeft: () => <ModalClose /> }} /> : null}
      <View style={styles.switchWrap}>
        <View style={styles.switch} onLayout={(e) => onTrackLayout(e.nativeEvent.layout.width)}>
          {pillWidth > 0 && (
            <Animated.View style={[styles.highlight, { width: pillWidth }, highlightStyle]} />
          )}
          {PAGES.map((key, index) => (
            <Pressable
              key={key}
              style={styles.pill}
              onPress={() => goTo(index)}
              accessibilityRole="tab"
              accessibilityState={{ selected: page === index }}
            >
              <Text style={[styles.pillText, page === index && styles.pillTextActive]}>
                {t(`importAI.${key}`)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <ScrollView
        ref={pagerRef}
        style={styles.pager}
        horizontal
        pagingEnabled
        // No bounce = no overscroll = nothing to wrap to.
        bounces={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        contentOffset={{ x: initial * pageWidth, y: 0 }}
        onScroll={onScroll}
        onMomentumScrollEnd={settle}
        onScrollEndDrag={dragEnd}
        keyboardShouldPersistTaps="handled"
      >
        <ScrollView
          style={{ width: pageWidth }}
          contentContainerStyle={styles.page}
          keyboardShouldPersistTaps="handled"
        >
          <KeelReadsPanel onUseOwnAi={() => goTo(1)} />
        </ScrollView>
        <View style={{ width: pageWidth }}>
          <OwnAiPanel />
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: "transparent" },
    switchWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
    // Material capsule (§9f): translucent track, hairline, accent tint wash.
    switch: {
      flexDirection: "row",
      backgroundColor: colors.material,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.hairline,
      padding: 3,
      gap: 3,
      // The wash must never escape the capsule, even mid-overscroll.
      overflow: "hidden",
    },
    pill: { flex: 1, alignItems: "center", paddingVertical: spacing.sm, borderRadius: 999 },
    highlight: {
      position: "absolute",
      top: 3,
      bottom: 3,
      left: 3,
      borderRadius: 999,
      backgroundColor: withAlpha(colors.accent, 0.2),
    },
    pillText: { ...typography.label, color: colors.mutedText },
    pillTextActive: { color: colors.accent },
    pager: { flex: 1 },
    page: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  });
}
