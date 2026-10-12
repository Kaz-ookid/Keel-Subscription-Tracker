// The AI-import hub: two pages, swipeable and pill-switched. "Keel reads it
// for you" (Apple's cloud model, opt-in) comes first; "Your own AI" (copy
// our instructions, paste the answer) second. Where the cloud model cannot
// exist on this phone the hub opens on the second page and the first one
// explains itself. The pager is the shared usePager (the Payments tab's),
// the pills the shared SegmentedPills, driven live by the pager's progress.

import { Stack, useLocalSearchParams } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";

import { KeelReadsPanel } from "../../src/components/import/KeelReadsPanel";
import { OwnAiPanel } from "../../src/components/import/OwnAiPanel";
import { ModalClose } from "../../src/components/ModalClose";
import { SegmentedPills } from "../../src/components/ui/SegmentedPills";
import { usePager } from "../../src/components/ui/usePager";
import { isKeelReadsOffered, keelReadsAvailability } from "../../src/lib/apple-intelligence";
import { useLockedRedirect } from "../../src/lib/lock-gate";
import { spacing } from "../../src/theme";

type Page = "keel" | "own";
const PAGES: readonly Page[] = ["keel", "own"];

export default function ImportHubScreen() {
  // null until the probe answers: the pager mounts once, on the right page.
  const [offered, setOffered] = useState<boolean | null>(null);
  useEffect(() => {
    void keelReadsAvailability().then((a) => setOffered(isKeelReadsOffered(a)));
  }, []);
  if (offered === null) return null;
  return <ImportHub initialPage={offered ? 0 : 1} />;
}

function ImportHub({ initialPage }: { initialPage: number }) {
  // Write screen: a locked mount bounces to the locked sheet (deep links
  // and stale stacks included).
  const locked = useLockedRedirect();
  // Onboarding opens the import directly (?direct=1): it is then
  // the sheet's first screen and needs its own leave affordance.
  const { direct } = useLocalSearchParams<{ direct?: string }>();
  const { t } = useTranslation();
  const { width: pageWidth } = useWindowDimensions();
  // Not a scroll view at the top level, so the transparent glass header
  // needs manual clearance (same as the add chooser).
  const headerHeight = useHeaderHeight();
  const pagerRef = useRef<ScrollView>(null);
  const pager = usePager({ ref: pagerRef, pageWidth, pageCount: PAGES.length, initialPage });

  if (locked) return null;
  return (
    <View style={[styles.screen, { paddingTop: headerHeight }]}>
      {direct ? <Stack.Screen options={{ headerLeft: () => <ModalClose /> }} /> : null}
      <View style={styles.switchWrap}>
        <SegmentedPills
          options={PAGES.map((key) => ({
            value: key,
            label: t(key === "keel" ? "importAI.pageKeel" : "importAI.pageOwn"),
          }))}
          value={PAGES[pager.page] ?? "keel"}
          onChange={(key) => pager.goTo(PAGES.indexOf(key))}
          progress={pager.progress}
        />
      </View>
      <ScrollView
        ref={pagerRef}
        style={styles.pager}
        keyboardShouldPersistTaps="handled"
        {...pager.scrollProps}
      >
        <ScrollView
          style={{ width: pageWidth }}
          contentContainerStyle={styles.page}
          keyboardShouldPersistTaps="handled"
        >
          <KeelReadsPanel onUseOwnAi={() => pager.goTo(1)} />
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
