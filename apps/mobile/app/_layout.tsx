import * as Notifications from "expo-notifications";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

// FIRST: caps Dynamic Type before anything renders text (see the file).
import "../src/lib/font-scale";
import "../src/i18n";
import { Ambient } from "../src/components/Ambient";
import { AppLockGate } from "../src/components/AppLockGate";
import { LockPresenter } from "../src/components/LockPresenter";
import { SheetShield } from "../src/components/SheetShield";
import { hydrateAiCloud } from "../src/lib/ai-cloud";
import { hydrateAiVisibility } from "../src/lib/ai-visibility";
import { hydrateAppLock } from "../src/lib/app-lock";
import { hydrateCustomBank } from "../src/lib/custom-bank";
import { hydrateBrandTints } from "../src/lib/dominant-color";
import { hydrateEntitlement } from "../src/lib/entitlement";
import { hydrateLogoConsent } from "../src/lib/logo-consent";
import { watchPurchases } from "../src/lib/purchases";
import { noteScreenshotTap } from "../src/lib/screenshot-mode";
import { AppStateProvider } from "../src/state/app-state";
import { AssistantSessionProvider } from "../src/state/assistant-session";
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
  const router = useRouter();

  // Read the stored brand-logo, AI-visibility and app-lock choices once,
  // before any surface that shows them renders.
  useEffect(() => {
    void hydrateLogoConsent();
    void hydrateAiVisibility();
    void hydrateAiCloud();
    void hydrateAppLock();
    void hydrateBrandTints();
    void hydrateCustomBank();
    void hydrateEntitlement();
    void watchPurchases();
  }, []);

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
      // What react-navigation paints where a screen doesn't: navy suits the
      // night scheme; on light it must be the light ground, not a navy slab.
      card: scheme === "dark" ? colors.navy : colors.background,
    },
  };

  return (
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: colors.background }}
      // Screenshot mode's quad-tap counter: fires for touches anywhere in
      // the app without claiming them (a no-op outside debug builds).
      onTouchStart={noteScreenshotTap}
    >
      {/* The Ambient stage lives BEHIND the navigator; screens with a
          transparent contentStyle float their materials over it. */}
      <Ambient />
      <ThemeProvider value={navTheme}>
        <AppStateProvider>
          <LockPresenter />
          <ImportSessionProvider>
            <AssistantSessionProvider>
              <Stack
                screenOptions={{
                  // §9b chrome: pushed screens get a fully transparent bar
                  // (back and right actions only; each screen draws its own
                  // large title in the content). The blur band that worked
                  // around iOS 26's Liquid Glass hit-testing (screens 4.16)
                  // read as a sharp slab pushing content down (dogfood
                  // 2026-10-11) and is gone with screens 4.26.
                  headerTransparent: true,
                  headerShadowVisible: false,
                  headerTintColor: colors.accent,
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
                {/* Titles live IN the content as large headings; the bar only
                  carries back and actions. */}
                {/* ONE item screen ever: `dangerouslySingular` (expo-router 57's
                  name for the constant-id trick) makes any navigation to
                  /item (widget deep links included) reuse the mounted
                  instance with new params instead of stacking another copy. */}
                <Stack.Screen name="item" options={{ title: "" }} dangerouslySingular />
                <Stack.Screen name="accounts" options={{ title: "" }} />
                <Stack.Screen name="price-changes" options={{ title: "" }} />
                <Stack.Screen name="by-account" options={{ title: "" }} />
                <Stack.Screen name="by-category" options={{ title: "" }} />
                <Stack.Screen name="notifications" options={{ title: "" }} />
                <Stack.Screen name="data" options={{ title: "" }} />
                <Stack.Screen name="backups" options={{ title: "" }} />
                <Stack.Screen name="guide" options={{ title: "" }} />
                <Stack.Screen name="about" options={{ title: "" }} />
                <Stack.Screen name="fullkeel" options={{ title: "" }} />
                <Stack.Screen name="locked" options={{ title: "" }} />
                <Stack.Screen name="upcoming" options={{ headerShown: false }} />
                <Stack.Screen name="assistant" options={{ title: "" }} />
                <Stack.Screen name="assistant-review" options={{ title: "" }} />
                <Stack.Screen name="ai-history" options={{ title: "" }} />
              </Stack>
            </AssistantSessionProvider>
          </ImportSessionProvider>
          {/* No colored bars anymore: the status bar follows the scheme. */}
          <StatusBar style={scheme === "dark" ? "light" : "dark"} />
          {/* Catches the touch that falls through a dismissing native action
              sheet (see lib/native-sheet.ts). Covers the tab and pushed
              screens, which is where every such sheet opens from. */}
          <SheetShield />
          {/* Above everything, including native modals: the app lock. */}
          <AppLockGate />
        </AppStateProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
