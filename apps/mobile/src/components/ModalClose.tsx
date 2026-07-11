// The task-sheet close, top LEFT on sheet screens with no screen behind them.
//
// THE RULE (ends dogfood rounds 1-12 of glyph drift): glyphs in the native
// header are drawn ONLY by the system (real back buttons on pushed screens).
// Custom header buttons are TEXT, the same treatment as the Save/Add actions
// on the right, which have always rendered perfectly. Text has no optical
// box for the native bar to misplace.

import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text } from "react-native";

import { typography } from "../theme";

export function ModalClose() {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel={t("common.close")}>
      <Text style={styles.label}>{t("common.close")}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Mirrors the headerAction text on the right (label 15/600, white on navy).
  label: { ...typography.label, color: "#FFFFFF", paddingHorizontal: 8 },
});
