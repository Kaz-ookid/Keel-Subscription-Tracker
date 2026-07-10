// The Harbor view (DESIGN.md §3.7 B, experimental — behind the Settings debug
// toggle): the coming YEAR of charges as a fleet arriving at an industrial
// quay. Every projected charge sails in — a monthly subscription appears
// twelve times up the sea, not just once. Each billing day is one vessel;
// same-day payments share it as cargo. Vessel type and size follow the DAY'S
// charge total (container ship → launch → crate → lost box), each cargo piece
// scales with ITS charge, and distance from the quay maps days until due on a
// linear scale (equal water is equal time). Tapping a vessel opens a day
// bubble (what lands, for how much); tapping a bubble row opens the item.
// Opens at the quay, scrolls out.

import {
  addRecurrence,
  formatCalendarDate,
  formatMoney,
  formatTotalsIn,
  mergeTotals,
  projectCharges,
  today,
  type CalendarDate,
  type Money,
  type ProjectedCharge,
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
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { G, Line, Path, Rect } from "react-native-svg";

import { useAppState } from "../../state/app-state";
import { emphasis, radius, spacing, typography, useTheme, type ThemeColors } from "../../theme";
import { BrandBadge } from "../BrandBadge";
import { EmptyState } from "../ui/EmptyState";
import { Waterline } from "../Waterline";
import {
  badgeFor,
  harborPalette,
  vesselGeometry,
  vesselKind,
  VesselSprite,
  visibleCargo,
  type HarborPalette,
  type VesselGeometry,
  type VesselKind,
} from "./HarborVessels";

// Tall on purpose: ~8px per day so the fleet has open water between billing
// days instead of hulls rafting up against each other.
const CANVAS_HEIGHT = 3120;
// The quay is an elevated structure now: a seawall the water laps against,
// a hazard-striped lip, then the walk surface with the yard on it.
const QUAY_HEIGHT = 64;
const WALL_H = 22;
const HAZARD_H = 6;
const LAP_HEIGHT = 10;
// A full year of sea on a LINEAR scale: equal water is equal time, so the
// gaps between vessels read as real gaps in the calendar.
const HORIZON_DAYS = 365;
const MAX_VESSELS = 100;
// Only the near fleet bobs; the far one holds still (and saves the frames).
const DRIFT_DAYS = 60;
const TOP_PAD = 64; // room for the paused shelf and the horizon sail
const BUBBLE_W = 232;

/** 0 (at the quay) → 1 (horizon), linear in days. */
function distanceFraction(days: number): number {
  return Math.min(days, HORIZON_DAYS) / HORIZON_DAYS;
}

interface Cargo {
  charge: ProjectedCharge;
  value: number;
}

interface Vessel {
  key: CalendarDate;
  daysUntil: number;
  total: number;
  /** ALL of the day's cargo (the bubble lists everything)… */
  cargo: Cargo[];
  /** …but the sprite only shows the first `shown`. */
  shown: number;
  kind: VesselKind;
  geo: VesselGeometry;
  /** Whole-sprite scale from the day's share: pocket-money days shrink,
   *  the biggest day looms. */
  scale: number;
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

/** The tide. Ripple strokes drift toward the quay in slow, phase-shifted
 *  sheets that fade in and out, so the water itself says which way the
 *  fleet is headed: down, toward today. */
function Tide({
  width,
  ripples,
  color,
  phase,
}: {
  width: number;
  ripples: { x: number; y: number }[];
  color: string;
  /** 0..1 stagger so the two sheets never breathe together. */
  phase: number;
}) {
  const t = useSharedValue(phase);
  useEffect(() => {
    t.value = phase;
    t.value = withRepeat(
      withTiming(phase + 1, { duration: 9000, easing: Easing.linear }),
      -1,
      false,
    );
  }, [t, phase]);
  const style = useAnimatedStyle(() => {
    const f = t.value % 1;
    return {
      transform: [{ translateY: f * 72 - 36 }],
      opacity: Math.sin(Math.PI * f) * 0.9,
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width={width} height={CANVAS_HEIGHT}>
        {ripples.map((p, i) => (
          <Path
            key={`tide-${i}`}
            d={`M ${p.x} ${p.y} q 7 -3 14 0 q 7 3 14 0`}
            stroke={color}
            strokeWidth={1.2}
            fill="none"
          />
        ))}
      </Svg>
    </Animated.View>
  );
}

/** Bob only when asked (hooks can't be conditional, wrappers can). */
function MaybeDrift({
  active,
  index,
  children,
}: {
  active: boolean;
  index: number;
  children: React.ReactNode;
}) {
  if (!active) return <View>{children}</View>;
  return <Drift index={index}>{children}</Drift>;
}

/** The working crane, drawn as the scene's FOREGROUND layer: it stands on
 *  the quay nearest the viewer, so arriving hulls pass behind it. The
 *  trolley shuttles between the yard and the water side, lowering its
 *  container at each end. One long quiet loop: alive, not busy. */
function DockLife({
  craneX,
  craneBase,
  sea,
  chart,
}: {
  craneX: number;
  craneBase: number;
  sea: HarborPalette;
  chart: readonly string[];
}) {
  // Trolley travel (relative to the crane's center) and hook drop.
  const tx = useSharedValue(17);
  const drop = useSharedValue(0);
  useEffect(() => {
    // One 11.6s crane cycle: dwell, swing out, work the hook, swing home.
    tx.value = 17;
    tx.value = withRepeat(
      withSequence(
        withTiming(17, { duration: 3000 }),
        withTiming(-61, { duration: 2600, easing: Easing.inOut(Easing.quad) }),
        withTiming(-61, { duration: 3400 }),
        withTiming(17, { duration: 2600, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
    drop.value = 0;
    drop.value = withRepeat(
      withSequence(
        withTiming(36, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
        withTiming(36, { duration: 600 }),
        withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 2600 }),
        withTiming(36, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
        withTiming(36, { duration: 1000 }),
        withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 2600 }),
      ),
      -1,
      false,
    );
  }, [tx, drop]);
  const trolleyStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));
  const cableStyle = useAnimatedStyle(() => ({ height: 16 + drop.value }));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* The structure: legs, braces, boom, apex, stays, counterweight. */}
      <Svg
        width={170}
        height={140}
        style={[styles2.craneSvg, { left: craneX - 100, top: craneBase - 136 }]}
      >
        <Rect x={82} y={28} width={6} height={108} fill={sea.steel} />
        <Rect x={112} y={28} width={6} height={108} fill={sea.steel} />
        <Line x1={85} y1={106} x2={115} y2={66} stroke={sea.steelDark} strokeWidth={2} />
        <Line x1={115} y1={106} x2={85} y2={66} stroke={sea.steelDark} strokeWidth={2} />
        <Rect x={5} y={22} width={150} height={6} fill={sea.steel} />
        <Rect x={96} y={4} width={8} height={18} fill={sea.steel} />
        <Line x1={100} y1={6} x2={8} y2={25} stroke={sea.steelDark} strokeWidth={1.4} />
        <Line x1={100} y1={6} x2={152} y2={25} stroke={sea.steelDark} strokeWidth={1.4} />
        <Rect x={138} y={28} width={15} height={10} fill={sea.steelDark} />
      </Svg>
      {/* The moving parts: trolley, cable, container on the hook. */}
      <Animated.View
        style={[styles2.craneAssembly, { top: craneBase - 109, left: craneX - 12 }, trolleyStyle]}
      >
        <View style={[styles2.trolley, { backgroundColor: sea.hazard }]} />
        <Animated.View style={[styles2.cable, { backgroundColor: sea.steelDark }, cableStyle]} />
        <View style={[styles2.hookContainer, { backgroundColor: chart[5 % chart.length] }]} />
      </Animated.View>
    </View>
  );
}

// DockLife's fixed shapes (theme-independent geometry; colors come inline).
const styles2 = StyleSheet.create({
  craneSvg: { position: "absolute" },
  craneAssembly: {
    position: "absolute",
    width: 24,
    alignItems: "center",
  },
  trolley: { width: 11, height: 8, borderRadius: 1 },
  cable: { width: 2 },
  hookContainer: { width: 23, height: 13, borderRadius: 1.5 },
});

export function HarborView() {
  const router = useRouter();
  const { colors, scheme } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items, categories, displayCurrency, rates } = useAppState();
  const [width, setWidth] = useState(0);
  // The day bubble: which vessel's cargo is being previewed.
  const [selectedKey, setSelectedKey] = useState<CalendarDate | null>(null);
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
  const surfaceTop = quayTop + WALL_H + HAZARD_H;

  const { vessels, paused } = useMemo(() => {
    const pausedItems = items.filter((i) => i.status === "paused");

    // The same projection engine as the Upcoming list, a year deep: EVERY
    // future charge sails, sized by the amount actually leaving that day
    // (a 500/year plan is a big ship on its one day, not a small box).
    const horizonEnd = addRecurrence(asOf, { unit: "month", interval: 12 });
    const charges = projectCharges(items, horizonEnd);

    // One vessel per billing day: same-day payments sail together.
    const byDay = new Map<CalendarDate, Cargo[]>();
    for (const charge of charges) {
      const cargo = { charge, value: numeric(charge.amount) };
      const bucket = byDay.get(charge.dueDate);
      if (bucket) bucket.push(cargo);
      else byDay.set(charge.dueDate, [cargo]);
    }
    const groups = Array.from(byDay.entries()).map(([date, cargo]) => ({
      date,
      daysUntil: Math.max(0, daysBetween(asOf, date)),
      cargo: cargo.sort((a, b) => b.value - a.value),
      total: cargo.reduce((sum, c) => sum + c.value, 0),
    }));
    // The nearest days matter most if the cap ever bites.
    groups.sort((a, b) => a.daysUntil - b.daysUntil);
    const kept = groups.slice(0, MAX_VESSELS);
    const maxDay = Math.max(1, ...kept.map((g) => g.total));
    const maxCharge = Math.max(1, ...kept.flatMap((g) => g.cargo.map((c) => c.value)));

    // Place the big days first: golden-ratio x spread, nudged (x, then a few
    // y steps) until hulls stop overlapping. Deterministic, no reshuffling.
    const order = [...kept].sort((a, b) => b.total - a.total);
    const placed: Vessel[] = [];
    const w = Math.max(width, 1);
    const yNear = quayTop - LAP_HEIGHT - 12;
    const yFar = TOP_PAD + 52;
    order.forEach((g, i) => {
      const dayShare = g.total / maxDay;
      const kind = vesselKind(g.cargo.length, dayShare);
      const shown = visibleCargo(kind, g.cargo.length);
      const geo = vesselGeometry(
        kind,
        g.cargo.slice(0, shown).map((c) => c.value / maxCharge),
        dayShare,
      );
      // On top of kind and cargo size, the whole sprite scales with the
      // day's weight: 2 francs must never resemble 350.
      const scale = 0.8 + 0.5 * Math.sqrt(dayShare);
      const sw = geo.w * scale;
      const sh = geo.h * scale;
      const yIdeal = yNear - distanceFraction(g.daysUntil) * (yNear - yFar);
      const xMin = sw / 2 + 6;
      const xMax = w - sw / 2 - 6;
      const collides = (px: number, py: number) =>
        placed.some(
          (p) =>
            Math.abs(p.x - px) < (p.geo.w * p.scale + sw) / 2 + 12 &&
            Math.abs(p.y - py) < (p.geo.h * p.scale + sh) / 2 + 10,
        );
      let x = xMin + ((i * 0.61803) % 1) * Math.max(xMax - xMin, 1);
      let y = yIdeal;
      outer: for (const dy of [0, -20, 20, -40, 40, -60, 60]) {
        const py = Math.min(Math.max(yIdeal + dy, yFar), yNear);
        let px = x;
        for (let tries = 0; tries < 24; tries += 1) {
          if (!collides(px, py)) {
            x = px;
            y = py;
            break outer;
          }
          px =
            xMin + (((px - xMin) / Math.max(xMax - xMin, 1) + 0.19) % 1) * Math.max(xMax - xMin, 1);
        }
      }
      placed.push({
        key: g.date,
        daysUntil: g.daysUntil,
        total: g.total,
        cargo: g.cargo,
        shown,
        kind,
        geo,
        scale,
        facing: i % 2 === 0 ? 1 : -1,
        x,
        y,
      });
    });

    return { vessels: placed, paused: pausedItems };
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

  const craneX = width * 0.68;
  const craneBase = CANVAS_HEIGHT - 12;
  const selected = selectedKey ? (vessels.find((v) => v.key === selectedKey) ?? null) : null;

  // The day bubble's frame: above the vessel when there's room, else below,
  // clamped inside the canvas, its tip pointing back at the hull.
  const bubble = (() => {
    if (!selected || width === 0) return null;
    const rowCount = selected.cargo.length;
    const height = 44 + rowCount * 34 + (rowCount > 1 ? 28 : 0);
    // The sprite's visual extents under its scale transform.
    const topEdge = selected.y - selected.geo.waterY * selected.scale;
    const bottomEdge = selected.y + (selected.geo.h - selected.geo.waterY) * selected.scale;
    const above = topEdge - height - 12 >= 8;
    const top = above ? topEdge - height - 10 : bottomEdge + 12;
    const left = Math.min(Math.max(selected.x - BUBBLE_W / 2, 8), width - BUBBLE_W - 8);
    const tipX = Math.min(Math.max(selected.x - left - 7, 14), BUBBLE_W - 28);
    return { top, left, tipX, above };
  })();

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

        {/* The tide: two sheets of ripples drifting toward the quay. */}
        {width > 0 && (
          <>
            <Tide
              width={width}
              ripples={ripples.filter((_, i) => i % 2 === 0)}
              color={sea.ripple}
              phase={0}
            />
            <Tide
              width={width}
              ripples={ripples.filter((_, i) => i % 2 === 1)}
              color={sea.ripple}
              phase={0.5}
            />
          </>
        )}

        {/* Water lapping at the seawall: UNDER the quay drawing, so the wall
            and the crane stand in front of the waves, not behind them. */}
        {width > 0 && (
          <View style={styles.lapWrap} pointerEvents="none">
            <Waterline height={LAP_HEIGHT} width={width} color={colors.accentStrong} />
          </View>
        )}

        {width > 0 && (
          <Svg width={width} height={CANVAS_HEIGHT} style={StyleSheet.absoluteFill}>
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

            {/* The seawall the water laps against: the quay has HEIGHT. */}
            <Rect x={0} y={quayTop} width={width} height={WALL_H} fill={sea.wall} />
            {Array.from({ length: Math.floor(width / 90) + 1 }, (_, i) => (
              <Line
                key={`stain-${i}`}
                x1={i * 90 + 34}
                x2={i * 90 + 34}
                y1={quayTop + 4}
                y2={quayTop + WALL_H}
                stroke="rgba(0,0,0,0.22)"
                strokeWidth={2}
              />
            ))}

            {/* The hazard-striped lip of the surface. */}
            <Rect x={0} y={quayTop + WALL_H} width={width} height={HAZARD_H} fill={sea.hazard} />
            {Array.from({ length: Math.ceil(width / 14) + 1 }, (_, i) => (
              <Path
                key={`hz-${i}`}
                d={`M ${i * 14} ${quayTop + WALL_H + HAZARD_H} l 7 -${HAZARD_H} l 4 0 l -7 ${HAZARD_H} Z`}
                fill={sea.hazardDark}
              />
            ))}

            {/* The walk surface: concrete, expansion joints, TODAY stencil. */}
            <Rect
              x={0}
              y={surfaceTop}
              width={width}
              height={CANVAS_HEIGHT - surfaceTop}
              fill={sea.concrete}
            />
            <Line
              x1={0}
              x2={width}
              y1={surfaceTop + 1}
              y2={surfaceTop + 1}
              stroke={sea.concreteEdge}
              strokeWidth={1.5}
            />
            {Array.from({ length: Math.floor(width / 56) }, (_, i) => (
              <Line
                key={`joint-${i}`}
                x1={(i + 1) * 56}
                x2={(i + 1) * 56}
                y1={surfaceTop + 3}
                y2={CANVAS_HEIGHT}
                stroke={sea.joint}
                strokeWidth={1}
              />
            ))}

            {/* Steel bollards on the lip. */}
            {[0.26, 0.5, 0.9].map((f) => (
              <G key={`bollard-${f}`}>
                <Rect
                  x={f * width - 4}
                  y={surfaceTop - 2}
                  width={8}
                  height={9}
                  rx={2}
                  fill={sea.steelDark}
                />
                <Rect
                  x={f * width - 6}
                  y={surfaceTop - 5}
                  width={12}
                  height={5}
                  rx={2.5}
                  fill={sea.steel}
                />
              </G>
            ))}

            {/* Container stacks in the yard, rising past the wall (the same
                cheap isometry as the fleet: front face + lit top + dark side). */}
            {(
              [
                { x: 10, y: CANVAS_HEIGHT - 16, c: 0 },
                { x: 10, y: CANVAS_HEIGHT - 30, c: 1 },
                { x: 12, y: CANVAS_HEIGHT - 44, c: 2 },
                { x: 52, y: CANVAS_HEIGHT - 16, c: 3 },
                { x: 52, y: CANVAS_HEIGHT - 30, c: 4 },
                { x: width - 48, y: CANVAS_HEIGHT - 16, c: 5 },
                { x: width - 48, y: CANVAS_HEIGHT - 30, c: 6 },
              ] as const
            ).map((s, i) => {
              const color = colors.chart[s.c % colors.chart.length];
              return (
                <G key={`stack-${i}`} opacity={0.92}>
                  <Rect x={s.x} y={s.y} width={36} height={13} rx={1} fill={color} />
                  <Path
                    d={`M ${s.x} ${s.y} L ${s.x + 36} ${s.y} L ${s.x + 41} ${s.y - 5} L ${s.x + 5} ${s.y - 5} Z`}
                    fill={color}
                  />
                  <Path
                    d={`M ${s.x} ${s.y} L ${s.x + 36} ${s.y} L ${s.x + 41} ${s.y - 5} L ${s.x + 5} ${s.y - 5} Z`}
                    fill="rgba(255,255,255,0.25)"
                  />
                  <Path
                    d={`M ${s.x + 36} ${s.y} L ${s.x + 41} ${s.y - 5} L ${s.x + 41} ${s.y + 8} L ${s.x + 36} ${s.y + 13} Z`}
                    fill={color}
                  />
                  <Path
                    d={`M ${s.x + 36} ${s.y} L ${s.x + 41} ${s.y - 5} L ${s.x + 41} ${s.y + 8} L ${s.x + 36} ${s.y + 13} Z`}
                    fill="rgba(0,0,0,0.3)"
                  />
                  {[9, 18, 27].map((dx) => (
                    <Line
                      key={`corr-${dx}`}
                      x1={s.x + dx}
                      y1={s.y + 1.5}
                      x2={s.x + dx}
                      y2={s.y + 11.5}
                      stroke="rgba(0,0,0,0.2)"
                      strokeWidth={1.2}
                    />
                  ))}
                </G>
              );
            })}
          </Svg>
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

        {/* The dismiss layer sits UNDER the fleet: tapping open water closes
            the day bubble, tapping another vessel switches to its day in one
            tap. */}
        {selected && (
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedKey(null)} />
        )}

        {/* The fleet. Each vessel is a billing day; tap it for the day.
            Only the near fleet bobs; the far one rides still water. */}
        {width > 0 &&
          vessels.map((v, i) => (
            <View
              key={v.key}
              // The transform scales around the box center; the top offset
              // compensates so the waterline still lands exactly on v.y.
              style={{
                position: "absolute",
                left: v.x - v.geo.w / 2,
                top: v.y - v.geo.h / 2 - (v.geo.waterY - v.geo.h / 2) * v.scale,
                width: v.geo.w,
                height: v.geo.h,
                transform: [{ scale: v.scale }],
              }}
            >
              <MaybeDrift active={v.daysUntil <= DRIFT_DAYS} index={i}>
                <Pressable
                  onPress={() => setSelectedKey(selectedKey === v.key ? null : v.key)}
                  accessibilityLabel={v.cargo.map((c) => c.charge.name).join(", ")}
                >
                  <VesselSprite
                    kind={v.kind}
                    geo={v.geo}
                    palette={sea}
                    facing={v.facing}
                    cargoColors={v.cargo
                      .slice(0, v.shown)
                      .map((c) => c.charge.color ?? colors.accent)}
                  />
                  {v.cargo.slice(0, v.shown).map((c, j) => {
                    const rect = v.geo.cargo[j];
                    if (!rect) return null;
                    const anchor = badgeFor(rect);
                    const bx = v.facing === -1 ? v.geo.w - anchor.x : anchor.x;
                    const category = categories.find((cat) => cat.id === c.charge.categoryId);
                    return (
                      <View
                        key={`${c.charge.paymentItemId}-${j}`}
                        pointerEvents="none"
                        style={{
                          position: "absolute",
                          left: bx - anchor.size / 2,
                          top: anchor.y - anchor.size / 2,
                          transform: v.geo.tilt ? [{ rotate: `${v.geo.tilt}deg` }] : undefined,
                        }}
                      >
                        <BrandBadge
                          domain={c.charge.domain}
                          icon={category?.icon}
                          fallback={c.charge.name.charAt(0).toUpperCase()}
                          color={c.charge.color ?? colors.accent}
                          size={anchor.size}
                        />
                      </View>
                    );
                  })}
                  {v.cargo.length > v.shown && (
                    <View
                      style={[
                        styles.cargoMore,
                        v.facing === -1 ? { top: 8, left: 2 } : { top: 8, right: 2 },
                      ]}
                    >
                      <Text style={styles.cargoMoreText}>
                        {t("harbor.more", { count: v.cargo.length - v.shown })}
                      </Text>
                    </View>
                  )}
                </Pressable>
              </MaybeDrift>
            </View>
          ))}

        {/* The crane stands NEAREST the viewer: drawn over the fleet, so an
            arriving hull passes behind its legs and boom, never through. */}
        {width > 0 && (
          <DockLife craneX={craneX} craneBase={craneBase} sea={sea} chart={colors.chart} />
        )}

        {/* The day bubble: what lands that day, anchored to the hull. */}
        {selected && bubble && (
          <>
            <View style={[styles.bubble, { top: bubble.top, left: bubble.left, width: BUBBLE_W }]}>
              <Text style={styles.bubbleTitle}>
                {formatCalendarDate(selected.key)} ·{" "}
                {t("harbor.days", { count: selected.daysUntil })}
              </Text>
              {selected.cargo.map((c, j) => {
                const category = categories.find((cat) => cat.id === c.charge.categoryId);
                return (
                  <Pressable
                    key={`${c.charge.paymentItemId}-${j}`}
                    style={styles.bubbleRow}
                    onPress={() => {
                      setSelectedKey(null);
                      router.push({ pathname: "/item", params: { id: c.charge.paymentItemId } });
                    }}
                  >
                    <BrandBadge
                      domain={c.charge.domain}
                      icon={category?.icon}
                      fallback={c.charge.name.charAt(0).toUpperCase()}
                      color={c.charge.color ?? colors.accent}
                      size={22}
                    />
                    <Text style={styles.bubbleName} numberOfLines={1}>
                      {c.charge.name}
                    </Text>
                    <Text style={styles.bubbleAmount}>{formatMoney(c.charge.amount)}</Text>
                  </Pressable>
                );
              })}
              {selected.cargo.length > 1 && (
                <View style={styles.bubbleTotalRow}>
                  <Text style={styles.bubbleTotalLabel}>{t("harbor.dayTotal")}</Text>
                  <Text style={styles.bubbleTotalValue}>
                    {formatTotalsIn(
                      selected.cargo.map((c) => c.charge.amount),
                      displayCurrency,
                      rates,
                    )}
                  </Text>
                </View>
              )}
              <View
                style={[
                  styles.bubbleTip,
                  bubble.above ? styles.bubbleTipDown : styles.bubbleTipUp,
                  { left: bubble.tipX },
                ]}
              />
            </View>
          </>
        )}

        {/* The quay is today. Everything sails toward it as its charge nears. */}
        <View style={styles.quayLabelWrap} pointerEvents="none">
          <Text style={styles.quayLabel}>{t("harbor.dock")}</Text>
        </View>
      </View>
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
      bottom: QUAY_HEIGHT - 5,
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
    // Below the floating lens chip (ScheduleView) at the canvas top-right.
    pausedShelf: {
      position: "absolute",
      top: 48,
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
    bubble: {
      position: "absolute",
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      shadowColor: "#000",
      shadowOpacity: 0.3,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
    },
    bubbleTitle: {
      ...typography.caption,
      fontWeight: "600",
      color: colors.mutedText,
      paddingBottom: spacing.xs,
    },
    bubbleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: 6,
    },
    bubbleName: { ...typography.label, color: colors.text, flex: 1 },
    bubbleAmount: { ...typography.caption, color: colors.mutedText },
    bubbleTotalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingTop: spacing.xs,
      marginTop: 2,
    },
    bubbleTotalLabel: { ...typography.caption, color: colors.mutedText },
    bubbleTotalValue: { ...typography.caption, fontWeight: "600", color: colors.text },
    bubbleTip: {
      position: "absolute",
      width: 0,
      height: 0,
      borderLeftWidth: 7,
      borderRightWidth: 7,
      borderLeftColor: "transparent",
      borderRightColor: "transparent",
    },
    bubbleTipDown: {
      bottom: -8,
      borderTopWidth: 8,
      borderTopColor: colors.surface,
    },
    bubbleTipUp: {
      top: -8,
      borderBottomWidth: 8,
      borderBottomColor: colors.surface,
    },
    quayLabelWrap: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: QUAY_HEIGHT - WALL_H - HAZARD_H,
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
  });
}
