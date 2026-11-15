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
import { useGlass } from "../../src/lib/glass";
import { useTheme } from "../../src/theme";

export default function AddLayout() {
  const { colors, scheme } = useTheme();
  const { t } = useTranslation();
  const glass = useGlass();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Ambient />
      <Stack
        screenOptions={{
          // A bare bar: on iOS 26 and later the system blurs the content
          // edge under it by itself, and a background of ours would fight
          // that. Older iOS keeps the blur band. Screens opt into
          // automatic insets.
          headerTransparent: true,
          ...(glass
            ? {}
            : {
                headerBlurEffect:
                  scheme === "dark"
                    ? ("systemUltraThinMaterialDark" as const)
                    : ("systemUltraThinMaterialLight" as const),
              }),
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
        {/* "Keel reads it" ways in: the typed box and the capture preview. */}
        <Stack.Screen name="import-keel" options={{ title: t("keelReads.methodText") }} />
        <Stack.Screen name="import-keel-preview" options={{ title: t("keelReads.previewTitle") }} />
        <Stack.Screen name="import-review" options={{ title: t("titles.importReview") }} />
      </Stack>
    </View>
  );
}
