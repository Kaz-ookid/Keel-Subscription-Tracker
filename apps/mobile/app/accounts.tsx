import { currencyLabel, type Account } from "@keel/core";
import { Stack } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { AccountEditSheet } from "../src/components/AccountSheet";
import { BrandBadge } from "../src/components/BrandBadge";
import { EmptyState } from "../src/components/ui/EmptyState";
import { useAppState } from "../src/state/app-state";
import { radius, spacing, typography, useTheme, type ThemeColors } from "../src/theme";

export default function AccountsScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
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
    Alert.alert(t("accounts.archiveTitle"), t("accounts.archiveAsk", { name: account.name }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("accounts.archive"),
        style: "destructive",
        onPress: () => archiveAccount(account.id),
      },
    ]);

  return (
    <View style={styles.screen}>
      {/* The screen's single primary action lives in the header (§3.5). */}
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={() => open()}
              hitSlop={12}
              accessibilityLabel={t("accounts.addAccount")}
            >
              <SymbolView name="plus" size={20} tintColor={colors.white} />
            </Pressable>
          ),
        }}
      />
      {accounts.length === 0 ? (
        <View style={styles.center}>
          <EmptyState
            icon="creditcard"
            title={t("accounts.emptyTitle")}
            hint={t("accounts.emptyHint")}
            cta={{
              label: t("accounts.addAccount"),
              onPress: () => open(),
              icon: "plus.circle.fill",
              variant: "quiet",
            }}
          />
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={accounts}
          keyExtractor={(a) => a.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => open(item)}
              onLongPress={() => confirmArchive(item)}
            >
              <BrandBadge icon={item.icon} color={item.color} />
              <View style={styles.middle}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.institution ? (
                  <Text style={styles.sub} numberOfLines={1}>
                    {item.institution}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.currency}>{currencyLabel(item.currency)}</Text>
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
      backgroundColor: "transparent",
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
      justifyContent: "center",
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
  });
}
