import { Tabs, useRouter } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet } from "react-native";

import { useTheme } from "../../src/theme";

type SymbolName = SymbolViewProps["name"];

// The bottom bar is data-driven: change the count or content here and the bar
// updates. `action: true` is the center ＋ — it opens the Add modal instead of
// switching tab. Each non-action entry needs a matching file in this folder.
const TABS: { name: string; titleKey: string; sf: string; action?: boolean }[] = [
  { name: "index", titleKey: "tabs.payments", sf: "creditcard.fill" },
  { name: "insights", titleKey: "tabs.insights", sf: "chart.bar.fill" },
  { name: "new", titleKey: "", sf: "plus.circle.fill", action: true },
  { name: "history", titleKey: "tabs.history", sf: "clock.fill" },
  { name: "settings", titleKey: "tabs.settings", sf: "gearshape.fill" },
];

export default function TabsLayout() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.mutedText,
        headerStyle: { backgroundColor: colors.navy },
        headerTintColor: colors.white,
      }}
    >
      {TABS.map((tab) =>
        tab.action ? (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              tabBarButton: () => (
                <Pressable
                  onPress={() => router.push("/add")}
                  style={styles.addButton}
                  accessibilityLabel={t("tabs.addA11y")}
                >
                  <SymbolView name={tab.sf as SymbolName} size={40} tintColor={colors.accent} />
                </Pressable>
              ),
            }}
          />
        ) : (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: t(tab.titleKey),
              tabBarIcon: ({ color, size }) => (
                <SymbolView name={tab.sf as SymbolName} size={size ?? 24} tintColor={color} />
              ),
            }}
          />
        ),
      )}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  addButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
