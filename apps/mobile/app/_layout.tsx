import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SymbolView } from "expo-symbols";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Pressable } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import "../src/i18n";
import { AppLockGate } from "../src/components/AppLockGate";
import { AppStateProvider } from "../src/state/app-state";
import { ImportSessionProvider } from "../src/state/import-session";
import { ThemePreferenceProvider, useTheme } from "../src/theme";

/** The task-sheet close (window taxonomy, DESIGN.md §3.5): leaving lives top
 *  LEFT as an ✕ on every pageSheet modal, so the system back chevron never
 *  masquerades as navigation inside a task. Confirming stays top right. */
function ModalClose() {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close">
      <SymbolView name="xmark" size={17} tintColor="#FFFFFF" />
    </Pressable>
  );
}

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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={scheme === "dark" ? DarkTheme : DefaultTheme}>
        <AppStateProvider>
          <ImportSessionProvider>
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
                name="onboarding"
                options={{ presentation: "fullScreenModal", headerShown: false }}
              />
              <Stack.Screen
                name="add"
                options={{
                  presentation: "modal",
                  title: t("titles.newSubscription"),
                  headerLeft: () => <ModalClose />,
                }}
              />
              <Stack.Screen
                name="import"
                options={{
                  presentation: "modal",
                  title: t("titles.importAI"),
                  headerLeft: () => <ModalClose />,
                }}
              />
              <Stack.Screen
                name="import-review"
                options={{
                  presentation: "modal",
                  title: t("titles.importReview"),
                  headerLeft: () => <ModalClose />,
                }}
              />
              <Stack.Screen name="item" options={{ title: t("titles.details") }} />
              <Stack.Screen name="accounts" options={{ title: t("titles.accounts") }} />
              <Stack.Screen name="price-changes" options={{ title: t("titles.priceChanges") }} />
              <Stack.Screen name="by-account" options={{ title: t("titles.byAccount") }} />
              <Stack.Screen name="by-category" options={{ title: t("titles.byCategory") }} />
            </Stack>
          </ImportSessionProvider>
          {/* Header is navy in both schemes, so light status-bar content reads well. */}
          <StatusBar style="light" />
          {/* Above everything, including native modals: the app lock. */}
          <AppLockGate />
        </AppStateProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
