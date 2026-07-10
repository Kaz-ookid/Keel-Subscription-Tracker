// The Harbor view (DESIGN.md §3.7 B, experimental — behind the Settings debug
// toggle): the year's charges as a fleet arriving at an industrial quay.
// Every BILLING DAY is one vessel; payments due the same day sail together as
// containers on the same ship. What a day costs decides its vessel (container
// ship → launch → wooden crate → lost cardboard box) and its size; distance
// from the quay maps days until the charge, on a square-root scale a full
// year deep. The screen opens at the quay and scrolls up into open water.
// Paused items sit grey on a shelf; tap any cargo to open its item.

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
import Svg, { G, Line, Path, Rect } from "react-native-svg";

import { useAppState } from "../../state/app-state";
import { emphasis, radius, spacing, typography, useTheme, type ThemeColors } from "../../theme";
import { BrandBadge } from "../BrandBadge";
import { EmptyState } from "../ui/EmptyState";
import { Waterline } from "../Waterline";
import {
  harborPalette,
  vesselGeometry,
  vesselKind,
  VesselSprite,
  visibleCargo,
  type VesselGeometry,
  type VesselKind,
} from "./HarborVessels";

const CANVAS_HEIGHT = 1180;
const QUAY_HEIGHT = 44;
const LAP_HEIGHT = 10;
// A full year of sea, on a square-root scale: the next weeks get the most
// water, the far future compresses toward the horizon.
const HORIZON_DAYS = 365;
const MAX_VESSELS = 22;
const TOP_PAD = 64; // room for the paused shelf and the horizon sail

/** 0 (at the quay) → 1 (horizon), sqrt-compressed. */
function distanceFraction(days: number): number {
  return Math.sqrt(Math.min(days, HORIZON_DAYS) / HORIZON_DAYS);
}

interface Cargo {
  item: PaymentItem;
  monthly: number;
}

interface Vessel {
  key: string;
  daysUntil: number;
  total: number;
  cargo: Cargo[];
  hiddenCargo: number;
  kind: VesselKind;
  geo: VesselGeometry;
  facing: 1 | -1;
  /** Waterline anchor (center-x on the water). */
  x: number;
  y: number;
}

