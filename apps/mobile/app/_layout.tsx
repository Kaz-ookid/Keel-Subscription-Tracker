import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import "../src/i18n";
import { Ambient } from "../src/components/Ambient";
import { AppLockGate } from "../src/components/AppLockGate";
import { AppStateProvider } from "../src/state/app-state";
import { ImportSessionProvider } from "../src/state/import-session";
import { ThemePreferenceProvider, useTheme } from "../src/theme";

export default function RootLayout() {
  return (
    // Above everything that calls useTheme, so the preference applies app-wide.
    <ThemePreferenceProvider>
      <RootNavigator />
    </ThemePreferenceProvider>
  );
}

function RootNavigator() {
  const { colors, scheme } = useTheme();
  const { t } = useTranslation();
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

  // The navigation theme's background is what peeks out BETWEEN cards during
  // swipe-back and modal transitions: it must be our background, not the
  // library default (which flashes white in dark mode).
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: colors.background,
      card: colors.navy,
    },
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* The Ambient stage lives BEHIND the navigator; screens with a
          transparent contentStyle float their materials over it. */}
      <Ambient />
      <ThemeProvider value={navTheme}>
        <AppStateProvider>
          <ImportSessionProvider>
            <Stack
              screenOptions={{
                // §9b chrome: no colored bars. Pushed screens get the native
                // large title collapsing into a blur; the Ambient stage shows
                // through the transparent content.
                headerTransparent: true,
                headerBlurEffect: scheme === "dark" ? "dark" : "light",
                headerLargeTitle: true,
                headerTintColor: colors.accent,
                headerTitleStyle: { color: colors.text },
                headerLargeTitleStyle: { color: colors.text },
                contentStyle: { backgroundColor: "transparent" },
                // Just the chevron — otherwise iOS prints the previous route's
                // name ("(tabs)") next to the back arrow.
                headerBackButtonDisplayMode: "minimal",
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="onboarding"
                options={{
                  presentation: "fullScreenModal",
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.background },
                }}
              />
              {/* The add flow (chooser, form, AI import, review) is a nested
                  stack so every step gets a REAL native back button; it
                  draws its own headers. */}
              <Stack.Screen name="add" options={{ presentation: "modal", headerShown: false }} />
              <Stack.Screen name="item" options={{ title: t("titles.details") }} />
              <Stack.Screen name="accounts" options={{ title: t("titles.accounts") }} />
              <Stack.Screen name="price-changes" options={{ title: t("titles.priceChanges") }} />
              <Stack.Screen name="by-account" options={{ title: t("titles.byAccount") }} />
              <Stack.Screen name="by-category" options={{ title: t("titles.byCategory") }} />
            </Stack>
          </ImportSessionProvider>
          {/* No colored bars anymore: the status bar follows the scheme. */}
          <StatusBar style={scheme === "dark" ? "light" : "dark"} />
          {/* Above everything, including native modals: the app lock. */}
          <AppLockGate />
        </AppStateProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
