// The AI surfaces' hero strip: one tinted line that says what this screen
// does, with a symbol. One component for the import panel, the typed-text
// screen, the preview and the assistant (it used to be four copies).

import { SymbolView } from "expo-symbols";
import type { ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  radius,
  spacing,
  typography,
  useStyles,
  useTheme,
  withAlpha,
  type ThemeColors,
} from "../../theme";

export function AiHero({
  text,
  icon = "sparkles",
}: {
  text: string;
  icon?: ComponentProps<typeof SymbolView>["name"];
}) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  return (
    <View style={styles.card}>
      <SymbolView name={icon} size={22} tintColor={colors.accent} />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: withAlpha(colors.accent, 0.12),
      borderWidth: 1,
      borderColor: withAlpha(colors.accent, 0.45),
      borderRadius: radius.xl,
      padding: spacing.md,
    },
    text: { ...typography.body, color: colors.text, flex: 1 },
  });
}
