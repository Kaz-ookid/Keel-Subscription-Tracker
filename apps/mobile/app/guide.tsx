// "What Keel can do": a compact field guide to the features people miss —
// one screen, four groups, every row a capability plus the one sentence that
// makes it usable. No walkthrough chrome, no screenshots; the app itself is
// one tab away.

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Card } from "../src/components/ui/Card";
import { IconChip } from "../src/components/ui/IconChip";
import { useAiHidden } from "../src/lib/ai-visibility";
import { spacing, typography, useTheme, type ThemeColors } from "../src/theme";

// One row per capability: chip icon + color, then title/body i18n keys
// (guide.<key>Title / guide.<key>Body).
const GROUPS: {
  labelKey: string;
  rows: { key: string; icon: string; color: string }[];
}[] = [
  {
    labelKey: "guide.groupTrack",
    rows: [
      { key: "split", icon: "creditcard.and.123", color: "#FF9500" },
      { key: "settlement", icon: "checkmark.circle.fill", color: "#34C759" },
      { key: "overdue", icon: "exclamationmark.circle.fill", color: "#FF3B30" },
      { key: "pause", icon: "pause.circle.fill", color: "#8E8E93" },
      { key: "peek", icon: "calendar.badge.clock", color: "#007AFF" },
      { key: "currency", icon: "coloncurrencysign.circle", color: "#5856D6" },
    ],
  },
  {
    labelKey: "guide.groupAhead",
    rows: [
      { key: "trial", icon: "hourglass", color: "#FF9500" },
      { key: "priceChange", icon: "chart.line.uptrend.xyaxis", color: "#FF3B30" },
      { key: "reminders", icon: "bell.fill", color: "#AF52DE" },
      { key: "weekend", icon: "calendar.circle.fill", color: "#34C759" },
      { key: "digest", icon: "tray.full.fill", color: "#007AFF" },
    ],
  },
  {
    labelKey: "guide.groupUnderstand",
    rows: [
      { key: "views", icon: "square.grid.2x2.fill", color: "#30B0C7" },
      { key: "insights", icon: "chart.bar.fill", color: "#007AFF" },
      { key: "smoothing", icon: "arrow.triangle.2.circlepath", color: "#34C759" },
    ],
  },
  {
    labelKey: "guide.groupSetup",
    rows: [
      { key: "ai", icon: "sparkles", color: "#30B0C7" },
      { key: "todo", icon: "rectangle.stack.fill", color: "#FF9500" },
      { key: "backup", icon: "externaldrive.fill", color: "#007AFF" },
      { key: "lock", icon: "faceid", color: "#32ADE6" },
      { key: "widgets", icon: "apps.iphone", color: "#FF2D55" },
    ],
  },
];

export default function GuideScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // The hard AI lock hides the guide's AI chapter along with the feature.
  const aiHidden = useAiHidden();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Text style={styles.largeTitle}>{t("guide.title")}</Text>
      <Text style={styles.intro}>{t("guide.intro")}</Text>

      {GROUPS.map((group) => (
        <View key={group.labelKey} style={styles.group}>
          <Text style={styles.groupLabel}>{t(group.labelKey)}</Text>
          <Card>
            {group.rows
              .filter((row) => !(aiHidden && row.key === "ai"))
              .map((row, i) => (
                <View key={row.key} style={[styles.row, i > 0 && styles.rowDivider]}>
                  <IconChip icon={row.icon} color={row.color} />
                  <View style={styles.rowTexts}>
                    <Text style={styles.rowTitle}>{t(`guide.${row.key}Title`)}</Text>
                    <Text style={styles.rowBody}>{t(`guide.${row.key}Body`)}</Text>
                  </View>
                </View>
              ))}
          </Card>
        </View>
      ))}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: "transparent" },
    content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
    largeTitle: { fontSize: 34, fontWeight: "700", color: colors.text },
    intro: { ...typography.body, color: colors.mutedText, marginTop: -spacing.sm },
    group: { gap: spacing.sm },
    groupLabel: {
      ...typography.micro,
      color: colors.mutedText,
      paddingHorizontal: spacing.xs,
    },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
      paddingVertical: spacing.sm + 4,
    },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    rowTexts: { flex: 1, gap: 2 },
    rowTitle: { ...typography.label, color: colors.text },
    rowBody: { ...typography.caption, color: colors.mutedText, lineHeight: 18 },
  });
}
