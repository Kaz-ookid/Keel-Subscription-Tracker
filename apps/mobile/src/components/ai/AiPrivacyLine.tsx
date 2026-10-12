// The one-line privacy footer under an AI surface: a lock and a sentence.

import { SymbolView } from "expo-symbols";
import { StyleSheet, Text, View } from "react-native";

import { spacing, typography, useStyles, useTheme, type ThemeColors } from "../../theme";

export function AiPrivacyLine({ text }: { text: string }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  return (
    <View style={styles.row}>
      <SymbolView name="lock.shield" size={14} tintColor={colors.mutedText} />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs + 2,
    },
    text: { ...typography.caption, color: colors.mutedText, flexShrink: 1 },
  });
}
