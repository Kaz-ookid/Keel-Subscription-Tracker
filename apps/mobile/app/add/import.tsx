// The AI-import hub: two pages, swipeable and pill-switched. "Keel reads it
// for you" (Apple's cloud model, opt-in) comes first; "Your own AI" (copy
// our instructions, paste the answer) second. Where the cloud model cannot
// exist on this phone the hub opens on the second page and the first one
// explains itself. The pager is the Payments tab's clamped paging ScrollView;
// the pills are the shared SegmentedPills, driven live by the pager's
// scroll so the wash follows the finger instead of teleporting on settle.

import { Stack, useLocalSearchParams } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSharedValue } from "react-native-reanimated";

import { KeelReadsPanel } from "../../src/components/import/KeelReadsPanel";
import { OwnAiPanel } from "../../src/components/import/OwnAiPanel";
import { ModalClose } from "../../src/components/ModalClose";
import { SegmentedPills } from "../../src/components/ui/SegmentedPills";
import { isKeelReadsOffered, keelReadsAvailability } from "../../src/lib/apple-intelligence";
import { useLockedRedirect } from "../../src/lib/lock-gate";
import { spacing } from "../../src/theme";

type Page = "keel" | "own";
const PAGES: readonly Page[] = ["keel", "own"];

export default function ImportHubScreen() {
  // Write screen: a locked mount bounces to the locked sheet (deep links
  // and stale stacks included).
  const locked = useLockedRedirect();
  // Settings and onboarding open the import directly (?direct=1): it is then
  // the sheet's first screen and needs its own leave affordance.
  const { direct } = useLocalSearchParams<{ direct?: string }>();
  const { t } = useTranslation();
  const { width: pageWidth } = useWindowDimensions();
  // Not a scroll view at the top level, so the transparent glass header
  // needs manual clearance (same as the add chooser).
  const headerHeight = useHeaderHeight();

  // null until the probe answers: the pager mounts once, on the right page.
  const [offered, setOffered] = useState<boolean | null>(null);
  const [page, setPage] = useState(0);
  const pagerRef = useRef<ScrollView>(null);
  // The pills' wash follows this, in pages; the pager's scroll feeds it.
  const progress = useSharedValue(0);
  useEffect(() => {
    void keelReadsAvailability().then((a) => {
      const yes = isKeelReadsOffered(a);
      setOffered(yes);
      setPage(yes ? 0 : 1);
      // Reanimated shared values are driven by assigning `.value`.
      progress.value = yes ? 0 : 1;
    });
  }, [progress]);

  const goTo = (next: number) => {
    // The animated scroll's own events carry the wash along.
    setPage(next);
    pagerRef.current?.scrollTo({ x: next * pageWidth, animated: true });
  };
  // Shared values written from scroll handlers: the library's API, not a
  // state mutation to police (InfoPopup and SwipeRow carry the same note).
  /* eslint-disable react-hooks/immutability */
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    progress.value = Math.min(1, Math.max(0, e.nativeEvent.contentOffset.x / pageWidth));
  };
  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
    setPage(next);
    progress.value = next;
  };
  /* eslint-enable react-hooks/immutability */
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
        <SegmentedPills
          options={PAGES.map((key) => ({
            value: key,
            label: t(key === "keel" ? "importAI.pageKeel" : "importAI.pageOwn"),
          }))}
          value={PAGES[page] ?? "keel"}
          onChange={(key) => goTo(PAGES.indexOf(key))}
          progress={progress}
        />
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" },
  switchWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  pager: { flex: 1 },
  page: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
});
