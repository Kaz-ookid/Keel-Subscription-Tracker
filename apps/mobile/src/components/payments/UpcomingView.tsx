import {
  addRecurrence,
  calendarDate,
  canMarkPaid,
  COVERED_INSTALLMENT_STATUSES,
  endOfMonth,
  formatCalendarDate,
  formatTotalsIn,
  isInstallmentSchedule,
  projectCharges,
  sumByCurrency,
  today,
  type CalendarDate,
  type ProjectedCharge,
} from "@keel/core";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { dayLabel, monthNameOf } from "../../i18n/dates";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { useAppState } from "../../state/app-state";
import { spacing, tones, typography, useTheme, type ThemeColors } from "../../theme";
import { HeroCard } from "../HeroCard";
import { UpcomingRow } from "../UpcomingRow";

/** A timeline row: a projected charge, or a settled one kept for completeness. */
type Entry = ProjectedCharge & { paid?: boolean; skipped?: boolean; undoable?: boolean };

interface Section {
  key: string;
  title: string;
  overdue?: boolean;
  /** A banderole that expands/collapses the rows after it. */
  monthLabel?: string;
  toggle?: "paid" | "next";
  data: Entry[];
}

/** The cash-flow timeline: hero, account chips, charges day by day. */
export function UpcomingView() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    items,
    occurrences,
    accounts,
    displayCurrency,
    rates,
    loading,
    markPaid,
    markInstallmentPaid,
    undoPaid,
    undoInstallmentPaid,
  } = useAppState();
  // Big numbers merge into the display currency.
  const totals = (values: Parameters<typeof formatTotalsIn>[0]) =>
    formatTotalsIn(values, displayCurrency, rates);
  // "all" | "none" (no account) | an account id.
  const [filter, setFilter] = useState("all");
  // Next month stays one tap away — the daily view is about THIS month.
  const [nextMonthOpen, setNextMonthOpen] = useState(false);
  // Symmetric: what's already settled this month folds away at the top.
  const [paidOpen, setPaidOpen] = useState(false);

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
  const itemsById = new Map(items.map((i) => [i.id, i]));

  // One shared rule for both payment types (current month only), and only on
  // an item's earliest charge so the action always hits the right payment.
  const canMark = (charge: Entry): boolean => {
    if (charge.paid || charge.skipped) return false;
    if (earliest.get(charge.paymentItemId) !== charge) return false;
    const item = itemsById.get(charge.paymentItemId);
    return item !== undefined && canMarkPaid(item, asOf);
  };

  // Settled payments of the window stay in the timeline — quiet, complete.
  const monthStart = calendarDate(`${asOf.slice(0, 7)}-01`);
  const settled: Entry[] = [];
  for (const o of occurrences) {
    if (o.status !== "charged" && o.status !== "skipped") continue;
    if (o.dueDate < monthStart || o.dueDate > windowEnd) continue;
    const item = itemsById.get(o.paymentItemId);
    // Every commitment's settled payments stay visible — automatic ones too.
    if (!item || item.schedule.kind !== "RECURRING") continue;
    settled.push({
      paymentItemId: item.id,
      name: item.name,
      dueDate: o.dueDate,
      amount: o.amount,
      accountId: item.accountId,
      categoryId: item.categoryId,
      color: item.color,
      domain: item.domain,
      settlementMode: item.settlementMode,
      scheduleType: item.scheduleType,
      paid: o.status === "charged",
      skipped: o.status === "skipped",
    });
  }
  for (const item of items) {
    if (!isInstallmentSchedule(item.schedule)) continue;
    const insts = item.schedule.installments;
    for (const inst of insts) {
      if (!COVERED_INSTALLMENT_STATUSES.includes(inst.status)) continue;
      if (inst.dueDate < monthStart || inst.dueDate > windowEnd) continue;
      settled.push({
        paymentItemId: item.id,
        name: item.name,
        dueDate: inst.dueDate,
        amount: inst.amount,
        accountId: item.accountId,
        categoryId: item.categoryId,
        color: item.color,
        domain: item.domain,
        settlementMode: item.settlementMode,
        scheduleType: item.scheduleType,
        installmentIndex: inst.index,
        installmentCount: insts.length,
        paid: true,
      });
    }
  }
  // Undo only ever reverts a commitment's MOST RECENT settlement — offer it
  // there, and never on automatic charges (those really were debited).
  const latestSettled = new Map<string, Entry>();
  for (const e of settled) {
    const cur = latestSettled.get(e.paymentItemId);
    if (!cur || e.dueDate > cur.dueDate) latestSettled.set(e.paymentItemId, e);
  }
  latestSettled.forEach((e) => {
    if (e.scheduleType === "INSTALLMENT" || e.settlementMode === "manual") e.undoable = true;
  });
  const settledFiltered =
    filter === "all"
      ? settled
      : settled.filter((c) => (filter === "none" ? !c.accountId : c.accountId === filter));

  const selectedAccount = accounts.find((a) => a.id === filter);
  const dueThisMonth = sumByCurrency(
    filtered.filter((c) => c.dueDate <= monthEnd).map((c) => c.amount),
  );
  const dueNextMonth = sumByCurrency(
    filtered.filter((c) => c.dueDate > monthEnd).map((c) => c.amount),
  );

  // Sections, in temporal order: the settled-this-month fold, then Overdue,
  // then one section per due day, then the next-month fold.
  const sections: Section[] = [];
  const thisMonth = asOf.slice(0, 7);

  // This month's settled payments fold away at the top to clear the view —
  // mirror of the next-month fold at the bottom. Rows carry their own date.
  const settledThisMonth = settledFiltered
    .filter((e) => e.dueDate.slice(0, 7) === thisMonth)
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  if (settledThisMonth.length > 0) {
    const paidTotal = totals(sumByCurrency(settledThisMonth.map((c) => c.amount)));
    sections.push({
      key: "paid-month",
      title: "",
      monthLabel: t("upcoming.paidThisMonth", { amount: paidTotal }),
      toggle: "paid",
      data: [],
    });
    if (paidOpen) {
      sections.push({ key: "paid-month-list", title: "", data: settledThisMonth });
    }
  }

  const overdueCharges = filtered.filter((c) => c.dueDate < asOf);
  if (overdueCharges.length > 0) {
    sections.push({
      key: "overdue",
      title: t("upcoming.overdue"),
      overdue: true,
      data: overdueCharges,
    });
  }
  const byDay = new Map<CalendarDate, Entry[]>();
  const addToDay = (e: Entry) => {
    const bucket = byDay.get(e.dueDate);
    if (bucket) bucket.push(e);
    else byDay.set(e.dueDate, [e]);
  };
  for (const c of filtered) {
    if (c.dueDate < asOf) continue;
    addToDay(c);
  }
  // Next month's settled rows stay in their day inside that month's fold.
  for (const e of settledFiltered) {
    if (e.dueDate.slice(0, 7) !== thisMonth) addToDay(e);
  }

  const nextSections: Section[] = [];
  for (const date of Array.from(byDay.keys()).sort()) {
    const data = byDay.get(date)!;
    // Within a day, what still needs attention comes before what's settled.
    data.sort((a, b) => Number(!!(a.paid || a.skipped)) - Number(!!(b.paid || b.skipped)));
    const section: Section = { key: date, title: dayLabel(date, asOf), data };
    // (dayLabel localizes Today/Tomorrow/weekday via i18n.)
    if (date.slice(0, 7) === thisMonth) sections.push(section);
    else nextSections.push(section);
  }
  if (nextSections.length > 0) {
    const label = `${monthNameOf(windowEnd)} ${windowEnd.slice(0, 4)}`;
    const nextTotal = totals(
      sumByCurrency(nextSections.flatMap((s) => s.data.map((c) => c.amount))),
    );
    sections.push({
      key: "next-month",
      title: "",
      // Same text open or closed — the total doesn't vanish on expand.
      monthLabel: `${label} · ${nextTotal}`,
      toggle: "next",
      data: [],
    });
    if (nextMonthOpen) sections.push(...nextSections);
  }

  const heroLabel = selectedAccount
    ? t("upcoming.heroNeeds", { name: selectedAccount.name })
    : filter === "none"
      ? t("upcoming.heroNoAccount")
      : t("upcoming.heroDueThisMonth");
  const heroSub = selectedAccount
    ? t("upcoming.heroBy", { date: formatCalendarDate(monthEnd) })
    : dueNextMonth.length > 0
      ? t("upcoming.heroThen", { amount: totals(dueNextMonth), month: monthNameOf(windowEnd) })
      : t("upcoming.heroNothingNext", { month: monthNameOf(windowEnd) });

  const header = (
    <View style={styles.header}>
      <HeroCard
        label={heroLabel}
        amount={dueThisMonth.length > 0 ? totals(dueThisMonth) : t("upcoming.nothingDue")}
        sub={heroSub}
      />

      {accounts.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipRow}>
            {[
              { id: "all", label: t("upcoming.chipAll") },
              ...accounts.map((a) => ({ id: a.id, label: a.name, dot: a.color })),
              { id: "none", label: t("upcoming.chipNoAccount") },
            ].map((chip) => (
              <Chip
                key={chip.id}
                label={chip.label}
                selected={filter === chip.id}
                onPress={() => setFilter(chip.id)}
                dot={"dot" in chip ? chip.dot : undefined}
              />
            ))}
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
      keyExtractor={(c) =>
        `${c.paymentItemId}-${c.dueDate}-${c.installmentIndex ?? 0}-${c.paid ? "p" : c.skipped ? "s" : "u"}`
      }
      ListHeaderComponent={header}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            {t("upcoming.emptyTitle", { date: formatCalendarDate(windowEnd) })}
          </Text>
          <Text style={styles.emptyHint}>{t("upcoming.emptyHint")}</Text>
          {/* A truly empty app (e.g. onboarding skipped): offer the way in. */}
          {items.length === 0 && (
            <Button
              label={t("common.getStarted")}
              onPress={() => router.push({ pathname: "/onboarding", params: { mode: "start" } })}
              style={styles.getStarted}
            />
          )}
        </View>
      }
      renderSectionHeader={({ section }) => {
        if (section.toggle) {
          const open = section.toggle === "paid" ? paidOpen : nextMonthOpen;
          const flip = section.toggle === "paid" ? setPaidOpen : setNextMonthOpen;
          return (
            <Pressable
              style={[styles.sectionHeaderWrap, styles.monthBreak]}
              onPress={() => flip((o) => !o)}
            >
              <View style={styles.monthLine} />
              <Text style={styles.monthText}>{section.monthLabel}</Text>
              <SymbolView
                name={open ? "chevron.up" : "chevron.down"}
                size={11}
                tintColor={colors.mutedText}
              />
              <View style={styles.monthLine} />
            </Pressable>
          );
        }
        // Headerless row groups (the expanded paid list) render bare.
        if (!section.title) return null;
        return (
          <View style={styles.sectionHeaderWrap}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, section.overdue && { color: tones.warning }]}>
                {section.title}
              </Text>
              <Text style={styles.sectionTotal}>
                {totals(sumByCurrency(section.data.map((c) => c.amount)))}
              </Text>
            </View>
          </View>
        );
      }}
      renderItem={({ item, section }) => (
        <UpcomingRow
          charge={item}
          overdue={item.dueDate < asOf && !item.paid && !item.skipped}
          showMarkPaid={canMark(item)}
          paid={item.paid}
          skipped={item.skipped}
          dated={section.key === "paid-month-list"}
          onUndo={
            item.undoable
              ? () =>
                  item.scheduleType === "INSTALLMENT"
                    ? undoInstallmentPaid(item.paymentItemId)
                    : undoPaid(item.paymentItemId)
              : undefined
          }
          onPress={() => router.push({ pathname: "/item", params: { id: item.paymentItemId } })}
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
    chipRow: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    sectionHeaderWrap: {
      backgroundColor: colors.background,
    },
    // Light but unmistakable month boundary: NAME between two hairlines.
    monthBreak: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
    },
    monthLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.mutedText,
    },
    monthText: {
      ...typography.caption,
      color: colors.mutedText,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
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
    getStarted: {
      marginTop: spacing.sm,
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
