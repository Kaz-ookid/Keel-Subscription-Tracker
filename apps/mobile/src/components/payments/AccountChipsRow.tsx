// The account filter row Upcoming and All share: "All" first, then the
// accounts A to Z (the eye scans an alphabet, not creation order), "No
// account" last. Press-and-hold an account chip to edit it right here,
// without the trip through Settings.

import { type Account } from "@keel/core";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, View } from "react-native";

import { hapticHold } from "../../lib/haptics";
import { AccountEditSheet } from "../AccountSheet";
import { Chip } from "../ui/Chip";
import { spacing } from "../../theme";

import { useLockGuard } from "../../lib/lock-gate";
interface Props {
  accounts: Account[];
  /** "all" | "none" (no account) | an account id. */
  filter: string;
  onFilter: (id: string) => void;
}

export function AccountChipsRow({ accounts, filter, onFilter }: Props) {
  const { t } = useTranslation();
  const sorted = useMemo(
    () => [...accounts].sort((a, b) => a.name.localeCompare(b.name)),
    [accounts],
  );

  // The long-press editor, self-contained: same remount-on-open idiom as the
  // Accounts screen so the form always starts from the pressed account.
  const [editing, setEditing] = useState<Account | undefined>();
  // Editing an account is a write; filtering stays free.
  const guard = useLockGuard();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [session, setSession] = useState(0);
  const openEditor = (account: Account) => {
    hapticHold();
    setEditing(account);
    setSession((s) => s + 1);
    setSheetOpen(true);
  };

  if (accounts.length === 0) return null;

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipRow}>
          <Chip
            label={t("upcoming.chipAll")}
            selected={filter === "all"}
            onPress={() => onFilter("all")}
          />
          {sorted.map((account) => (
            <Chip
              key={account.id}
              label={account.name}
              dot={account.color}
              selected={filter === account.id}
              onPress={() => onFilter(account.id)}
              onLongPress={guard(() => openEditor(account))}
            />
          ))}
          <Chip
            label={t("upcoming.chipNoAccount")}
            selected={filter === "none"}
            onPress={() => onFilter("none")}
          />
        </View>
      </ScrollView>
      <AccountEditSheet
        key={session}
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        account={editing}
      />
    </>
  );
}

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
});
