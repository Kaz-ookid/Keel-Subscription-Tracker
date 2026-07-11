// The Upcoming timeline as a month grid: every charge sits on its due day as
// a brand badge — dimmed once paid, the day number warning-tinted while
// something is overdue — so the calendar tells the month's story, not just
// its schedule. Tapping a day opens its charges below (the same pattern as
// tapping a bar on the Insights year chart). Past months read the ledger,
// the future is projected — the same sources as the list view.
//
// Month changes ride a native pager (the same physics as the Upcoming ↔ All
// swipe): the neighbor month is really under your finger, the gesture can be
// held and pulled back. Three pages recenter invisibly after each landing.

import {
  calendarDate,
  COVERED_INSTALLMENT_STATUSES,
  endOfMonth,
  formatMoney,
  formatTotalsIn,
  isInstallmentSchedule,
  projectCharges,
  today,
  type CalendarDate,
  type Money,
  type PaymentItem,
  type PaymentOccurrence,
} from "@keel/core";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import PagerView from "react-native-pager-view";

import { monthFull, weekdayShort } from "../../i18n/dates";
import { useAppState } from "../../state/app-state";
import { emphasis, radius, spacing, typography, useTheme, type ThemeColors } from "../../theme";
import { BrandBadge } from "../BrandBadge";
import { Card } from "../ui/Card";

// Monday-first column order, as JS weekday indices (0 = Sunday).
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

// The pager's fixed month window: this many months back and ahead (the same
// four-year span as the Insights chart).
const MONTHS_REACH = 24;

interface DayCharge {
  key: string;
  paymentItemId: string;
  name: string;
  dueDate: CalendarDate;
  amount: Money;
  domain?: string;
  color?: string;
  categoryId?: string;
  paid: boolean;
  overdue: boolean;
  installmentIndex?: number;
  installmentCount?: number;
}

function firstOfShiftedMonth(asOf: CalendarDate, delta: number): CalendarDate {
  const total = Number(asOf.slice(0, 4)) * 12 + (Number(asOf.slice(5, 7)) - 1) + delta;
  const y = Math.floor(total / 12);
  const m = String((total % 12) + 1).padStart(2, "0");
  return calendarDate(`${y}-${m}-01`);
}

/** Every charge of one month on its due day — the list view's three sources
 *  (ledger, covered installments, projection), never double-counted. */
function monthCharges(
  items: readonly PaymentItem[],
  occurrences: readonly PaymentOccurrence[],
  monthKey: string,
  monthEnd: CalendarDate,
  asOf: CalendarDate,
): DayCharge[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return [
    ...occurrences.flatMap((o) => {
      if (o.status !== "charged" || o.dueDate.slice(0, 7) !== monthKey) return [];
      const item = byId.get(o.paymentItemId);
      if (!item) return [];
      return [
        {
          key: o.id,
          paymentItemId: item.id,
          name: item.name,
          dueDate: o.dueDate,
          amount: o.amount,
          domain: item.domain,
          color: item.color,
          categoryId: item.categoryId,
          paid: true,
          overdue: false,
        },
      ];
    }),
    ...items.flatMap((item) => {
      if (!isInstallmentSchedule(item.schedule)) return [];
      const count = item.schedule.installments.length;
      return item.schedule.installments
        .filter(
          (inst) =>
            COVERED_INSTALLMENT_STATUSES.includes(inst.status) &&
            inst.dueDate.slice(0, 7) === monthKey,
        )
        .map((inst) => ({
          key: inst.id,
          paymentItemId: item.id,
          name: item.name,
          dueDate: inst.dueDate,
          amount: inst.amount,
          domain: item.domain,
          color: item.color,
          categoryId: item.categoryId,
          paid: true,
          overdue: false,
          installmentIndex: inst.index,
          installmentCount: count,
        }));
    }),
    ...projectCharges(items, monthEnd)
      .filter((c) => c.dueDate.slice(0, 7) === monthKey)
      .map((c) => ({
        key: `${c.paymentItemId}-${c.dueDate}-${c.installmentIndex ?? 0}`,
        paymentItemId: c.paymentItemId,
        name: c.name,
        dueDate: c.dueDate,
        amount: c.amount,
        domain: c.domain,
        color: c.color,
        categoryId: c.categoryId,
        paid: false,
        overdue: c.dueDate < asOf,
        installmentIndex: c.installmentIndex,
        installmentCount: c.installmentCount,
      })),
  ];
}

