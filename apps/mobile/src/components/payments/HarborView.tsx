// The Harbor view (DESIGN.md §3.7 B, experimental — behind the Settings debug
// toggle): active commitments as moored buoys in a harbor, seen from above
// the water. Buoy SIZE maps monthly cost, DISTANCE from the pier (bottom)
// maps days until the next charge, the brand logo rides each buoy inside a
// float ring in the item's color, and charges due within a week are roped to
// the pier. Paused items sit grey on a shelf; tap anything to open its item.
// The scene is drawn, not implied: gradient water with ripples, a plank pier
// with bollards, lapping waves at its edge, a sail on the horizon.

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
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useRef, useState } from "react";
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
import Svg, { Line, Path, Rect } from "react-native-svg";

import { useAppState } from "../../state/app-state";
import { emphasis, radius, spacing, typography, useTheme, type ThemeColors } from "../../theme";
import { BrandBadge } from "../BrandBadge";
import { EmptyState } from "../ui/EmptyState";
import { Waterline } from "../Waterline";

const CANVAS_HEIGHT = 1180;
const PIER_HEIGHT = 34;
const LAP_HEIGHT = 10;
// A full year of sea, on a square-root scale: the next weeks get the most
// water, the far future compresses toward the horizon. The screen opens at
// the pier and scrolls up into the distance.
const HORIZON_DAYS = 365;
const MAX_BUOYS = 40;
const MIN_R = 17;
const MAX_R = 34;
const TOP_PAD = 64; // room for the paused shelf and the horizon sail

