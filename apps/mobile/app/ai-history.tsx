// The full AI trace: every action AI performed, newest first, with the item
// names it touched. Assistant actions carry their safety backup while it is
// kept (last 10 backups), so any of them can be reverted from here — the
// revert restores the data as it was right before that action, snapshots the
// present first, and the trace itself always survives.

import { type AiActivityEntry } from "@keel/core";
import { Stack } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Card } from "../src/components/ui/Card";
import {
  activityDateLabel,
  toolLabelKey,
  useActivitySummary,
} from "../src/lib/ai-activity-display";
import { listBackupStamps } from "../src/lib/backups";
import { useAppActions, useAppData } from "../src/state/app-state";
import { spacing, typography, useTheme, type ThemeColors } from "../src/theme";

const NAMES_SHOWN = 4;

export default function AiHistoryScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { aiActivity } = useAppData();
  const { revertAiBackup } = useAppActions();
  const summarize = useActivitySummary();

  // Which safety backups still exist (stamps only, no file contents): only
  // those entries can offer a revert. Refreshed after every revert.
  const [stampsVersion, setStampsVersion] = useState(0);
  const backupNames = useMemo(
    () => new Set(listBackupStamps().map((s) => s.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stampsVersion],
  );

  const confirmRevert = (entry: AiActivityEntry) => {
    if (!entry.backupName) return;
    const backupName = entry.backupName;
    Alert.alert(t("aiHistory.revertTitle"), t("aiHistory.revertMsg"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("aiHistory.revert"),
        style: "destructive",
        onPress: () => {
          const ok = revertAiBackup(backupName);
          setStampsVersion((v) => v + 1);
          if (!ok) Alert.alert(t("settings.importFailTitle"), t("aiHistory.revertGone"));
        },
      },
    ]);
  };

  const namesLine = (entry: AiActivityEntry): string => {
    const shown = entry.itemNames.slice(0, NAMES_SHOWN).join(", ");
    const extra = entry.itemNames.length - NAMES_SHOWN;
    return extra > 0 ? `${shown} +${extra}` : shown;
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Stack.Screen options={{ title: "" }} />
      <Text style={styles.largeTitle}>{t("aiHistory.title")}</Text>

      {aiActivity.length === 0 && (
        <Card>
          <Text style={styles.footnote}>{t("aiHub.historyEmpty")}</Text>
        </Card>
      )}

      {aiActivity.length > 0 && (
        <Card>
          {aiActivity.map((entry, i) => (
            <View key={entry.id} style={[styles.row, i > 0 && styles.rowDivider]}>
              <View style={styles.rowMiddle}>
                <Text style={styles.rowText}>{t(toolLabelKey(entry.tool))}</Text>
                <Text style={styles.rowSub}>{activityDateLabel(entry.at)}</Text>
                {summarize(entry) !== "" && <Text style={styles.rowSub}>{summarize(entry)}</Text>}
                {entry.itemNames.length > 0 && (
                  <Text style={styles.rowNames} numberOfLines={2}>
                    {namesLine(entry)}
                  </Text>
                )}
              </View>
              {entry.backupName && backupNames.has(entry.backupName) && (
                <Pressable
                  style={styles.revert}
                  onPress={() => confirmRevert(entry)}
                  hitSlop={8}
                  accessibilityLabel={t("aiHistory.revert")}
                >
                  <SymbolView
                    name="arrow.uturn.backward.circle"
                    size={18}
                    tintColor={colors.accent}
                  />
                  <Text style={styles.revertText}>{t("aiHistory.revert")}</Text>
                </Pressable>
              )}
            </View>
          ))}
        </Card>
      )}

      {aiActivity.length > 0 && <Text style={styles.footnote}>{t("aiHistory.footer")}</Text>}
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
    rowText: { ...typography.body, color: colors.text },
    rowSub: { ...typography.caption, color: colors.mutedText },
    rowNames: { ...typography.caption, color: colors.mutedText, fontStyle: "italic" },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    revert: { alignItems: "center", gap: 2 },
    revertText: { ...typography.micro, color: colors.accent },
    footnote: {
      ...typography.caption,
      color: colors.mutedText,
      lineHeight: 18,
      paddingHorizontal: spacing.xs,
    },
  });
}