/** Monday-first grid rows for a month: leading blanks, then every day. */
function monthWeeks(monthStart: CalendarDate, monthEnd: CalendarDate): (CalendarDate | null)[][] {
  const y = Number(monthStart.slice(0, 4));
  const m = Number(monthStart.slice(5, 7));
  const monthKey = monthStart.slice(0, 7);
  const daysInMonth = Number(monthEnd.slice(8, 10));
  const leading = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const cells: (CalendarDate | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      calendarDate(`${monthKey}-${String(i + 1).padStart(2, "0")}`),
    ),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (CalendarDate | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

export function CalendarMonthView({ onOpenHarbor }: { onOpenHarbor?: () => void }) {
  const router = useRouter();
  const { colors } = useTheme();
  // Also subscribes the view to language changes for the date helpers.
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items, occurrences, categories, displayCurrency, rates } = useAppState();
  const asOf = today();
  const [offset, setOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<CalendarDate | null>(asOf);
  const pagerRef = useRef<PagerView>(null);
  // Stable callback so the memoized month grids don't re-render per swipe.
  const onSelectDay = useCallback(
    (date: CalendarDate) => setSelectedDay((prev) => (prev === date ? null : date)),
    [],
  );

  const monthStart = firstOfShiftedMonth(asOf, offset);
  const monthEnd = endOfMonth(monthStart);
  const monthKey = monthStart.slice(0, 7);

  // The center month's charges back the header total and the day detail card
  // (each pager page computes its own copy for display). Cheap at this scale,
  // so plain recomputation — no memo to fight the compiler over.
  const charges = monthCharges(items, occurrences, monthKey, monthEnd, asOf);
  const byDay = new Map<string, DayCharge[]>();
  for (const c of charges) {
    const list = byDay.get(c.dueDate);
    if (list) list.push(c);
    else byDay.set(c.dueDate, [c]);
  }

  const totals = (values: Parameters<typeof formatTotalsIn>[0]) =>
    formatTotalsIn(values, displayCurrency, rates);
  const monthTotals = charges.map((c) => c.amount);
  const selected = selectedDay ? (byDay.get(selectedDay) ?? []) : [];

  const monthLabel = `${monthFull(Number(monthStart.slice(5, 7)) - 1)} ${monthStart.slice(0, 4)}`;

  // A FIXED window of months, one pager page each, no re-centering: the swipe
  // is a pure native gesture that nothing programmatic ever fights, so rapid
  // flings land exactly where they were thrown (the 3-page re-centering trick
  // raced fast swipes and lagged). Only pages near the viewport render their
  // grid; the rest stay empty until the window approaches.
  const currentPage = offset + MONTHS_REACH;

  // Uniform pager height (6-week months set the bar) — a fixed frame beats a
  // height that jumps between months mid-swipe.
  const gridHeight = 40 + 6 * 58;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable
          onPress={() => pagerRef.current?.setPage(currentPage - 1)}
          hitSlop={10}
          style={styles.chevronButton}
        >
          <SymbolView name="chevron.left" size={13} tintColor={colors.text} />
        </Pressable>
        <View style={styles.headerMiddle}>
          <Text style={styles.monthTitle}>{monthLabel}</Text>
          {monthTotals.length > 0 && <Text style={styles.monthTotal}>{totals(monthTotals)}</Text>}
        </View>
        <Pressable
          onPress={() => pagerRef.current?.setPage(currentPage + 1)}
          hitSlop={10}
          style={styles.chevronButton}
        >
          <SymbolView name="chevron.right" size={13} tintColor={colors.text} />
        </Pressable>
        {/* The bonus lens: the same schedule as a harbor (experiment). */}
        {onOpenHarbor && (
          <Pressable
            onPress={onOpenHarbor}
            hitSlop={10}
            style={styles.chevronButton}
            accessibilityLabel={t("payments.harborA11y")}
          >
            <SymbolView name="sailboat" size={15} tintColor={colors.text} />
          </Pressable>
        )}
      </View>

      <PagerView
        ref={pagerRef}
        style={{ height: gridHeight }}
        initialPage={MONTHS_REACH}
        onPageSelected={(e) => {
          const next = e.nativeEvent.position - MONTHS_REACH;
          setOffset(next);
          // Landing back on the current month re-selects today.
          setSelectedDay(next === 0 ? asOf : null);
        }}
      >
        {Array.from({ length: MONTHS_REACH * 2 + 1 }, (_, p) => {
          const d = p - MONTHS_REACH;
          return (
            <View key={`m${d}`} collapsable={false}>
              {Math.abs(d - offset) <= 2 && (
                <MonthGrid
                  offset={d}
                  asOf={asOf}
                  selectedDay={selectedDay}
                  onSelectDay={onSelectDay}
                />
              )}
            </View>
          );
        })}
      </PagerView>

      {/* The tapped day's charges — light, in place, read-only. */}
      {selectedDay && selected.length > 0 && (
        <Card>
          <View style={styles.detailHeader}>
            <Text style={styles.detailTitle}>
              {Number(selectedDay.slice(8, 10))} {monthLabel}
            </Text>
            <Text style={styles.detailTotal}>{totals(selected.map((c) => c.amount))}</Text>
          </View>
          {selected.map((c) => {
            const category = categories.find((cat) => cat.id === c.categoryId);
            return (
              <Pressable
                key={c.key}
                style={styles.detailRow}
                onPress={() => router.push({ pathname: "/item", params: { id: c.paymentItemId } })}
              >
                <SymbolView
                  name={
                    c.paid
                      ? "checkmark.circle.fill"
                      : c.overdue
                        ? "exclamationmark.circle"
                        : "clock"
                  }
                  size={14}
                  tintColor={
                    c.paid
                      ? colors.tones.success
                      : c.overdue
                        ? colors.tones.warning
                        : colors.mutedText
                  }
                />
                <BrandBadge
                  domain={c.domain}
                  icon={category?.icon}
                  fallback={c.name.charAt(0).toUpperCase()}
                  color={c.color ?? colors.accent}
                  size={24}
                />
                <Text style={styles.detailName} numberOfLines={1}>
                  {c.name}
                  {c.installmentIndex && c.installmentCount ? (
                    <Text style={styles.detailCount}>
                      {" "}
                      · {t("common.xOfY", { x: c.installmentIndex, y: c.installmentCount })}
                    </Text>
                  ) : null}
                </Text>
                <Text style={styles.detailAmount}>{formatMoney(c.amount)}</Text>
              </Pressable>
            );
          })}
        </Card>
      )}
    </ScrollView>
  );
}

/** One month's grid, self-contained so the pager's neighbor pages are real
 *  content under the finger. Memoized: a swipe only mounts the grids that
 *  newly enter the render window, everything else is untouched. */
const MonthGrid = memo(function MonthGrid({
  offset,
  asOf,
  selectedDay,
  onSelectDay,
}: {
  offset: number;
  asOf: CalendarDate;
  selectedDay: CalendarDate | null;
  onSelectDay: (date: CalendarDate) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items, occurrences, categories } = useAppState();

  const monthStart = firstOfShiftedMonth(asOf, offset);
  const monthEnd = endOfMonth(monthStart);
  const monthKey = monthStart.slice(0, 7);

  const byDay = new Map<string, DayCharge[]>();
  for (const c of monthCharges(items, occurrences, monthKey, monthEnd, asOf)) {
    const list = byDay.get(c.dueDate);
    if (list) list.push(c);
    else byDay.set(c.dueDate, [c]);
  }
  const weeks = monthWeeks(monthStart, monthEnd);

  return (
    <View style={styles.grid}>
      <View style={styles.weekRow}>
        {WEEKDAY_ORDER.map((d) => (
          <Text key={d} style={styles.weekday}>
            {weekdayShort(d)}
          </Text>
        ))}
      </View>
      {weeks.map((week, w) => (
        <View key={w} style={styles.weekRow}>
          {week.map((date, i) => {
            if (!date) return <View key={`blank-${i}`} style={styles.dayCell} />;
            const dayCharges = byDay.get(date) ?? [];
            const isToday = date === asOf;
            const isSelected = date === selectedDay;
            const hasOverdue = dayCharges.some((c) => c.overdue);
            return (
              <Pressable
                key={date}
                style={[styles.dayCell, isSelected && styles.daySelected]}
                onPress={() => onSelectDay(date)}
              >
                {/* Today wears a ring; the overdue tint never overrides
                    it — "today" outranks "late" on the day you're in. */}
                <View style={[styles.dayNumberWrap, isToday && styles.todayRing]}>
                  <Text
                    style={[
                      styles.dayNumber,
                      isToday ? styles.dayToday : hasOverdue && { color: colors.tones.warning },
                    ]}
                  >
                    {Number(date.slice(8, 10))}
                  </Text>
                </View>
                <View style={styles.dayBadges}>
                  {dayCharges.slice(0, 2).map((c) => {
                    const category = categories.find((cat) => cat.id === c.categoryId);
                    return (
                      <View key={c.key} style={c.paid && styles.paidBadge}>
                        <BrandBadge
                          domain={c.domain}
                          icon={category?.icon}
                          fallback={c.name.charAt(0).toUpperCase()}
                          color={c.color ?? colors.accent}
                          size={18}
                        />
                      </View>
                    );
                  })}
                  {dayCharges.length > 2 && (
                    <Text style={styles.moreBadge}>+{dayCharges.length - 2}</Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
});

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: "transparent" },
    content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    chevronButton: {
      width: 32,
      height: 32,
      borderRadius: radius.sm,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    headerMiddle: {
      flex: 1,
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      paddingHorizontal: spacing.xs,
    },
    monthTitle: { ...typography.value, color: colors.text },
    monthTotal: { ...typography.caption, color: colors.mutedText },
    grid: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.xs,
      gap: 2,
    },
    weekRow: { flexDirection: "row", gap: 2 },
    weekday: {
      flex: 1,
      textAlign: "center",
      ...typography.micro,
      color: colors.mutedText,
      paddingVertical: spacing.xs,
    },
    dayCell: {
      flex: 1,
      minHeight: 56,
      borderRadius: radius.sm,
      alignItems: "center",
      paddingTop: 2,
      gap: 2,
    },
    // Fixed-size slot so ringed and plain days keep identical layout.
    dayNumberWrap: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    todayRing: {
      borderWidth: 1.5,
      borderColor: colors.accent,
    },
    // The dedicated selection token: a quiet sea-glass wash that reads as
    // "chosen" in both schemes (the old background-fill looked like a dead
    // cell in dark mode).
    daySelected: { backgroundColor: colors.selection },
    dayNumber: { ...typography.caption, color: colors.text },
    dayToday: { color: colors.accent, fontWeight: "700" },
    dayBadges: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      alignItems: "center",
      gap: 2,
      paddingHorizontal: 1,
    },
    paidBadge: { opacity: emphasis.dim },
    moreBadge: { ...typography.caption, fontSize: 10, color: colors.mutedText },
    detailHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    detailTitle: { ...typography.label, color: colors.text },
    detailTotal: { ...typography.caption, fontWeight: "600", color: colors.text },
    detailRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    detailName: { ...typography.caption, color: colors.text, flex: 1 },
    detailCount: { ...typography.caption, color: colors.mutedText },
    detailAmount: { ...typography.caption, fontWeight: "600", color: colors.text },
  });
}
