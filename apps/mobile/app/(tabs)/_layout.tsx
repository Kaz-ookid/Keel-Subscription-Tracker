import { Tabs, useRouter } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Pressable, StyleSheet, View } from "react-native";

import { colors } from "../../src/theme";

type SymbolName = SymbolViewProps["name"];

// The bottom bar is data-driven: change the count or content here and the bar
// updates. `action: true` is the center ＋ — it opens the Add modal instead of
// switching tab. Each non-action entry needs a matching file in this folder.
const TABS: { name: string; title: string; sf: string; action?: boolean }[] = [
  { name: "index", title: "Subscriptions", sf: "creditcard.fill" },
  { name: "upcoming", title: "Upcoming", sf: "calendar" },
  // Center ＋ slot — opens the /add modal; named "new" so it doesn't collide
  // with the modal route at app/add.tsx (which owns "/add").
  { name: "new", title: "", sf: "plus.circle.fill", action: true },
  { name: "accounts", title: "Accounts", sf: "building.columns.fill" },
  { name: "settings", title: "Settings", sf: "gearshape.fill" },
];

export default function TabsLayout() {
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.navy,
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
                  accessibilityLabel="Add subscription"
                >
                  <SymbolView name={tab.sf as SymbolName} size={40} tintColor={colors.navy} />
                </Pressable>
              ),
            }}
          />
        ) : (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: tab.title,
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
