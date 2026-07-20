// The AI tab: every AI capability in one place — the assistant, the two
// import doors, the trace of everything AI has done, and the privacy stance,
// stated plainly. Everything here runs through the same review-first
// philosophy: AI proposes, the user confirms, Keel keeps a backup.

import { Redirect, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Card } from "../../src/components/ui/Card";
import { TabFade } from "../../src/components/TabFade";
import {
  activityDateLabel,
  toolLabelKey,
  useActivitySummary,
} from "../../src/lib/ai-activity-display";
import { useAiHidden } from "../../src/lib/ai-visibility";
import { useTabReset } from "../../src/lib/tabReset";
import { useAppData } from "../../src/state/app-state";
import {
  dockClearance,
  radius,
  spacing,
  typography,
  useTheme,
  withAlpha,
  type ThemeColors,
} from "../../src/theme";

const PREVIEW_COUNT = 3;

export default function AiHubScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { aiActivity } = useAppData();
  const summarize = useActivitySummary();
  const aiHidden = useAiHidden();

  // Tab re-tap (§9i): back to the top.
  const scrollRef = useRef<ScrollView>(null);
  const resetSignal = useTabReset("ai");
  useEffect(() => {
    if (resetSignal) scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [resetSignal]);

  // The hard AI lock: even a stale link to this tab lands on Payments.
  if (aiHidden) return <Redirect href="/" />;

  const preview = aiActivity.slice(0, PREVIEW_COUNT);

  return (
    <TabFade style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        style={styles.screen}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        <Text style={styles.largeTitle}>{t("aiHub.title")}</Text>
        <Text style={styles.heroSub}>{t("aiHub.hero")}</Text>

        {/* The assistant: the tab's main act. */}
        <Pressable style={styles.assistantCard} onPress={() => router.push("/assistant")}>
          <View style={styles.assistantHead}>
            <SymbolView name="sparkles" size={22} tintColor={colors.accent} />
            <Text style={styles.assistantTitle}>{t("aiHub.assistantTitle")}</Text>
            <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
          </View>
          <Text style={styles.assistantBody}>{t("aiHub.assistantBody")}</Text>
        </Pressable>

        {/* One door to the import hub — the method choice (Keel's reader vs
            your own AI) lives THERE, never duplicated here. */}
        <Card>
          <Pressable
            style={styles.row}
            onPress={() => router.push({ pathname: "/add/import", params: { direct: "1" } })}
          >
            <SymbolView name="doc.text.viewfinder" size={20} tintColor={colors.accent} />
            <View style={styles.rowMiddle}>
              <Text style={styles.rowText}>{t("aiHub.toolImport")}</Text>
              <Text style={styles.rowSub}>{t("aiHub.toolImportSub")}</Text>
            </View>
            <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
          </Pressable>
        </Card>

        <Text style={styles.groupLabel}>{t("aiHistory.title")}</Text>
        <Card>
          {preview.length === 0 && <Text style={styles.footnote}>{t("aiHub.historyEmpty")}</Text>}
          {preview.map((entry, i) => (
            <View key={entry.id} style={[styles.row, i > 0 && styles.rowDivider]}>
              <View style={styles.rowMiddle}>
                <Text style={styles.rowText}>{t(toolLabelKey(entry.tool))}</Text>
                <Text style={styles.rowSub}>
                  {activityDateLabel(entry.at)}
                  {summarize(entry) ? ` · ${summarize(entry)}` : ""}
                </Text>
              </View>
            </View>
          ))}
          {aiActivity.length > 0 && (
            <Pressable
              style={[styles.row, styles.rowDivider]}
              onPress={() => router.push("/ai-history")}
            >
              <Text style={[styles.rowText, { color: colors.accent }]}>{t("aiHub.seeAll")}</Text>
              <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
            </Pressable>
          )}
        </Card>

        {/* The stance, in three calm lines: optional (with the hard lock),
            what Keel itself promises, and the honest limit of that promise. */}
        <Text style={styles.groupLabel}>{t("aiHub.privacyTitle")}</Text>
        <Card>
          {(
            [
              ["aiHub.privacy0", "hand.raised"],
              ["aiHub.privacy1", "checkmark.shield"],
              ["aiHub.privacy2", "lock.shield"],
            ] as const
          ).map(([key, icon], i) => (
            <View key={key} style={[styles.privacyRow, i > 0 && styles.privacyRowGap]}>
              <SymbolView name={icon} size={16} tintColor={colors.mutedText} />
              <Text style={styles.privacyText}>{t(key)}</Text>
            </View>
          ))}
          <View style={styles.privacyPad} />
        </Card>
      </ScrollView>
    </TabFade>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: "transparent" },
    content: {
      padding: spacing.md,
      paddingBottom: dockClearance,
      gap: spacing.md,
    },
    largeTitle: { fontSize: 34, fontWeight: "700", color: colors.text },
    heroSub: {
      ...typography.caption,
      color: colors.mutedText,
      marginTop: -spacing.sm,
      lineHeight: 18,
    },
    assistantCard: {
      backgroundColor: withAlpha(colors.accent, 0.12),
      borderWidth: 1,
      borderColor: withAlpha(colors.accent, 0.45),
      borderRadius: radius.xl,
      padding: spacing.md,
      gap: spacing.sm,
    },
    assistantHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    assistantTitle: { ...typography.label, color: colors.text, flex: 1 },
    assistantBody: { ...typography.caption, color: colors.mutedText, lineHeight: 18 },
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
    rowMiddle: { flex: 1, gap: 1 },
    rowText: { ...typography.body, color: colors.text },
    rowSub: { ...typography.caption, color: colors.mutedText },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    footnote: {
      ...typography.caption,
      color: colors.mutedText,
      paddingVertical: spacing.md,
      lineHeight: 18,
    },
    privacyRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
      paddingTop: spacing.md,
    },
    privacyRowGap: { paddingTop: spacing.sm },
    privacyText: { ...typography.caption, color: colors.mutedText, flex: 1, lineHeight: 18 },
    privacyPad: { height: spacing.md },
  });
}
