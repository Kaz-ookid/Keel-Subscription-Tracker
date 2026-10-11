import { currencyLabel, type Account } from "@keel/core";
import { Stack } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AccountEditSheet } from "../src/components/AccountSheet";
import { BrandBadge } from "../src/components/BrandBadge";
import { EmptyState } from "../src/components/ui/EmptyState";
import { useAppActions, useAppData } from "../src/state/app-state";
import { radius, spacing, typography, useTheme, type ThemeColors } from "../src/theme";

import { useLockGuard } from "../src/lib/lock-gate";
export default function AccountsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { accounts } = useAppData();
  const { archiveAccount } = useAppActions();
  const [editing, setEditing] = useState<Account | undefined>();
  // Account changes are writes; viewing the list stays free.
  const guard = useLockGuard();
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
      {/* The screen's single primary action lives in the header (§3.5).
          Text, not a glyph: custom header glyphs drift off-center in the
          native bar (see ModalClose's rule). */}
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={guard(() => open())}
              hitSlop={12}
              accessibilityLabel={t("accounts.addAccount")}
            >
              <Text style={styles.headerAction}>{t("common.add")}</Text>
            </Pressable>
          ),
        }}
      />
      <Text style={[styles.largeTitle, { paddingTop: insets.top + 44 }]}>
        {t("titles.accounts")}
      </Text>
      {accounts.length === 0 ? (
        <View style={styles.center}>
          <EmptyState
            icon="creditcard"
            title={t("accounts.emptyTitle")}
            hint={t("accounts.emptyHint")}
            cta={{
              label: t("accounts.addAccount"),
              onPress: guard(() => open()),
              icon: "plus.circle.fill",
              variant: "quiet",
            }}
          />
        </View>
      ) : (
        <FlatList
          contentInsetAdjustmentBehavior="automatic"
          style={styles.list}
          data={accounts}
          keyExtractor={(a) => a.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={guard(() => open(item))}
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
    // Mirrors the right-side header actions elsewhere (label 15/600, accent).
    headerAction: { ...typography.label, color: colors.accent, paddingHorizontal: spacing.xs },
    // Below the transparent header (back + add float above this).
    largeTitle: {
      fontSize: 34,
      fontWeight: "700",
      color: colors.text,
      paddingHorizontal: spacing.md,
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
      backgroundColor: colors.material,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: radius.lg,
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