function daysBetween(from: CalendarDate, to: CalendarDate): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** A vessel's gentle 1-2px bob, phase-shifted so the fleet never moves in
 *  lockstep. */
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
  // Open at the quay (today); the year of sea is above, one scroll away.
  const scrollRef = useRef<ScrollView>(null);
  const openedAtQuay = useRef(false);

  const asOf = today();
  const sea = harborPalette(scheme === "dark" ? "dark" : "light");

  // Everything in display-currency terms so sizes compare honestly.
  const numeric = (value: Money): number => {
    if (value.currency === displayCurrency) return value.amount;
    if (rates) {
      const merged = mergeTotals([value], displayCurrency, rates);
      if (merged) return merged.total.amount;
    }
    return value.amount;
  };

  const quayTop = CANVAS_HEIGHT - QUAY_HEIGHT;

  const { vessels, paused, overflow } = useMemo(() => {
    const live = items.filter((i) => i.status === "active" && !isPaymentItemComplete(i, asOf));
    const pausedItems = items.filter((i) => i.status === "paused");

    const candidates = live.flatMap((item) => {
      if (isRecurringSchedule(item.schedule)) {
        const s = item.schedule;
        return [
          {
            item,
            date: s.nextChargeDate,
            monthly: numeric(monthlyEquivalent(s.amount, s.recurrence)),
          },
        ];
      }
      if (isInstallmentSchedule(item.schedule)) {
        const plan = summarizeInstallmentPlan(item.schedule);
        if (!plan.nextDue) return [];
        // A plan's "displacement" is its per-installment bite.
        return [{ item, date: plan.nextDue.dueDate, monthly: numeric(plan.nextDue.amount) }];
      }
      return [];
    });

    // One vessel per billing day: same-day payments sail together.
    const byDay = new Map<CalendarDate, Cargo[]>();
    for (const c of candidates) {
      const bucket = byDay.get(c.date);
      if (bucket) bucket.push(c);
      else byDay.set(c.date, [c]);
    }
    const groups = Array.from(byDay.entries()).map(([date, cargo]) => ({
      date,
      daysUntil: Math.max(0, daysBetween(asOf, date)),
      cargo: cargo.sort((a, b) => b.monthly - a.monthly),
      total: cargo.reduce((sum, c) => sum + c.monthly, 0),
    }));
    groups.sort((a, b) => b.total - a.total);
    const kept = groups.slice(0, MAX_VESSELS);
    const cut = groups.slice(MAX_VESSELS).reduce((sum, g) => sum + g.cargo.length, 0);
    const maxTotal = Math.max(1, ...kept.map((g) => g.total));

    // Place the big days first: golden-ratio x spread, nudged until hulls
    // stop overlapping. Deterministic, so the harbor doesn't reshuffle.
    const placed: Vessel[] = [];
    const w = Math.max(width, 1);
    const yNear = quayTop - LAP_HEIGHT - 12;
    const yFar = TOP_PAD + 52;
    kept.forEach((g, i) => {
      const share = g.total / maxTotal;
      const kind = vesselKind(g.cargo.length, share);
      const geo = vesselGeometry(kind, g.cargo.length, share);
      const shown = visibleCargo(kind, g.cargo.length);
      const y = yNear - distanceFraction(g.daysUntil) * (yNear - yFar);
      const xMin = geo.w / 2 + 6;
      const xMax = w - geo.w / 2 - 6;
      let x = xMin + ((i * 0.61803) % 1) * Math.max(xMax - xMin, 1);
      let tries = 0;
      const collides = (px: number) =>
        placed.some(
          (p) =>
            Math.abs(p.x - px) < (p.geo.w + geo.w) / 2 + 8 &&
            Math.abs(p.y - y) < (p.geo.h + geo.h) / 2 + 4,
        );
      while (tries < 40 && collides(x)) {
        x = xMin + (((x - xMin) / Math.max(xMax - xMin, 1) + 0.19) % 1) * Math.max(xMax - xMin, 1);
        tries += 1;
      }
      placed.push({
        key: g.date,
        daysUntil: g.daysUntil,
        total: g.total,
        cargo: g.cargo.slice(0, shown),
        hiddenCargo: g.cargo.length - shown,
        kind,
        geo,
        facing: i % 2 === 0 ? 1 : -1,
        x,
        y,
      });
    });

    return { vessels: placed, paused: pausedItems, overflow: cut };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, asOf, width, displayCurrency, rates]);

  if (vessels.length === 0 && paused.length === 0) {
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

  // Depth lines share the fleet's anchor scale: a ship due in exactly 30 days
  // sits with its waterline ON the 30 d line.
  const gridDays = [7, 30, 90, 180, 365];
  const yNear = quayTop - LAP_HEIGHT - 12;
  const yFar = TOP_PAD + 52;
  const gridY = (d: number) => yNear - distanceFraction(d) * (yNear - yFar);

  // Deterministic ripple scatter across the open water.
  const ripples =
    width > 0
      ? Array.from({ length: 30 }, (_, i) => ({
          x: 16 + ((i * 0.37 + 0.11) % 1) * (width - 48),
          y: TOP_PAD + ((i * 0.59 + 0.07) % 1) * (quayTop - TOP_PAD - 70),
        }))
      : [];

  const craneX = width * 0.7;

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.screen}
      contentContainerStyle={styles.content}
      onContentSizeChange={() => {
        if (!openedAtQuay.current) {
          openedAtQuay.current = true;
          scrollRef.current?.scrollToEnd({ animated: false });
        }
      }}
    >
      <View style={styles.canvas} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {/* Open water: deeper (darker) the farther from the quay. */}
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

            {/* Gulls over the far water. */}
            <Path
              d={`M ${width * 0.32} 46 q 4 -5 8 0 q 4 -5 8 0`}
              stroke={sea.sail}
              strokeWidth={1.4}
              fill="none"
            />
            <Path
              d={`M ${width * 0.46} 62 q 3 -4 6 0 q 3 -4 6 0`}
              stroke={sea.sail}
              strokeWidth={1.2}
              fill="none"
            />

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

            {/* The quay: poured concrete with expansion joints and a
                hazard-striped edge; TODAY is painted on the slab. */}
            <Rect x={0} y={quayTop} width={width} height={QUAY_HEIGHT} fill={sea.concrete} />
            <Rect x={0} y={quayTop} width={width} height={2} fill={sea.concreteEdge} />
            <Rect x={0} y={quayTop + 2} width={width} height={5} fill={sea.hazard} />
            {Array.from({ length: Math.ceil(width / 14) + 1 }, (_, i) => (
              <Path
                key={`hz-${i}`}
                d={`M ${i * 14} ${quayTop + 7} l 7 -5 l 4 0 l -7 5 Z`}
                fill={sea.hazardDark}
              />
            ))}
            {Array.from({ length: Math.floor(width / 56) }, (_, i) => (
              <Line
                key={`joint-${i}`}
                x1={(i + 1) * 56}
                x2={(i + 1) * 56}
                y1={quayTop + 9}
                y2={CANVAS_HEIGHT}
                stroke={sea.joint}
                strokeWidth={1}
              />
            ))}

            {/* Steel bollards along the edge. */}
            {[0.3, 0.55, 0.82].map((f) => (
              <G key={`bollard-${f}`}>
                <Rect
                  x={f * width - 3.5}
                  y={quayTop - 8}
                  width={7}
                  height={10}
                  rx={2}
                  fill={sea.steelDark}
                />
                <Rect
                  x={f * width - 5.5}
                  y={quayTop - 11}
                  width={11}
                  height={4.5}
                  rx={2}
                  fill={sea.steel}
                />
              </G>
            ))}

            {/* Container stacks waiting on the quay corners. */}
            {(
              [
                { x: 8, y: quayTop - 13, c: 0 },
                { x: 8, y: quayTop - 26, c: 1 },
                { x: 46, y: quayTop - 13, c: 2 },
                { x: width - 44, y: quayTop - 13, c: 3 },
                { x: width - 40, y: quayTop - 26, c: 4 },
              ] as const
            ).map((s, i) => (
              <G key={`stack-${i}`} opacity={0.92}>
                <Rect
                  x={s.x}
                  y={s.y}
                  width={36}
                  height={12}
                  rx={1.5}
                  fill={colors.chart[s.c % colors.chart.length]}
                />
                {[9, 18, 27].map((dx) => (
                  <Line
                    key={`corr-${dx}`}
                    x1={s.x + dx}
                    y1={s.y + 1.5}
                    x2={s.x + dx}
                    y2={s.y + 10.5}
                    stroke="rgba(0,0,0,0.2)"
                    strokeWidth={1.2}
                  />
                ))}
              </G>
            ))}

            {/* The gantry crane, mid-lift over the water. */}
            <G>
              <Rect x={craneX - 16} y={quayTop - 52} width={6} height={56} fill={sea.steel} />
              <Rect x={craneX + 10} y={quayTop - 52} width={6} height={56} fill={sea.steel} />
              <Line
                x1={craneX - 13}
                y1={quayTop - 10}
                x2={craneX + 13}
                y2={quayTop - 34}
                stroke={sea.steelDark}
                strokeWidth={2}
              />
              <Rect x={craneX - 84} y={quayTop - 58} width={140} height={5} fill={sea.steel} />
              <Rect x={craneX - 4} y={quayTop - 73} width={8} height={15} fill={sea.steel} />
              <Line
                x1={craneX}
                y1={quayTop - 71}
                x2={craneX - 82}
                y2={quayTop - 56}
                stroke={sea.steelDark}
                strokeWidth={1.4}
              />
              <Line
                x1={craneX}
                y1={quayTop - 71}
                x2={craneX + 54}
                y2={quayTop - 56}
                stroke={sea.steelDark}
                strokeWidth={1.4}
              />
              <Rect x={craneX + 42} y={quayTop - 52} width={14} height={9} fill={sea.steelDark} />
              {/* Trolley, cable, and the container on the hook. */}
              <Rect x={craneX - 62} y={quayTop - 54} width={10} height={7} fill={sea.hazard} />
              <Line
                x1={craneX - 57}
                y1={quayTop - 47}
                x2={craneX - 57}
                y2={quayTop - 32}
                stroke={sea.steelDark}
                strokeWidth={1.4}
              />
              <Rect
                x={craneX - 68}
                y={quayTop - 32}
                width={22}
                height={12}
                rx={1.5}
                fill={colors.chart[5 % colors.chart.length]}
              />
            </G>
          </Svg>
        )}

        {/* Water lapping against the quay. */}
        {width > 0 && (
          <View style={styles.lapWrap} pointerEvents="none">
            <Waterline height={LAP_HEIGHT} width={width} color={colors.accentStrong} />
          </View>
        )}

        {/* Distance labels ride their lines, out of the fleet's way. */}
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

        {/* The fleet. Each vessel is a billing day; badges are its cargo. */}
        {width > 0 &&
          vessels.map((v, i) => {
            const single = v.cargo.length === 1 && v.hiddenCargo === 0;
            const open = (item: PaymentItem) =>
              router.push({ pathname: "/item", params: { id: item.id } });
            return (
              <View
                key={v.key}
                style={{
                  position: "absolute",
                  left: v.x - v.geo.w / 2,
                  top: v.y - v.geo.waterY,
                  width: v.geo.w,
                  height: v.geo.h,
                }}
              >
                <Drift index={i}>
                  <Pressable
                    onPress={single ? () => open(v.cargo[0].item) : undefined}
                    accessibilityLabel={v.cargo.map((c) => c.item.name).join(", ")}
                  >
                    <VesselSprite
                      kind={v.kind}
                      geo={v.geo}
                      palette={sea}
                      facing={v.facing}
                      cargoColors={v.cargo.map((c) => c.item.color ?? colors.accent)}
                    />
                    {v.cargo.map((c, j) => {
                      const anchor = v.geo.badges[j];
                      if (!anchor) return null;
                      const bx = v.facing === -1 ? v.geo.w - anchor.x : anchor.x;
                      const category = categories.find((cat) => cat.id === c.item.categoryId);
                      return (
                        <Pressable
                          key={c.item.id}
                          onPress={() => open(c.item)}
                          hitSlop={6}
                          accessibilityLabel={c.item.name}
                          style={{
                            position: "absolute",
                            left: bx - anchor.size / 2,
                            top: anchor.y - anchor.size / 2,
                          }}
                        >
                          <BrandBadge
                            domain={c.item.domain}
                            icon={category?.icon}
                            fallback={c.item.name.charAt(0).toUpperCase()}
                            color={c.item.color ?? colors.accent}
                            size={anchor.size}
                          />
                        </Pressable>
                      );
                    })}
                    {v.hiddenCargo > 0 && (
                      <View
                        style={[
                          styles.cargoMore,
                          v.facing === -1 ? { top: 8, left: 2 } : { top: 8, right: 2 },
                        ]}
                      >
                        <Text style={styles.cargoMoreText}>
                          {t("harbor.more", { count: v.hiddenCargo })}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                </Drift>
              </View>
            );
          })}

        {overflow > 0 && (
          <View style={styles.overflowChip}>
            <Text style={styles.overflowText}>{t("harbor.more", { count: overflow })}</Text>
          </View>
        )}

        {/* The quay is today. Everything sails toward it as its charge nears. */}
        <View style={styles.quayLabelWrap} pointerEvents="none">
          <Text style={styles.quayLabel}>{t("harbor.dock")}</Text>
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
      bottom: QUAY_HEIGHT - 1,
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
    cargoMore: {
      position: "absolute",
      backgroundColor: colors.surface,
      borderRadius: radius.sm,
      paddingHorizontal: 4,
      paddingVertical: 1,
    },
    cargoMoreText: {
      ...typography.micro,
      color: colors.mutedText,
    },
    overflowChip: {
      position: "absolute",
      bottom: QUAY_HEIGHT + spacing.sm + LAP_HEIGHT,
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
    quayLabelWrap: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: QUAY_HEIGHT - 10,
      alignItems: "center",
      justifyContent: "center",
    },
    // Stenciled on the slab: the theme's text color reads on both concretes.
    quayLabel: {
      ...typography.micro,
      color: colors.text,
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
