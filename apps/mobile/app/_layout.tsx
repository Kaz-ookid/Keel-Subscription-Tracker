import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AppStateProvider } from "../src/state/app-state";
import { useTheme } from "../src/theme";

export default function RootLayout() {
  const { colors, scheme } = useTheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={scheme === "dark" ? DarkTheme : DefaultTheme}>
        <AppStateProvider>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.navy },
              headerTintColor: colors.white,
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="add"
              options={{ presentation: "modal", title: "New subscription" }}
            />
            <Stack.Screen name="item" options={{ title: "Details" }} />
          </Stack>
          {/* Header is navy in both schemes, so light status-bar content reads well. */}
          <StatusBar style="light" />
        </AppStateProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
