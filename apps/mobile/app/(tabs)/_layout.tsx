// The tab chrome (DESIGN.md §9b): no header bars — each screen draws its own
// large title over the Ambient stage — and the tab bar is a floating glass
// dock. Content scrolls UNDER the dock (screens pad their bottom by
// DOCK_CLEARANCE). `action: true` is the center ＋ — it opens the Add modal
// instead of switching tab.

import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { BlurView } from "expo-blur";
import { Tabs, useRouter } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { bumpTabReset } from "../../src/lib/tabReset";
import { radius, typography, useTheme, withAlpha } from "../../src/theme";

type SymbolName = SymbolViewProps["name"];

const TABS: { name: string; titleKey: string; sf: string; action?: boolean }[] = [
  { name: "index", titleKey: "tabs.payments", sf: "creditcard.fill" },
  { name: "insights", titleKey: "tabs.insights", sf: "chart.bar.fill" },
  { name: "new", titleKey: "", sf: "plus", action: true },
  { name: "settings", titleKey: "tabs.settings", sf: "gearshape.fill" },
];

function GlassDock({ state, navigation }: BottomTabBarProps) {
  const router = useRouter();
  const { colors, scheme } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.dockWrap, { bottom: Math.max(insets.bottom, 12) }]}
      pointerEvents="box-none"
    >
      <BlurView
        intensity={50}
        tint={scheme === "dark" ? "systemUltraThinMaterialDark" : "systemUltraThinMaterialLight"}
        style={[styles.dock, { borderColor: colors.hairline, backgroundColor: colors.material }]}
      >
        {TABS.map((tab) => {
          if (tab.action) {
            return (
              <Pressable
                key={tab.name}
                onPress={() => router.push("/add")}
                accessibilityLabel={t("tabs.addA11y")}
                // Tinted, not solid (§9f): an accent wash in the glass.
                style={[styles.plus, { backgroundColor: withAlpha(colors.accentStrong, 0.28) }]}
              >
                <SymbolView name={tab.sf as SymbolName} size={22} tintColor={colors.accent} />
              </Pressable>
            );
          }
          const index = state.routes.findIndex((r) => r.name === tab.name);
          const active = state.index === index;
          return (
            <Pressable
              key={tab.name}
              // Re-tapping the active tab sends its screen home (§9i).
              onPress={() => (active ? bumpTabReset(tab.name) : navigation.navigate(tab.name))}
              accessibilityLabel={t(tab.titleKey)}
              style={styles.item}
            >
              <SymbolView
                name={tab.sf as SymbolName}
                size={22}
                tintColor={active ? colors.accent : colors.mutedText}
              />
              <Text
                style={[styles.itemLabel, { color: active ? colors.accent : colors.mutedText }]}
              >
                {t(tab.titleKey)}
              </Text>
            </Pressable>
          );
        })}
      </BlurView>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <GlassDock {...props} />}
      screenOptions={{
        // Screens own their titles now (large titles on the Ambient stage).
        headerShown: false,
        sceneStyle: { backgroundColor: "transparent" },
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="insights" />
      <Tabs.Screen name="new" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  dockWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  dock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 32,
    borderWidth: 1,
    overflow: "hidden",
  },
  item: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    width: 76,
    paddingVertical: 4,
    borderRadius: radius.lg,
  },
  itemLabel: {
    ...typography.micro,
    textTransform: "none",
    letterSpacing: 0,
  },
  plus: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 2,
  },
});
