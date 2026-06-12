import { ACCOUNT_TYPES, type Account } from "@keel/core";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { AccountEditSheet } from "../../src/components/AccountSheet";
import { IconBadge } from "../../src/components/IconBadge";
import { useAppState } from "../../src/state/app-state";
import { radius, spacing, typography, useTheme, type ThemeColors } from "../../src/theme";

export default function AccountsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { accounts, archiveAccount } = useAppState();
  const [editing, setEditing] = useState<Account | undefined>();
  const [sheetOpen, setSheetOpen] = useState(false);
  // Bumped on every open so the form remounts with fresh state.
  const [session, setSession] = useState(0);

  const open = (account?: Account) => {
    setEditing(account);
    setSession((s) => s + 1);
    setSheetOpen(true);
  };

  const confirmArchive = (account: Account) =>
    Alert.alert("Archive account", `Hide “${account.name}”? Past payments keep their history.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Archive", style: "destructive", onPress: () => archiveAccount(account.id) },
    ]);

  const addRow = (
    <Pressable style={styles.addRow} onPress={() => open()}>
      <SymbolView name="plus.circle.fill" size={20} tintColor={colors.accent} />
      <Text style={styles.addText}>Add account</Text>
    </Pressable>
  );

  return (
    <View style={styles.screen}>
      {accounts.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No accounts yet</Text>
          <Text style={styles.emptyHint}>
            Add the accounts your payments are charged to — each subscription can then show which
            account it hits.
          </Text>
          {addRow}
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={accounts}
          keyExtractor={(a) => a.id}
          contentContainerStyle={styles.listContent}
          ListFooterComponent={addRow}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => open(item)}
              onLongPress={() => confirmArchive(item)}
            >
              <IconBadge icon={item.icon} color={item.color} />
              <View style={styles.middle}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {item.institution ? `${item.institution} · ` : ""}
                  {ACCOUNT_TYPES[item.type].label}
                </Text>
              </View>
              <Text style={styles.currency}>{item.currency}</Text>
            </Pressable>
          )}
        />
      )}

      <AccountEditSheet
        key={session}
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        account={editing}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    list: {
      flex: 1,
    },
    listContent: {
      padding: spacing.md,
      gap: spacing.sm,
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      padding: spacing.lg,
    },
    emptyTitle: {
      ...typography.subtitle,
      color: colors.text,
      fontWeight: "600",
    },
    emptyHint: {
      ...typography.body,
      color: colors.mutedText,
      textAlign: "center",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.md,
    },
    middle: {
      flex: 1,
      gap: 2,
    },
    name: {
      ...typography.label,
      color: colors.text,
    },
    sub: {
      ...typography.caption,
      color: colors.mutedText,
    },
    currency: {
      ...typography.label,
      color: colors.mutedText,
    },
    addRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      paddingVertical: spacing.md,
    },
    addText: {
      ...typography.label,
      color: colors.accent,
    },
  });
}
