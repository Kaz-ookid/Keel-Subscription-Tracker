// The tab chrome: the system's own tab bar (real Liquid Glass on iOS 26 and
// later, the classic bar below), three destinations. Adding is an action, so
// it lives in the Payments top bar, not here: Apple keeps tab bars for
// navigation. Each tab's first scroll view is inset by the system, so no
// screen pads for the bar by hand; Payments opts out (its first scroll view
// is the side-to-side pager) and insets its lists itself.
//
// NativeTabs is still marked unstable in SDK 57 (stable in 58).

import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useTranslation } from "react-i18next";

import { useScreenshotMode } from "../../src/lib/screenshot-mode";
import { bumpTabReset } from "../../src/lib/tabReset";
import { useTheme } from "../../src/theme";

// Re-tapping the active tab sends its screen home (§9i). The press event
// fires before the tab changes, so "already focused" means a re-tap.
const resetOnRetap =
  (tab: string) =>
  ({ navigation }: { navigation: { isFocused: () => boolean } }) => ({
    tabPress: () => {
      if (navigation.isFocused()) bumpTabReset(tab);
    },
  });

// Each tab hosts its own Ambient stage (TabStage); the navigator's default
// opaque fill would only sit under it.
const CONTENT = { backgroundColor: "transparent" } as const;

export default function TabsLayout() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  // Quadruple-tap screenshot mode (debug builds): the bar steps out of the
  // frame so store captures get the full screen.
  const captureMode = useScreenshotMode();

  return (
    <NativeTabs tintColor={colors.accent} minimizeBehavior="onScrollDown" hidden={captureMode}>
      <NativeTabs.Trigger
        name="(payments)"
        contentStyle={CONTENT}
        // The pager is this tab's first scroll view: the system inset and
        // scroll-to-top would act on it, sideways. The screen does both.
        disableAutomaticContentInsets
        disableScrollToTop
        listeners={resetOnRetap("index")}
      >
        <NativeTabs.Trigger.Icon sf="creditcard.fill" />
        <NativeTabs.Trigger.Label>{t("tabs.payments")}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="insights"
        contentStyle={CONTENT}
        listeners={resetOnRetap("insights")}
      >
        <NativeTabs.Trigger.Icon sf="chart.bar.fill" />
        <NativeTabs.Trigger.Label>{t("tabs.insights")}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="settings"
        contentStyle={CONTENT}
        listeners={resetOnRetap("settings")}
      >
        <NativeTabs.Trigger.Icon sf="gearshape.fill" />
        <NativeTabs.Trigger.Label>{t("tabs.settings")}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
