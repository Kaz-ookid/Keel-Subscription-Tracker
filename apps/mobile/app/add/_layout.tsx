// The Add/Edit modal is its own little stack: the chooser is the first
// screen and the form is a REAL push on top of it. That buys the system
// back button on the form — actual native metrics, not an imitation
// (dogfood rounds 1-9: every hand-built chevron read as off-center).

import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";

import { useTheme } from "../../src/theme";

export default function AddLayout() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.navy },
        headerTintColor: colors.white,
        contentStyle: { backgroundColor: colors.background },
        headerBackButtonDisplayMode: "minimal",
      }}
    >
      <Stack.Screen name="index" options={{ title: t("titles.newCommitment") }} />
      <Stack.Screen name="form" options={{ title: t("titles.newSubscription") }} />
      <Stack.Screen name="import" options={{ title: t("titles.importAI") }} />
      <Stack.Screen name="import-review" options={{ title: t("titles.importReview") }} />
    </Stack>
  );
}
