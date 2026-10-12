// The local backup history: one automatic snapshot a day plus manual ones,
// each row opening restore / share / delete. Restoring replaces everything,
// so it confirms first, exactly like importing a backup file.

import { formatCalendarDate, calendarDate } from "@keel/core";
import * as Sharing from "expo-sharing";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Card } from "../src/components/ui/Card";
import {
  createBackup,
  deleteAllBackups,
  deleteBackup,
  listBackups,
  readBackup,
  type BackupEntry,
} from "../src/lib/backups";
import { showNativeActionSheet } from "../src/lib/native-sheet";
import { useAppActions } from "../src/state/app-state";
import { spacing, type ThemeColors, typography, useStyles, useTheme } from "../src/theme";

function entryDateLabel(entry: BackupEntry): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = formatCalendarDate(
    calendarDate(
      `${entry.createdAt.getFullYear()}-${pad(entry.createdAt.getMonth() + 1)}-${pad(entry.createdAt.getDate())}`,
    ),
  );
  return `${day} · ${pad(entry.createdAt.getHours())}:${pad(entry.createdAt.getMinutes())}`;
}

export default function BackupsScreen() {
  const { colors, scheme } = useTheme();
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const { exportData, importData } = useAppActions();
  const [entries, setEntries] = useState<BackupEntry[]>(() => listBackups());

  const refresh = () => setEntries(listBackups());

  const create = () => {
    if (!createBackup(exportData())) {
      Alert.alert(t("settings.exportFailTitle"), t("settings.exportFailMsg"));
    }
    refresh();
  };

  const restore = (entry: BackupEntry) =>
    Alert.alert(t("backups.restoreTitle"), t("settings.restoreMsg"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("settings.replace"),
        style: "destructive",
        onPress: () => {
          const content = readBackup(entry.name);
          const result = content ? importData(content) : { ok: false, dropped: 0 };
          if (!result.ok) {
            Alert.alert(t("settings.importFailTitle"), t("settings.importFailNotBackup"));
          } else if (result.dropped > 0) {
            Alert.alert(
              t("settings.restoreTitle"),
              t("settings.restoredPartial", { count: result.dropped }),
            );
          }
        },
      },
    ]);

  const openEntry = (entry: BackupEntry) => {
    showNativeActionSheet(
      {
        title: entryDateLabel(entry),
        options: [
          t("backups.restore"),
          t("backups.share"),
          t("backups.delete"),
          t("common.cancel"),
        ],
        destructiveButtonIndex: 2,
        cancelButtonIndex: 3,
        userInterfaceStyle: scheme,
      },
      (index) => {
        if (index === 0) restore(entry);
        else if (index === 1) void Sharing.shareAsync(entry.uri, { mimeType: "application/json" });
        else if (index === 2) {
          deleteBackup(entry.name);
          refresh();
        }
      },
    );
  };

  const confirmDeleteAll = () =>
    Alert.alert(t("backups.deleteAll"), t("backups.deleteAllMsg"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("settings.deleteEverything"),
        style: "destructive",
        onPress: () => {
          deleteAllBackups();
          refresh();
        },
      },
    ]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Text style={styles.largeTitle}>{t("backups.title")}</Text>

      <Card>
        <Pressable style={styles.row} onPress={create}>
          <SymbolView name="plus.circle.fill" size={20} tintColor={colors.accent} />
          <Text style={[styles.rowText, { color: colors.accent }]}>{t("backups.create")}</Text>
        </Pressable>
        <Text style={styles.footnote}>{t("backups.autoFooter")}</Text>
      </Card>

      {entries.length > 0 && (
        <Card>
          {entries.map((entry, i) => (
            <Pressable
              key={entry.name}
              style={[styles.row, i > 0 && styles.rowDivider]}
              onPress={() => openEntry(entry)}
            >
              <View style={styles.rowMiddle}>
                <Text style={styles.rowText}>{entryDateLabel(entry)}</Text>
                <Text style={styles.rowSub}>
                  {t("backups.items", { count: entry.itemCount })}
                  {" · "}
                  {t("backups.accounts", { count: entry.accountCount })}
                  {entry.auto ? ` · ${t("backups.autoTag")}` : ""}
                  {entry.kind === "ai" ? ` · ${t("backups.aiTag")}` : ""}
                </Text>
              </View>
              <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
            </Pressable>
          ))}
        </Card>
      )}

      {entries.length > 0 && (
        <Card>
          <Pressable style={styles.row} onPress={confirmDeleteAll}>
            <Text style={[styles.rowText, styles.dangerText]}>{t("backups.deleteAll")}</Text>
          </Pressable>
        </Card>
      )}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: "transparent" },
    content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
    largeTitle: { fontSize: 34, fontWeight: "700", color: colors.text },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.md,
    },
    rowMiddle: { flex: 1, gap: 1 },
    rowText: {
      ...typography.body,
      color: colors.text,
    },
    rowSub: { ...typography.caption, color: colors.mutedText },
    dangerText: { color: colors.tones.danger },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    footnote: {
      ...typography.caption,
      color: colors.mutedText,
      paddingBottom: spacing.md,
      paddingTop: spacing.xs,
    },
  });
}
