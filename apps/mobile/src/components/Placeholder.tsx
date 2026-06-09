import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { StyleSheet, Text, View } from "react-native";

import { colors, spacing, typography } from "../theme";

/** A "coming soon" screen for tabs whose real content lands later. */
export function Placeholder({ sf, title }: { sf: string; title: string }) {
  return (
    <View style={styles.container}>
      <SymbolView name={sf as SymbolViewProps["name"]} size={48} tintColor={colors.accent} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.hint}>Coming soon.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  title: {
    ...typography.subtitle,
    fontWeight: "600",
    color: colors.text,
  },
  hint: {
    ...typography.body,
    color: colors.mutedText,
  },
});
