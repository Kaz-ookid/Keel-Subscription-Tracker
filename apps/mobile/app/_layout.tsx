import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AppStateProvider } from "../src/state/app-state";
import { useTheme } from "../src/theme";

export default function RootLayout() {
  const { colors, scheme } = useTheme();
  const router = useRouter();

  // Tapping a reminder lands on the commitment it's about.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const itemId = response.notification.request.content.data?.itemId;
      if (typeof itemId === "string") {
        router.push({ pathname: "/item", params: { id: itemId } });
      }
    });
    return () => subscription.remove();
  }, [router]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={scheme === "dark" ? DarkTheme : DefaultTheme}>
        <AppStateProvider>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.navy },
              headerTintColor: colors.white,
              contentStyle: { backgroundColor: colors.background },
              // Just the chevron — otherwise iOS prints the previous route's
              // name ("(tabs)") next to the back arrow.
              headerBackButtonDisplayMode: "minimal",
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="add"
              options={{ presentation: "modal", title: "New subscription" }}
            />
            <Stack.Screen name="item" options={{ title: "Details" }} />
            <Stack.Screen name="accounts" options={{ title: "Accounts" }} />
            <Stack.Screen name="price-changes" options={{ title: "Price changes" }} />
            <Stack.Screen name="by-account" options={{ title: "By account" }} />
            <Stack.Screen name="by-category" options={{ title: "By category" }} />
          </Stack>
          {/* Header is navy in both schemes, so light status-bar content reads well. */}
          <StatusBar style="light" />
        </AppStateProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
