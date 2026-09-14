// iCloud & data: where the data lives and how it leaves. iCloud sync is a
// stored preference ahead of the real sync engine (local-first MVP, sync
// later per PROJECT_BRIEF §9); local backups run daily on their own; export
// and import move whole backups in and out as files; and the one truly
// destructive action lives at the bottom, red, behind a confirm.

import { today } from "@keel/core";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { useFocusEffect } from "expo-router";
import { useCallback } from "react";

import { activityDateLabel } from "../src/lib/ai-activity-display";
import { Card } from "../src/components/ui/Card";
import { IconChip } from "../src/components/ui/IconChip";
import { useAiHidden } from "../src/lib/ai-visibility";
import { listBackupStamps } from "../src/lib/backups";
import {
  downloadFromICloud,
  ICLOUD_ENABLED_KEY,
  isICloudAvailable,
  uploadToICloud,
} from "../src/lib/icloud-backup";
import { useAppActions } from "../src/state/app-state";
import { spacing, typography, useTheme, type ThemeColors } from "../src/theme";

const CHIP = {
  icloud: "#007AFF",
  history: "#5856D6",
  exportBackup: "#30B0C7",
  importBackup: "#34C759",
  ai: "#30B0C7",
  danger: "#FF3B30",
} as const;

export default function DataScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { exportData, importData, clearAllData } = useAppActions();
  const aiHidden = useAiHidden();

  const [icloud, setIcloud] = useState(false);
  // null while probing; false = no iCloud account on this iPhone.
  const [cloudReady, setCloudReady] = useState<boolean | null>(null);
  // The verifiable truth: when the cloud copy was written ("" = none found).
  // This line under the switch is how anyone checks the sync is real.
  const [cloudSavedAt, setCloudSavedAt] = useState<string | null>(null);
  const [backupCount, setBackupCount] = useState(0);

  const refreshCloudStatus = () => {
    void downloadFromICloud().then((envelope) => setCloudSavedAt(envelope?.savedAt ?? ""));
  };

  useEffect(() => {
    void AsyncStorage.getItem(ICLOUD_ENABLED_KEY).then((stored) => setIcloud(stored === "true"));
    void isICloudAvailable().then(setCloudReady);
    refreshCloudStatus();
  }, []);

  // The count updates when returning from the history screen. Stamps only:
  // the number of backups never needs their contents parsed.
  useFocusEffect(
    useCallback(() => {
      setBackupCount(listBackupStamps().length);
    }, []),
  );

  const toggleIcloud = (next: boolean) => {
    setIcloud(next);
    void AsyncStorage.setItem(ICLOUD_ENABLED_KEY, String(next));
    if (!next) return;
    // Turning it on must NEVER silently clobber an existing cloud copy: a
    // fresh install flipping the switch would otherwise upload its empty
    // state over the real backup. If a copy exists, the user picks a side.
    void downloadFromICloud().then((envelope) => {
      if (!envelope) {
        void uploadToICloud(exportData()).then(refreshCloudStatus);
        return;
      }
      Alert.alert(
        t("data.icloudChoiceTitle"),
        t("data.icloudChoiceMsg", { date: activityDateLabel(envelope.savedAt) }),
        [
          {
            text: t("data.icloudUseCloud"),
            onPress: () => {
              importData(JSON.stringify(envelope.state));
              refreshCloudStatus();
            },
          },
          {
            text: t("data.icloudReplaceCloud"),
            style: "destructive",
            onPress: () => {
              void uploadToICloud(exportData()).then(refreshCloudStatus);
            },
          },
          { text: t("common.cancel"), style: "cancel" },
        ],
      );
    });
  };

  const exportBackup = async () => {
    try {
      const file = new File(Paths.cache, `keel-backup-${today()}.json`);
      if (file.exists) file.delete();
      file.create();
      file.write(JSON.stringify(exportData(), null, 2));
      try {
        await Sharing.shareAsync(file.uri, { mimeType: "application/json" });
      } finally {
        // The share sheet is done with the file: a full financial dump must
        // not linger in the cache (2026-09-14 security audit).
        if (file.exists) file.delete();
      }
    } catch {
      Alert.alert(t("settings.exportFailTitle"), t("settings.exportFailMsg"));
    }
  };

  const importBackup = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: "application/json" });
      if (picked.canceled || !picked.assets[0]) return;
      const content = new File(picked.assets[0].uri).textSync();
      Alert.alert(t("settings.restoreTitle"), t("settings.restoreMsg"), [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("settings.replace"),
          style: "destructive",
          onPress: () => {
            const result = importData(content);
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
    } catch {
      Alert.alert(t("settings.importFailTitle"), t("settings.importFailRead"));
    }
  };

  const confirmClear = () =>
    Alert.alert(t("settings.clearAll"), t("settings.clearMsg"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("settings.deleteEverything"), style: "destructive", onPress: clearAllData },
    ]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Text style={styles.largeTitle}>{t("data.title")}</Text>

      <Text style={styles.groupLabel}>{t("data.groupIcloud")}</Text>
      <Card>
        <View style={styles.row}>
          <IconChip icon="icloud.fill" color={CHIP.icloud} />
          <Text style={styles.rowText}>{t("data.icloudSync")}</Text>
          <Switch
            value={icloud}
            onValueChange={toggleIcloud}
            disabled={cloudReady === false}
            trackColor={{ true: colors.accent }}
          />
        </View>
        <Text style={styles.footnote}>
          {cloudReady === false ? t("data.icloudUnavailable") : t("data.icloudFooter")}
          {cloudReady !== false && cloudSavedAt !== null
            ? `\n${
                cloudSavedAt === ""
                  ? t("data.icloudNone")
                  : t("data.icloudStatus", { date: activityDateLabel(cloudSavedAt) })
              }`
            : ""}
        </Text>
      </Card>

      <Text style={styles.groupLabel}>{t("data.groupLocal")}</Text>
      <Card>
        <Pressable style={styles.row} onPress={() => router.push("/backups")}>
          <IconChip icon="externaldrive.fill" color={CHIP.history} />
          <Text style={styles.rowText}>{t("data.backupHistory")}</Text>
          <Text style={styles.rowValue}>{backupCount || ""}</Text>
          <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
        </Pressable>
        <Pressable style={[styles.row, styles.rowDivider]} onPress={() => void exportBackup()}>
          <IconChip icon="square.and.arrow.up" color={CHIP.exportBackup} />
          <Text style={styles.rowText}>{t("settings.exportBackup")}</Text>
        </Pressable>
        <Pressable style={[styles.row, styles.rowDivider]} onPress={() => void importBackup()}>
          <IconChip icon="square.and.arrow.down" color={CHIP.importBackup} />
          <Text style={styles.rowText}>{t("settings.restoreBackup")}</Text>
        </Pressable>
        {/* The AI trace lives with the data it touched (its old tab is gone):
            what AI added or changed, and the revert per action. */}
        {!aiHidden && (
          <Pressable
            style={[styles.row, styles.rowDivider]}
            onPress={() => router.push("/ai-history")}
          >
            <IconChip icon="sparkles" color={CHIP.ai} />
            <Text style={styles.rowText}>{t("aiHistory.title")}</Text>
            <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
          </Pressable>
        )}
        <Text style={styles.footnote}>{t("settings.backupFooter")}</Text>
      </Card>

      <Card>
        <Pressable style={styles.row} onPress={confirmClear}>
          <Text style={[styles.rowText, styles.dangerText]}>{t("settings.clearAll")}</Text>
        </Pressable>
        <Text style={styles.footnote}>{t("data.clearFooter")}</Text>
      </Card>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: "transparent" },
    content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
    largeTitle: { fontSize: 34, fontWeight: "700", color: colors.text },
    groupLabel: {
      ...typography.micro,
      color: colors.mutedText,
      marginBottom: -spacing.sm,
      paddingHorizontal: spacing.xs,
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
