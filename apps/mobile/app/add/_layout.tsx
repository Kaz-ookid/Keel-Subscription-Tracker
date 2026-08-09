// The Add/Edit modal is its own little stack: the chooser is the first
// screen and the form is a REAL push on top of it. That buys the system
// back button on the form — actual native metrics, not an imitation
// (dogfood rounds 1-9: every hand-built chevron read as off-center).
//
// The sheet carries its OWN Ambient stage (a modal covers the presenter,
// so the root one can't show through): screens go transparent and their
// material cards float, exactly like the tab screens.

import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Ambient } from "../../src/components/Ambient";
import { useTheme } from "../../src/theme";

export default function AddLayout() {
  const { colors, scheme } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Ambient />
      <Stack
        screenOptions={{
          // Real Apple glass for the bar (§9b): the system blur over the
          // stage, titles on it; screens opt into automatic insets.
          headerTransparent: true,
          headerBlurEffect:
            scheme === "dark" ? "systemUltraThinMaterialDark" : "systemUltraThinMaterialLight",
          headerShadowVisible: false,
          headerTintColor: colors.accent,
          headerTitleStyle: { color: colors.text },
          contentStyle: { backgroundColor: "transparent" },
          headerBackButtonDisplayMode: "minimal",
        }}
      >
        <Stack.Screen name="index" options={{ title: t("titles.newCommitment") }} />
        <Stack.Screen name="form" options={{ title: t("titles.newSubscription") }} />
        <Stack.Screen name="import" options={{ title: t("titles.importAI") }} />
        {/* The on-device Apple Intelligence path (linked from the import hub
          and the AI tab) — see modules/apple-intelligence/README.md. */}
        <Stack.Screen name="import-ondevice" options={{ title: t("importAI.methodKeel") }} />
        <Stack.Screen name="import-review" options={{ title: t("titles.importReview") }} />
      </Stack>
    </View>
  );
}
