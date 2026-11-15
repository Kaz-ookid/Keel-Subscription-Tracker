// iCloud & data: where the data lives and how it leaves. iCloud sync is a
// stored preference ahead of the real sync engine (local-first MVP, sync
// later per PROJECT_BRIEF §9); local backups run daily on their own; export
// writes a backup or a spreadsheet; import takes either back (a spreadsheet
// adds its items after a review; a backup replaces everything or, when the
// app already holds items, can add its own through that same review); and
// the one truly destructive action lives at the bottom, red, behind a confirm.

import { parseImportDocument, today } from "@keel/core";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useFocusEffect, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { activityDateLabel } from "../src/lib/ai-activity-display";
import { Card } from "../src/components/ui/Card";
import { IconChip } from "../src/components/ui/IconChip";
import { ScreenTitle } from "../src/components/ui/ScreenTitle";
import { useAiHidden } from "../src/lib/ai-visibility";
import { listBackupStamps } from "../src/lib/backups";
import { DATA_FILE_TYPES, readKeelCsv, showExportChoices, stateToCsv } from "../src/lib/data-files";
import {
  deleteFromICloud,
  downloadFromICloud,
  ICLOUD_ENABLED_KEY,
  isICloudAvailable,
  uploadToICloud,
} from "../src/lib/icloud-backup";
import { parsePersistedState } from "../src/lib/storage";
import { showPayments } from "../src/lib/tabReset";
import { useAppActions, useAppData } from "../src/state/app-state";
import { useImportSession } from "../src/state/import-session";
import { spacing, type ThemeColors, typography, useStyles, useTheme } from "../src/theme";

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
  const { colors, scheme } = useTheme();
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const { exportData, importData, clearAllData } = useAppActions();
  const { items, accounts, categories, displayCurrency } = useAppData();
  const { startSession } = useImportSession();
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
    if (!next) {
      setIcloud(false);
      void AsyncStorage.setItem(ICLOUD_ENABLED_KEY, "false");
      // Off is off: the copy in iCloud goes too unless the user keeps it.
      Alert.alert(t("data.icloudOffTitle"), t("data.icloudOffMsg"), [
        { text: t("data.icloudKeepCopy"), style: "cancel" },
        {
          text: t("data.icloudDeleteCopy"),
          style: "destructive",
          onPress: () => {
            void deleteFromICloud().then((done) => {
              refreshCloudStatus();
              if (!done)
                Alert.alert(t("data.icloudDeleteFailTitle"), t("data.icloudDeleteFailMsg"));
            });
          },
        },
      ]);
      return;
    }
    // Turning it on must NEVER silently clobber an existing cloud copy: a
    // fresh install flipping the switch would otherwise upload its empty
    // state over the real backup. If a copy exists, the user picks a side,
    // and the switch is stored "on" only once a side IS picked: stored
    // earlier, a Cancel would leave it on with nothing uploaded, and the
    // next launch would adopt the old cloud copy over the local data with
    // no prompt at all.
    const enable = () => {
      setIcloud(true);
      void AsyncStorage.setItem(ICLOUD_ENABLED_KEY, "true");
    };
    void downloadFromICloud().then((envelope) => {
      if (!envelope) {
        enable();
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
              enable();
              importData(JSON.stringify(envelope.state));
              refreshCloudStatus();
            },
          },
          {
            text: t("data.icloudReplaceCloud"),
            style: "destructive",
            onPress: () => {
              enable();
              void uploadToICloud(exportData()).then(refreshCloudStatus);
            },
          },
          { text: t("common.cancel"), style: "cancel" },
        ],
      );
    });
  };

  const failImport = (messageKey: string) =>
    Alert.alert(t("settings.importFailTitle"), t(messageKey));

  // A spreadsheet never replaces anything: its rows go through the import
  // parser and land on the review screen, where saving adds them.
  const importCsv = (content: string) => {
    const document = readKeelCsv(content, categories);
    if (!document) return failImport("settings.importFailNotBackup");
    const result = parseImportDocument(JSON.stringify(document), {
      defaultCurrency: displayCurrency,
      today: today(),
      accounts,
      categories,
      takenNames: items.map((i) => i.name),
    });
    if (result.drafts.length === 0) return failImport("settings.importCsvEmpty");
    startSession(result.drafts, result.skipped, "csv", result.skippedNames);
    router.push({ pathname: "/add/import-review", params: { direct: "1" } });
  };

  const importFile = async () => {
    let content: string;
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: DATA_FILE_TYPES });
      if (picked.canceled || !picked.assets[0]) return;
      const file = new File(picked.assets[0].uri);
      try {
        content = file.textSync();
      } finally {
        // The picker's cache copy is a plain financial document: not kept.
        try {
          file.delete();
        } catch {
          // Best-effort cleanup.
        }
      }
    } catch {
      return failImport("settings.importFailRead");
    }
    // Which kind of file it is gets decided before anything is asked.
    const backup = parsePersistedState(content);
    if (!backup) return importCsv(content);
    const restore = () => {
      const result = importData(content);
      if (!result.ok) return failImport("settings.importFailNotBackup");
      showPayments(router);
      if (result.dropped > 0) {
        Alert.alert(
          t("settings.restoreTitle"),
          t("settings.restoredPartial", { count: result.dropped }),
        );
      }
    };
    // Nothing to lose, nothing to ask.
    if (items.length === 0) return restore();
    // With items already here the backup can replace them, or join them:
    // its items take the spreadsheet's road to the review screen, where
    // duplicates are flagged and saving adds. No merge of two histories.
    Alert.alert(t("settings.restoreTitle"), t("settings.restoreChoiceMsg"), [
      { text: t("settings.replace"), style: "destructive", onPress: restore },
      { text: t("settings.restoreAdd"), onPress: () => importCsv(stateToCsv(backup)) },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  };

  const confirmClear = () =>
    Alert.alert(t("settings.clearAll"), t("settings.clearMsg"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("settings.deleteEverything"),
        style: "destructive",
        onPress: () => {
          clearAllData();
          showPayments(router);
        },
      },
    ]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <ScreenTitle>{t("data.title")}</ScreenTitle>

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
        <Pressable
          style={[styles.row, styles.rowDivider]}
          onPress={() => showExportChoices(exportData, scheme)}
        >
          <IconChip icon="square.and.arrow.up" color={CHIP.exportBackup} />
          <Text style={styles.rowText}>{t("settings.export")}</Text>
        </Pressable>
        <Pressable style={[styles.row, styles.rowDivider]} onPress={() => void importFile()}>
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
    groupLabel: {
      ...typography.groupLabel,
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
