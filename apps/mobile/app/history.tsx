// History: the bank-statement view — every charge that ACTUALLY happened,
// newest first, searchable, filterable by account, grouped by month with
// totals. Its one job (nothing else covers it): find a real past charge
// across everything ("did that really bill me, when, how much"). Insights
// answers one month at a time, item pages one commitment at a time.
// Deliberately lean: search, chips, list — no hero, no range pickers
// (2026-07-10 rethink; the month sections ARE the range control).
//
// Lives under Insights > Explore (its tab was retired the same day: a real
// feature, but too low-frequency for tab-level weight).

import {
  buildSpendLedger,
  calendarDate,
  formatCalendarDate,
  formatMoney,
  formatTotalsIn,
  today,
  type LedgerEntry,
} from "@keel/core";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { BrandBadge } from "../src/components/BrandBadge";
import { Chip } from "../src/components/ui/Chip";
import { EmptyState } from "../src/components/ui/EmptyState";
import { monthFull } from "../src/i18n/dates";
import { useAppState } from "../src/state/app-state";
import { radius, spacing, typography, useTheme, type ThemeColors } from "../src/theme";

interface MonthSection {
  title: string;
  year: string;
  monthIdx: number;
  data: LedgerEntry[];
}

export default function HistoryScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items, occurrences, accounts, categories, displayCurrency, rates } = useAppState();
  const asOf = today();

  // "all" | accountId | "none".
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Everything ever charged: the month sections are the range control.
  const ledger = useMemo(
    () => buildSpendLedger(items, occurrences, calendarDate("1970-01-01"), asOf),
    [items, occurrences, asOf],
  );

  const q = search.trim().toLowerCase();
  const sections = useMemo<MonthSection[]>(() => {
    const groups: MonthSection[] = [];
    for (const e of ledger) {
      if (accountFilter === "none" && e.accountId) continue;
      if (accountFilter !== "all" && accountFilter !== "none" && e.accountId !== accountFilter)
        continue;
      if (q && !e.name.toLowerCase().includes(q)) continue;
      const key = e.date.slice(0, 7);
      const head = groups[groups.length - 1];
      if (head && head.title === key) head.data.push(e);
      else
        groups.push({
          title: key,
          year: e.date.slice(0, 4),
          monthIdx: Number(e.date.slice(5, 7)) - 1,
          data: [e],
        });
    }
    return groups;
  }, [ledger, accountFilter, q]);

  const totals = (values: Parameters<typeof formatTotalsIn>[0]) =>
    formatTotalsIn(values, displayCurrency, rates);

  const accountChips = [
    { id: "all", label: t("history.filterAll") },
    ...accounts.map((a) => ({ id: a.id, label: a.name, dot: a.color })),
    { id: "none", label: t("upcoming.chipNoAccount") },
  ];

  return (
    <View style={styles.screen}>
      <View style={styles.controls}>
        <View style={styles.searchWrap}>
          <SymbolView name="magnifyingglass" size={16} tintColor={colors.mutedText} />
          <TextInput
            style={styles.search}
            value={search}
            onChangeText={setSearch}
            placeholder={t("history.searchPlaceholder")}
            placeholderTextColor={colors.mutedText}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>

        {accounts.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {accountChips.map((chip) => (
              <Chip
                key={chip.id}
                label={chip.label}
                selected={accountFilter === chip.id}
                onPress={() => setAccountFilter(chip.id)}
                dot={"dot" in chip ? chip.dot : undefined}
              />
            ))}
          </ScrollView>
        )}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(e) => `${e.paymentItemId}-${e.date}-${e.kind}`}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.listContent}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {monthFull(section.monthIdx)} {section.year}
            </Text>
            <Text style={styles.sectionTotal}>{totals(section.data.map((e) => e.amount))}</Text>
          </View>
        )}
        renderItem={({ item: e }) => {
          const category = categories.find((c) => c.id === e.categoryId);
          const account = accounts.find((a) => a.id === e.accountId);
          return (
            <Pressable
              style={styles.row}
              onPress={() => router.push({ pathname: "/item", params: { id: e.paymentItemId } })}
            >
              <BrandBadge
                domain={e.domain}
                icon={category?.icon}
                fallback={e.name.charAt(0).toUpperCase()}
                color={e.color ?? colors.accent}
                size={32}
              />
              <View style={styles.middle}>
                <Text style={styles.name} numberOfLines={1}>
                  {e.name}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {formatCalendarDate(e.date)}
                  {account ? ` · ${account.name}` : ""}
                </Text>
              </View>
              <Text style={styles.amount}>{formatMoney(e.amount)}</Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon="clock.fill"
            title={t("history.emptyTitle")}
            hint={t("history.emptyHint")}
            style={styles.empty}
          />
        }
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    controls: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
      gap: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
    },
    search: { flex: 1, paddingVertical: spacing.sm + 2, ...typography.body, color: colors.text },
    chips: { flexDirection: "row", gap: spacing.sm, paddingVertical: 2 },
    listContent: { padding: spacing.md, paddingBottom: spacing.xl, gap: 6 },
    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
      paddingTop: spacing.md,
      paddingBottom: spacing.xs,
    },
    sectionTitle: { ...typography.label, color: colors.text },
    sectionTotal: { ...typography.caption, fontWeight: "600", color: colors.text },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    middle: { flex: 1, gap: 1 },
    name: { ...typography.label, color: colors.text },
    sub: { ...typography.caption, color: colors.mutedText },
    amount: { ...typography.label, color: colors.text },
    empty: {
      paddingTop: spacing.xl * 2,
    },
  });
}
