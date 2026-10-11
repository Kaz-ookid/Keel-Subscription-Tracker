// The AI-import hub: two pages, swipeable and pill-switched. "Keel reads it
// for you" (Apple's cloud model, opt-in) comes first; "Your own AI" (copy
// our instructions, paste the answer) second. Where the cloud model cannot
// exist on this phone the hub opens on the second page and the first one
// explains itself. The pager is the same clamped paging ScrollView as the
// Payments tab: the offset is applied on mount only, and a release with
// momentum settles in onMomentumScrollEnd.

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

import { KeelReadsPanel } from "../../src/components/import/KeelReadsPanel";
import { OwnAiPanel } from "../../src/components/import/OwnAiPanel";
import { ModalClose } from "../../src/components/ModalClose";
import { isKeelReadsOffered, keelReadsAvailability } from "../../src/lib/apple-intelligence";
import { useLockedRedirect } from "../../src/lib/lock-gate";
import {
  radius,
  spacing,
  typography,
  useTheme,
  withAlpha,
  type ThemeColors,
} from "../../src/theme";

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
  useEffect(() => {
    void keelReadsAvailability().then((a) => {
      const yes = isKeelReadsOffered(a);
      setOffered(yes);
      setPage(yes ? 0 : 1);
    });
  }, []);
  const pagerRef = useRef<ScrollView>(null);
  const goTo = (next: number) => {
    setPage(next);
    pagerRef.current?.scrollTo({ x: next * pageWidth, animated: true });
  };
  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setPage(Math.round(e.nativeEvent.contentOffset.x / pageWidth));
  const dragEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (Math.abs(e.nativeEvent.velocity?.x ?? 0) < 0.05) settle(e);
  };

  if (locked || offered === null) return null;
  const initial = offered ? 0 : 1;
  return (
    <View style={[styles.screen, { paddingTop: headerHeight }]}>
      {direct ? <Stack.Screen options={{ headerLeft: () => <ModalClose /> }} /> : null}
      <View style={styles.pills}>
        {(["keel", "own"] as const).map((key, index) => (
          <Pressable
            key={key}
            style={[styles.pill, page === index && styles.pillActive]}
            onPress={() => goTo(index)}
            accessibilityRole="tab"
            accessibilityState={{ selected: page === index }}
          >
            <Text style={[styles.pillText, page === index && styles.pillTextActive]}>
              {t(key === "keel" ? "importAI.pageKeel" : "importAI.pageOwn")}
            </Text>
          </Pressable>
        ))}
      </View>
      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: initial * pageWidth, y: 0 }}
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
    pills: {
      flexDirection: "row",
      gap: spacing.xs,
      marginHorizontal: spacing.md,
      marginTop: spacing.sm,
      padding: 3,
      borderRadius: radius.lg,
      backgroundColor: colors.material,
      borderWidth: 1,
      borderColor: colors.hairline,
    },
    pill: {
      flex: 1,
      paddingVertical: spacing.xs + 4,
      borderRadius: radius.md,
      alignItems: "center",
    },
    pillActive: { backgroundColor: withAlpha(colors.accent, 0.18) },
    pillText: { ...typography.label, color: colors.mutedText },
    pillTextActive: { color: colors.accent },
    page: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  });
}