/** 0 (at the pier) → 1 (horizon), sqrt-compressed. */
function distanceFraction(days: number): number {
  return Math.sqrt(Math.min(days, HORIZON_DAYS) / HORIZON_DAYS);
}

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
  const { colors, scheme } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items, categories, displayCurrency, rates } = useAppState();
  const [width, setWidth] = useState(0);
  // Open at the pier (today); the year of sea is above, one scroll away.
  const scrollRef = useRef<ScrollView>(null);
  const openedAtPier = useRef(false);

  const asOf = today();

  // The scene's own palette rides the theme: night water vs day water.
  const sea =
    scheme === "dark"
      ? {
          deep: "#060D1C",
          shallow: "#14294A",
          ripple: "rgba(143,199,191,0.14)",
          rope: "rgba(237,241,245,0.30)",
          wood: "#4A3A26",
          woodDark: "#372B1B",
          woodLight: "#5C4930",
          sail: "rgba(237,241,245,0.35)",
          reflection: "rgba(0,0,0,0.35)",
        }
      : {
          deep: "#8FB6C4",
          shallow: "#C6E0E4",
          ripple: "rgba(255,255,255,0.45)",
          rope: "rgba(7,20,41,0.35)",
          wood: "#8A6A45",
          woodDark: "#6E5334",
          woodLight: "#A5825A",
          sail: "rgba(7,20,41,0.35)",
          reflection: "rgba(7,20,41,0.15)",
        };

  // Everything in display-currency terms so sizes compare honestly.
  const numeric = (value: Money): number => {
    if (value.currency === displayCurrency) return value.amount;
    if (rates) {
      const merged = mergeTotals([value], displayCurrency, rates);
      if (merged) return merged.total.amount;
    }
    return value.amount;
  };

  const pierTop = CANVAS_HEIGHT - PIER_HEIGHT;

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
    kept.forEach((c, i) => {
      const r = MIN_R + Math.sqrt(c.monthly / maxMonthly) * (MAX_R - MIN_R);
      const y =
        pierTop -
        LAP_HEIGHT -
        r -
        4 -
        distanceFraction(c.daysUntil) * (pierTop - LAP_HEIGHT - TOP_PAD - 2 * r - 8);
      let x = r + 8 + ((i * 0.61803) % 1) * (w - 2 * r - 16);
      let tries = 0;
      while (
        tries < 40 &&
        placed.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < (p.r + r + 6) ** 2)
      ) {
        x = r + 8 + (((x - r - 8) / Math.max(w - 2 * r - 16, 1) + 0.17) % 1) * (w - 2 * r - 16);
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

  const gridDays = [7, 30, 90, 180, 365];
  const gridY = (d: number) =>
    pierTop -
    LAP_HEIGHT -
    MIN_R -
    4 -
    distanceFraction(d) * (pierTop - LAP_HEIGHT - TOP_PAD - 2 * MIN_R - 8);

  // Deterministic ripple scatter across the open water.
  const ripples =
    width > 0
      ? Array.from({ length: 30 }, (_, i) => ({
          x: 16 + ((i * 0.37 + 0.11) % 1) * (width - 48),
          y: TOP_PAD + ((i * 0.59 + 0.07) % 1) * (pierTop - TOP_PAD - 70),
        }))
      : [];

  const plankCount = width > 0 ? Math.ceil(width / 26) : 0;

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.screen}
      contentContainerStyle={styles.content}
      onContentSizeChange={() => {
        if (!openedAtPier.current) {
          openedAtPier.current = true;
          scrollRef.current?.scrollToEnd({ animated: false });
        }
      }}
    >
      <View style={styles.canvas} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {/* Open water: deeper (darker) the farther from the pier. */}
        <LinearGradient colors={[sea.deep, sea.shallow]} style={StyleSheet.absoluteFill} />

        {width > 0 && (
          <Svg width={width} height={CANVAS_HEIGHT} style={StyleSheet.absoluteFill}>
            {/* Ripples on the open water. */}
            {ripples.map((p, i) => (
              <Path
                key={`ripple-${i}`}
                d={`M ${p.x} ${p.y} q 7 -3 14 0 q 7 3 14 0`}
                stroke={sea.ripple}
                strokeWidth={1.2}
                fill="none"
              />
            ))}

            {/* Depth lines: the distance axis, quiet but present. */}
            {gridDays.map((d) => (
              <Line
                key={`grid-${d}`}
                x1={0}
                x2={width}
                y1={gridY(d)}
                y2={gridY(d)}
                stroke={sea.ripple}
                strokeWidth={StyleSheet.hairlineWidth}
                strokeDasharray="6 8"
              />
            ))}

            {/* Mooring ropes: anything due within a week is tied up. */}
            {buoys
              .filter((b) => b.daysUntil <= 7)
              .map((b) => (
                <Path
                  key={`rope-${b.item.id}`}
                  d={`M ${b.x} ${pierTop + 6} Q ${b.x + 12} ${(pierTop + b.y + b.r) / 2} ${b.x} ${
                    b.y + b.r - 2
                  }`}
                  stroke={sea.rope}
                  strokeWidth={1.4}
                  fill="none"
                />
              ))}

            {/* The pier: planks, a lit top edge, bollards to tie up to. */}
            <Rect x={0} y={pierTop} width={width} height={PIER_HEIGHT} fill={sea.wood} />
            <Rect x={0} y={pierTop} width={width} height={2.5} fill={sea.woodLight} />
            {Array.from({ length: plankCount }, (_, i) => (
              <Line
                key={`plank-${i}`}
                x1={i * 26 + 13}
                x2={i * 26 + 13}
                y1={pierTop + 3}
                y2={CANVAS_HEIGHT}
                stroke={sea.woodDark}
                strokeWidth={1.2}
              />
            ))}
            {[0.12, 0.5, 0.88].map((f) => (
              <Rect
                key={`bollard-${f}`}
                x={f * width - 4}
                y={pierTop - 9}
                width={8}
                height={12}
                rx={2.5}
                fill={sea.woodDark}
              />
            ))}
          </Svg>
        )}

        {/* Water lapping against the pier. */}
        {width > 0 && (
          <View style={styles.lapWrap} pointerEvents="none">
            <Waterline height={LAP_HEIGHT} width={width} color={colors.accentStrong} />
          </View>
        )}

        {/* Distance labels ride their lines, out of the buoys' way. */}
        {width > 0 &&
          gridDays.map((d) => (
            <Text key={`label-${d}`} style={[styles.gridLabel, { top: gridY(d) - 16 }]}>
              {d === 365 ? t("harbor.year") : t("harbor.days", { count: d })}
            </Text>
          ))}

        {/* A sail out on the horizon — the harbor is somewhere. */}
        <View style={styles.sail} pointerEvents="none">
          <Drift index={99}>
            <SymbolView name="sailboat.fill" size={22} tintColor={sea.sail} />
          </Drift>
        </View>

        {/* The paused shelf: parked, grey, out of the water. */}
        {paused.length > 0 && (
          <View style={styles.pausedShelf}>
            <Text style={styles.pausedLabel}>{t("harbor.paused")}</Text>
            {paused.slice(0, 8).map((item) => {
              const category = categories.find((c) => c.id === item.categoryId);
              return (
                <Pressable
                  key={item.id}
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
                  { left: b.x - b.r, top: b.y - b.r, width: b.r * 2, height: b.r * 2 + 8 },
                ]}
                onPress={() => router.push({ pathname: "/item", params: { id: b.item.id } })}
                accessibilityLabel={b.item.name}
              >
                <Drift index={i}>
                  {/* The float ring wears the item's color; the logo rides it. */}
                  <View style={[styles.buoyRing, { borderColor: b.item.color ?? colors.accent }]}>
                    <BrandBadge
                      domain={b.item.domain}
                      icon={category?.icon}
                      fallback={b.item.name.charAt(0).toUpperCase()}
                      color={b.item.color ?? colors.accent}
                      size={b.r * 2 - 12}
                    />
                  </View>
                  {/* Its shadow on the water. */}
                  <View
                    style={[
                      styles.reflection,
                      { width: b.r * 1.4, backgroundColor: sea.reflection },
                    ]}
                  />
                </Drift>
              </Pressable>
            );
          })}

        {overflow > 0 && (
          <View style={styles.overflowChip}>
            <Text style={styles.overflowText}>{t("harbor.more", { count: overflow })}</Text>
          </View>
        )}

        {/* The pier is today. Everything drifts toward it as its charge nears. */}
        <View style={styles.pierLabelWrap} pointerEvents="none">
          <Text style={styles.pierLabel}>{t("harbor.dock")}</Text>
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
      borderRadius: radius.lg,
      overflow: "hidden",
    },
    lapWrap: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: PIER_HEIGHT - 1,
      height: LAP_HEIGHT + 6,
    },
    gridLabel: {
      position: "absolute",
      right: spacing.sm,
      ...typography.caption,
      fontSize: 11,
      color: colors.mutedText,
    },
    sail: {
      position: "absolute",
      top: 34,
      left: spacing.lg,
      opacity: 0.9,
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
    buoy: {
      position: "absolute",
      alignItems: "center",
    },
    buoyRing: {
      borderRadius: 999,
      padding: 2,
      borderWidth: 3.5,
      backgroundColor: colors.white,
    },
    reflection: {
      alignSelf: "center",
      height: 5,
      borderRadius: 3,
      marginTop: 3,
    },
    overflowChip: {
      position: "absolute",
      bottom: PIER_HEIGHT + spacing.sm + LAP_HEIGHT,
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
    pierLabelWrap: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: PIER_HEIGHT,
      alignItems: "center",
      justifyContent: "center",
    },
    pierLabel: {
      ...typography.micro,
      color: colors.white,
      opacity: emphasis.hint,
      letterSpacing: 1.2,
    },
    legend: {
      ...typography.caption,
      color: colors.mutedText,
      textAlign: "center",
    },
  });
}
