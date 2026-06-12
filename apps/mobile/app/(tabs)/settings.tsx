// Settings: the home of rare, one-time configuration — starting with account
// management, which is set up once and then mostly left alone (that's why it
// lives here rather than occupying a whole tab).

import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { APP_NAME } from "../../src/constants";
import { useAppState } from "../../src/state/app-state";
import { radius, spacing, tones, typography, useTheme, type ThemeColors } from "../../src/theme";

export default function SettingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { accounts, clearAllData, loadSampleData } = useAppState();

  const confirmClear = () =>
    Alert.alert(
      "Clear all data",
      "Every subscription, payment, category and account will be deleted. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete everything", style: "destructive", onPress: clearAllData },
      ],
    );

  const confirmSample = () =>
    Alert.alert("Load sample data", "Replaces everything with a realistic seeded household.", [
      { text: "Cancel", style: "cancel" },
      { text: "Replace", style: "destructive", onPress: loadSampleData },
    ]);

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Pressable style={styles.row} onPress={() => router.push("/accounts")}>
          <SymbolView name="building.columns.fill" size={20} tintColor={colors.accent} />
          <Text style={styles.rowText}>Accounts</Text>
          <Text style={styles.rowValue}>{accounts.length || ""}</Text>
          <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
        </Pressable>
      </View>

      {/* Debug, for dogfooding: seed a realistic household or start clean. */}
      <View style={styles.card}>
        <Pressable style={styles.row} onPress={confirmSample}>
          <SymbolView name="wand.and.stars" size={20} tintColor={colors.accent} />
          <Text style={styles.rowText}>Load sample data</Text>
        </Pressable>
        <Pressable style={[styles.row, styles.rowDivider]} onPress={confirmClear}>
          <SymbolView name="trash.fill" size={20} tintColor={tones.danger} />
          <Text style={[styles.rowText, styles.dangerText]}>Clear all data</Text>
        </Pressable>
      </View>

      <Text style={styles.footer}>{APP_NAME}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
      padding: spacing.md,
      gap: spacing.md,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.md,
    },
    rowText: {
      ...typography.body,
      color: colors.text,
      flex: 1,
    },
    rowValue: {
      ...typography.body,
      color: colors.mutedText,
    },
    dangerText: {
      color: tones.danger,
    },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    footer: {
      ...typography.caption,
      color: colors.mutedText,
      textAlign: "center",
      marginTop: "auto",
      paddingBottom: spacing.md,
    },
  });
}
