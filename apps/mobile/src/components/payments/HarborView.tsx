// The Harbor view (DESIGN.md §3.7 B, experimental — behind the Settings debug
// toggle): active commitments as moored buoys in a top-down harbor. Buoy SIZE
// maps monthly cost, DISTANCE from the dock (bottom) maps days until the next
// charge, the brand logo rides each buoy, paused items sit grey at the edge.
// Tap a buoy to open its item. Every mapping is written out in the legend —
// a signature visual must stay legible or it's decoration.

import {
  isInstallmentSchedule,
  isPaymentItemComplete,
  isRecurringSchedule,
  mergeTotals,
  monthlyEquivalent,
  summarizeInstallmentPlan,
  today,
  type CalendarDate,
  type Money,
  type PaymentItem,
} from "@keel/core";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { useAppState } from "../../state/app-state";
import { emphasis, radius, spacing, typography, useTheme, type ThemeColors } from "../../theme";
import { BrandBadge } from "../BrandBadge";
import { EmptyState } from "../ui/EmptyState";

const CANVAS_HEIGHT = 440;
const DOCK_HEIGHT = 26;
const HORIZON_DAYS = 60;
const MAX_BUOYS = 24;
const MIN_R = 16;
const MAX_R = 34;

interface Buoy {
  item: PaymentItem;
  daysUntil: number;
  monthly: number;
  r: number;
  x: number;
  y: number;
}

function daysBetween(from: CalendarDate, to: CalendarDate): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** A buoy's gentle 1-2px float, phase-shifted per buoy so the harbor never
 *  moves in lockstep. */
