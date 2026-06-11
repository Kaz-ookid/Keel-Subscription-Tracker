import {
  addRecurrence,
  calendarDate,
  endOfMonth,
  formatCalendarDate,
  formatMoney,
  projectCharges,
  sumByCurrency,
  type CalendarDate,
  type Money,
  type ProjectedCharge,
} from "@keel/core";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { UpcomingRow } from "../../src/components/UpcomingRow";
import { useSubscriptions } from "../../src/state/subscriptions";
import { radius, spacing, tones, typography, useTheme, type ThemeColors } from "../../src/theme";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function today(): CalendarDate {
  return calendarDate(new Date().toISOString().slice(0, 10));
}

/** "Today" / "Tomorrow" / "Mon 15.06" — the window is short, so no year. */
function dayLabel(date: CalendarDate, asOf: CalendarDate): string {
  if (date === asOf) return "Today";
  if (date === addRecurrence(asOf, { unit: "day", interval: 1 })) return "Tomorrow";
  const [y, m, d] = date.split("-").map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${date.slice(8, 10)}.${date.slice(5, 7)}`;
}

function monthName(date: CalendarDate): string {
  return MONTHS[Number(date.slice(5, 7)) - 1];
}

const formatTotals = (totals: Money[]) => totals.map(formatMoney).join(" + ");

interface Section {
  key: string;
  title: string;
  overdue?: boolean;
  data: ProjectedCharge[];
}

export default function UpcomingScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items, accounts, loading, markPaid, markInstallmentPaid } = useSubscriptions();
  // "all" | "none" (no account) | an account id.
  const [filter, setFilter] = useState("all");

  const asOf = today();
  const monthEnd = endOfMonth(asOf);
  const windowEnd = endOfMonth(addRecurrence(asOf, { unit: "month", interval: 1 }));

  // Cheap at this scale (a few dozen items × a 2-month window) — recompute.
  const allCharges = projectCharges(items, windowEnd);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const filtered =
    filter === "all"
      ? allCharges
      : allCharges.filter((c) => (filter === "none" ? !c.accountId : c.accountId === filter));

  // The earliest projected charge per item — "Mark paid" only acts on that one
  // (recording a payment / marking the next installment always hits it).
  const earliest = new Map<string, ProjectedCharge>();
  for (const c of allCharges) {
    if (!earliest.has(c.paymentItemId)) earliest.set(c.paymentItemId, c);
  }

  const selectedAccount = accounts.find((a) => a.id === filter);
  const dueThisMonth = sumByCurrency(
    filtered.filter((c) => c.dueDate <= monthEnd).map((c) => c.amount),
  );
  const dueNextMonth = sumByCurrency(
    filtered.filter((c) => c.dueDate > monthEnd).map((c) => c.amount),
  );

  // Sections: one "Overdue" bucket, then one per due day (insertion order is
  // chronological because the projection is sorted).
  const sections: Section[] = [];
  const overdueCharges = filtered.filter((c) => c.dueDate < asOf);
  if (overdueCharges.length > 0) {
    sections.push({ key: "overdue", title: "Overdue", overdue: true, data: overdueCharges });
  }
  const byDay = new Map<CalendarDate, ProjectedCharge[]>();
  for (const c of filtered) {
    if (c.dueDate < asOf) continue;
    const bucket = byDay.get(c.dueDate);
    if (bucket) bucket.push(c);
    else byDay.set(c.dueDate, [c]);
  }
  byDay.forEach((data, date) => {
    sections.push({ key: date, title: dayLabel(date, asOf), data });
  });

  const heroLabel = selectedAccount
    ? `${selectedAccount.name} needs`
    : filter === "none"
      ? "Not tied to an account"
      : "Due this month";
  const heroSub = selectedAccount
    ? `by ${formatCalendarDate(monthEnd)}`
    : dueNextMonth.length > 0
      ? `then ${formatTotals(dueNextMonth)} in ${monthName(windowEnd)}`
      : `nothing in ${monthName(windowEnd)}`;

  const header = (
    <View style={styles.header}>
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>{heroLabel}</Text>
        <Text style={styles.heroAmount}>
          {dueThisMonth.length > 0 ? formatTotals(dueThisMonth) : "Nothing due"}
        </Text>
        <Text style={styles.heroSub}>{heroSub}</Text>
      </View>

      {accounts.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipRow}>
            {[
              { id: "all", label: "All" },
              ...accounts.map((a) => ({ id: a.id, label: a.name, dot: a.color })),
              { id: "none", label: "No account" },
            ].map((chip) => {
              const active = filter === chip.id;
              return (
                <Pressable
                  key={chip.id}
                  onPress={() => setFilter(chip.id)}
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
          </View>
        </ScrollView>
      )}
    </View>
  );

  return (
    <SectionList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      sections={sections}
      stickySectionHeadersEnabled
      keyExtractor={(c) => `${c.paymentItemId}-${c.dueDate}-${c.installmentIndex ?? 0}`}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing due before {formatCalendarDate(windowEnd)}</Text>
          <Text style={styles.emptyHint}>
            Charges from your subscriptions and Pay-in-X plans will line up here.
          </Text>
        </View>
      }
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, section.overdue && { color: tones.warning }]}>
            {section.title}
          </Text>
          <Text style={styles.sectionTotal}>
            {formatTotals(sumByCurrency(section.data.map((c) => c.amount)))}
          </Text>
        </View>
      )}
      renderItem={({ item }) => (
        <UpcomingRow
          charge={item}
          overdue={item.dueDate < asOf}
          showMarkPaid={
            item.dueDate <= asOf &&
            earliest.get(item.paymentItemId) === item &&
            (item.scheduleType === "INSTALLMENT" || item.settlementMode === "manual")
          }
          onPress={() => router.push({ pathname: "/add", params: { id: item.paymentItemId } })}
          onMarkPaid={() =>
            item.scheduleType === "INSTALLMENT"
              ? markInstallmentPaid(item.paymentItemId)
              : markPaid(item.paymentItemId)
          }
        />
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    list: {
      flex: 1,
      backgroundColor: colors.background,
    },
    listContent: {
      padding: spacing.md,
      paddingBottom: spacing.xl,
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.background,
    },
    header: {
      gap: spacing.md,
      marginBottom: spacing.sm,
    },
    hero: {
      backgroundColor: colors.navy,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.xs,
    },
    heroLabel: {
      ...typography.caption,
      color: colors.white,
      opacity: 0.75,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    heroAmount: {
      ...typography.title,
      color: colors.white,
    },
    heroSub: {
      ...typography.caption,
      color: colors.white,
      opacity: 0.75,
    },
    chipRow: {
      flexDirection: "row",
      gap: spacing.sm,
    },
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
    chipActive: {
      backgroundColor: colors.navy,
      borderColor: colors.navy,
    },
    chipDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    chipText: {
      ...typography.caption,
      fontWeight: "600",
      color: colors.text,
    },
    chipTextActive: {
      color: colors.white,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.background,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    sectionTitle: {
      ...typography.label,
      color: colors.text,
    },
    sectionTotal: {
      ...typography.caption,
      color: colors.mutedText,
    },
    separator: {
      height: spacing.sm,
    },
    empty: {
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.xl,
    },
    emptyTitle: {
      ...typography.subtitle,
      color: colors.text,
      fontWeight: "600",
    },
    emptyHint: {
      ...typography.body,
      color: colors.mutedText,
      textAlign: "center",
    },
  });
}
