// Payments is a stack of one screen so that it owns a real system top bar:
// that bar carries the + (see index). Transparent, like every pushed screen.

import { Stack } from "expo-router";

import { useTheme } from "../../../src/theme";

export default function PaymentsLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        title: "",
        headerTransparent: true,
        headerShadowVisible: false,
        headerTintColor: colors.accent,
        contentStyle: { backgroundColor: "transparent" },
      }}
    />
  );
}