function Drift({ index, children }: { index: number; children: React.ReactNode }) {
  const dy = useSharedValue(0);
  useEffect(() => {
    dy.value = withDelay(
      (index * 397) % 1200,
      withRepeat(
        withTiming(2, { duration: 2600 + ((index * 173) % 900), easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );
  }, [dy, index]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: dy.value - 1 }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

export function HarborView() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items, categories, displayCurrency, rates } = useAppState();
  const [width, setWidth] = useState(0);

  const asOf = today();

  // Everything in display-currency terms so sizes compare honestly.
  const numeric = (value: Money): number => {
    if (value.currency === displayCurrency) return value.amount;
    if (rates) {
      const merged = mergeTotals([value], displayCurrency, rates);
      if (merged) return merged.total.amount;
    }
    return value.amount;
  };

  const { buoys, paused, overflow } = useMemo(() => {
    const live = items.filter((i) => i.status === "active" && !isPaymentItemComplete(i, asOf));
    const pausedItems = items.filter((i) => i.status === "paused");

    const candidates = live.flatMap((item) => {
      if (isRecurringSchedule(item.schedule)) {
        const s = item.schedule;
        return [
          {
            item,
            daysUntil: Math.max(0, daysBetween(asOf, s.nextChargeDate)),
            monthly: numeric(monthlyEquivalent(s.amount, s.recurrence)),
          },
        ];
      }
      if (isInstallmentSchedule(item.schedule)) {
        const plan = summarizeInstallmentPlan(item.schedule);
        if (!plan.nextDue) return [];
        return [
          {
            item,
            daysUntil: Math.max(0, daysBetween(asOf, plan.nextDue.dueDate)),
            // A plan's "displacement" is its per-installment bite.
            monthly: numeric(plan.nextDue.amount),
          },
        ];
      }
      return [];
    });

    candidates.sort((a, b) => b.monthly - a.monthly);
    const kept = candidates.slice(0, MAX_BUOYS);
    const maxMonthly = Math.max(1, ...kept.map((c) => c.monthly));

    // Place big spenders first: golden-ratio x spread, nudged until buoys
    // stop overlapping. Deterministic, so the harbor doesn't reshuffle.
    const placed: Buoy[] = [];
    const w = Math.max(width, 1);
    const topPad = MAX_R + spacing.md + 28; // room for the paused shelf
    const dockY = CANVAS_HEIGHT - DOCK_HEIGHT;
    kept.forEach((c, i) => {
      const r = MIN_R + Math.sqrt(c.monthly / maxMonthly) * (MAX_R - MIN_R);
      const clampedDays = Math.min(c.daysUntil, HORIZON_DAYS);
      const y = dockY - r - 6 - (clampedDays / HORIZON_DAYS) * (dockY - topPad - 2 * r);
      let x = r + 6 + ((i * 0.61803) % 1) * (w - 2 * r - 12);
      let tries = 0;
      while (
        tries < 40 &&
        placed.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < (p.r + r + 4) ** 2)
      ) {
        x = r + 6 + (((x - r - 6) / Math.max(w - 2 * r - 12, 1) + 0.17) % 1) * (w - 2 * r - 12);
        tries += 1;
      }
      placed.push({ ...c, r, x, y });
    });

    return { buoys: placed, paused: pausedItems, overflow: candidates.length - kept.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, asOf, width, displayCurrency, rates]);

  if (buoys.length === 0 && paused.length === 0) {
    return (
      <View style={styles.center}>
        <EmptyState
          icon="water.waves"
          title={t("harbor.emptyTitle")}
          hint={t("harbor.emptyHint")}
        />
      </View>
    );
  }

  const gridDays = [7, 30, 60];
  const dockY = CANVAS_HEIGHT - DOCK_HEIGHT;
  const topPad = MAX_R + spacing.md + 28;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.canvas} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {/* Depth lines: the distance axis, written out. */}
        {gridDays.map((d) => {
          const y = dockY - MIN_R - 6 - (d / HORIZON_DAYS) * (dockY - topPad - 2 * MIN_R);
          return (
            <View key={d} style={[styles.gridLine, { top: y }]} pointerEvents="none">
              <Text style={styles.gridLabel}>{t("harbor.days", { count: d })}</Text>
            </View>
          );
        })}

        {/* The paused shelf: parked, grey, out of the water. */}
        {paused.length > 0 && (
          <View style={styles.pausedShelf}>
            <Text style={styles.pausedLabel}>{t("harbor.paused")}</Text>
            {paused.slice(0, 8).map((item) => {
              const category = categories.find((c) => c.id === item.categoryId);
              return (
                <Pressable
                  key={item.id}
                  style={styles.pausedBadge}
                  onPress={() => router.push({ pathname: "/item", params: { id: item.id } })}
                >
                  <BrandBadge
                    domain={item.domain}
                    icon={category?.icon}
                    fallback={item.name.charAt(0).toUpperCase()}
                    color={item.color ?? colors.accent}
                    size={24}
                  />
                </Pressable>
              );
            })}
          </View>
        )}

        {width > 0 &&
          buoys.map((b, i) => {
            const category = categories.find((c) => c.id === b.item.categoryId);
            return (
              <Pressable
                key={b.item.id}
                style={[
                  styles.buoy,
                  { left: b.x - b.r, top: b.y - b.r, width: b.r * 2, height: b.r * 2 },
                ]}
                onPress={() => router.push({ pathname: "/item", params: { id: b.item.id } })}
                accessibilityLabel={b.item.name}
              >
                <Drift index={i}>
                  <View style={styles.buoyRing}>
                    <BrandBadge
                      domain={b.item.domain}
                      icon={category?.icon}
                      fallback={b.item.name.charAt(0).toUpperCase()}
                      color={b.item.color ?? colors.accent}
                      size={b.r * 2 - 6}
                    />
                  </View>
                </Drift>
              </Pressable>
            );
          })}

        {overflow > 0 && (
          <View style={styles.overflowChip}>
            <Text style={styles.overflowText}>{t("harbor.more", { count: overflow })}</Text>
          </View>
        )}

        {/* The dock: today. Everything drifts toward it as its charge nears. */}
        <View style={styles.dock}>
          <Text style={styles.dockLabel}>{t("harbor.dock")}</Text>
        </View>
      </View>

      <Text style={styles.legend}>{t("harbor.legend")}</Text>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
    center: {
      flex: 1,
      justifyContent: "center",
      backgroundColor: colors.background,
    },
    canvas: {
      height: CANVAS_HEIGHT,
      backgroundColor: colors.surface2,
      borderRadius: radius.lg,
      overflow: "hidden",
    },
    gridLine: {
      position: "absolute",
      left: 0,
      right: 0,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      borderStyle: "dashed",
    },
    gridLabel: {
      ...typography.micro,
      color: colors.mutedText,
      paddingLeft: spacing.sm,
      paddingTop: 1,
    },
    pausedShelf: {
      position: "absolute",
      top: spacing.sm,
      right: spacing.sm,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      opacity: emphasis.dim,
    },
    pausedLabel: {
      ...typography.micro,
      color: colors.mutedText,
      marginRight: spacing.xs,
    },
    pausedBadge: {},
    buoy: {
      position: "absolute",
      alignItems: "center",
      justifyContent: "center",
    },
    buoyRing: {
      borderRadius: 999,
      padding: 2,
      borderWidth: 1.5,
      borderColor: colors.accentStrong,
      backgroundColor: colors.surface,
    },
    overflowChip: {
      position: "absolute",
      bottom: DOCK_HEIGHT + spacing.sm,
      right: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
    },
    overflowText: {
      ...typography.caption,
      fontWeight: "600",
      color: colors.mutedText,
    },
    dock: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: DOCK_HEIGHT,
      backgroundColor: colors.navy,
      alignItems: "center",
      justifyContent: "center",
    },
    dockLabel: {
      ...typography.micro,
      color: colors.white,
      opacity: emphasis.hint,
    },
    legend: {
      ...typography.caption,
      color: colors.mutedText,
      textAlign: "center",
    },
  });
}
