// History: the itemized spending ledger — every actual charge, newest first,
// searchable and filterable (range / account / category). The statement view,
// complementary to Insights (the shape) and the Calendar (one month). All the
// "what actually went out" math is buildSpendLedger in @keel/core; this screen
// filters, groups by month, and formats.

import {
  buildSpendLedger,
  calendarDate,
  formatCalendarDate,
  formatMoney,
  formatTotalsIn,
  today,
  type CalendarDate,
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

import { BrandBadge } from "../../src/components/BrandBadge";
import { HeroCard } from "../../src/components/HeroCard";
import { Segmented } from "../../src/components/Segmented";
import { monthFull } from "../../src/i18n/dates";
import { useAppState } from "../../src/state/app-state";
import { radius, spacing, typography, useTheme, type ThemeColors } from "../../src/theme";

type Range = "3m" | "6m" | "12m" | "all";
const RANGE_MONTHS: Record<Exclude<Range, "all">, number> = { "3m": 3, "6m": 6, "12m": 12 };

function firstOfShiftedMonth(asOf: CalendarDate, delta: number): CalendarDate {
  const total = Number(asOf.slice(0, 4)) * 12 + (Number(asOf.slice(5, 7)) - 1) + delta;
  const y = Math.floor(total / 12);
  const m = String((total % 12) + 1).padStart(2, "0");
  return calendarDate(`${y}-${m}-01`);
}

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

  const [range, setRange] = useState<Range>("12m");
  // "all" | accountId | "none"; "all" | categoryId.
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const from =
    range === "all"
      ? calendarDate("1970-01-01")
      : firstOfShiftedMonth(asOf, -(RANGE_MONTHS[range] - 1));
  const ledger = useMemo(
    () => buildSpendLedger(items, occurrences, from, asOf),
    [items, occurrences, from, asOf],
  );

  // Categories that actually appear in the range — the only ones worth a chip.
  const presentCategories = useMemo(() => {
    const present = new Set(ledger.map((e) => e.categoryId));
    return categories.filter((c) => present.has(c.id));
  }, [ledger, categories]);

  const q = search.trim().toLowerCase();
  const sections = useMemo<MonthSection[]>(() => {
    const groups: MonthSection[] = [];
    for (const e of ledger) {
      if (accountFilter === "none" && e.accountId) continue;
      if (accountFilter !== "all" && accountFilter !== "none" && e.accountId !== accountFilter)
        continue;
      if (categoryFilter !== "all" && e.categoryId !== categoryFilter) continue;
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
  }, [ledger, accountFilter, categoryFilter, q]);

  const totals = (values: Parameters<typeof formatTotalsIn>[0]) =>
    formatTotalsIn(values, displayCurrency, rates);
  const allAmounts = sections.flatMap((s) => s.data.map((e) => e.amount));
  const count = allAmounts.length;

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

        <Segmented
          options={[
            { value: "3m" as Range, label: t("history.range3m") },
            { value: "6m" as Range, label: t("history.range6m") },
            { value: "12m" as Range, label: t("history.range12m") },
            { value: "all" as Range, label: t("history.rangeAll") },
          ]}
          value={range}
          onChange={setRange}
        />

        {accounts.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {accountChips.map((chip) => {
              const active = accountFilter === chip.id;
              return (
                <Pressable
                  key={chip.id}
                  onPress={() => setAccountFilter(chip.id)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  {"dot" in chip && chip.dot ? (
                    <View style={[styles.chipDot, { backgroundColor: chip.dot }]} />
                  ) : null}
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {chip.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {presentCategories.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {[
              { id: "all", label: t("history.filterAll") },
              ...presentCategories.map((c) => ({
                id: c.id,
                label: t(`categories.${c.id}`, { defaultValue: c.name }),
              })),
            ].map((chip) => {
              const active = categoryFilter === chip.id;
              return (
                <Pressable
                  key={chip.id}
                  onPress={() => setCategoryFilter(chip.id)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {chip.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(e) => `${e.paymentItemId}-${e.date}-${e.kind}`}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <HeroCard
            label={t("history.spent")}
            amount={count > 0 ? totals(allAmounts) : t("history.nothingSpent")}
            sub={t("history.count", { count })}
          />
        }
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
          <View style={styles.empty}>
            <SymbolView name="clock.fill" size={30} tintColor={colors.mutedText} />
            <Text style={styles.emptyTitle}>{t("history.emptyTitle")}</Text>
            <Text style={styles.emptyHint}>{t("history.emptyHint")}</Text>
          </View>
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
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs + 2,
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipActive: { backgroundColor: colors.navy, borderColor: colors.navy },
    chipDot: { width: 8, height: 8, borderRadius: 4 },
    chipText: { ...typography.caption, fontWeight: "600", color: colors.text },
    chipTextActive: { color: colors.white },
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
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      paddingTop: spacing.xl * 2,
    },
    emptyTitle: { ...typography.subtitle, fontWeight: "600", color: colors.text },
    emptyHint: { ...typography.body, color: colors.mutedText, textAlign: "center" },
  });
}
