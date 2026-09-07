// The Harbor view (DESIGN.md §3.7 B, now a permanent bonus lens of the
// calendar): the coming YEAR of charges as a fleet arriving at an industrial
// quay. Every projected charge sails in — a monthly subscription appears
// twelve times up the sea, not just once. Each billing day is one vessel;
// same-day payments share it as cargo. Vessel type and size follow the DAY'S
// charge total (container ship → launch → crate → lost box), each cargo piece
// scales with ITS charge, and distance from the quay maps days until due on a
// linear scale (equal water is equal time). Tapping a vessel opens a day
// bubble (what lands, for how much); tapping a bubble row opens the item.
// An OVERDUE charge has already docked: it stands at the quay edge as
// warning-ringed cargo, tap it to open the item and settle. Opens at the
// quay, scrolls out; the sea fades into the page at the top.

import {
  addRecurrence,
  formatCalendarDate,
  formatMoney,
  formatTotalsIn,
  projectCharges,
  today,
  type CalendarDate,
  type Money,
  type ProjectedCharge,
} from "@keel/core";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import Svg, { G, Line, Path, Rect } from "react-native-svg";

import { amountInDisplay } from "../../lib/money-display";
import { useAppData } from "../../state/app-state";
import {
  dockClearance,
  emphasis,
  radius,
  spacing,
  typography,
  useTheme,
  withAlpha,
  type ThemeColors,
} from "../../theme";
import { BrandBadge } from "../BrandBadge";
import { EmptyState } from "../ui/EmptyState";
import { Waterline } from "../Waterline";
import { DockLife, Drift, MaybeDrift, Tide } from "./HarborScenery";
import {
  badgeFor,
  harborPalette,
  vesselGeometry,
  vesselKind,
  VesselSprite,
  visibleCargo,
  type VesselGeometry,
  type VesselKind,
} from "./HarborVessels";

// Tall on purpose: ~8px per day so the fleet has open water between billing
// days instead of hulls rafting up against each other. This is the FLOOR —
// a crowded harbor stretches taller (see the memo) so hulls keep that water.
const BASE_CANVAS_HEIGHT = 3120;
// Fleets past this size earn extra water per vessel; below it the base
// height already gives every hull room.
const COMFORT_FLEET = 24;
const EXTRA_PER_VESSEL = 36;
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

export function HarborView() {
  const router = useRouter();
  const { colors, scheme } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors, scheme), [colors, scheme]);
  const { items, categories, displayCurrency, rates } = useAppData();
  const [width, setWidth] = useState(0);
  // The day bubble: which vessel's cargo is being previewed.
  const [selectedKey, setSelectedKey] = useState<CalendarDate | null>(null);

  const asOf = today();
  const sea = harborPalette(scheme === "dark" ? "dark" : "light");

  // Everything in display-currency terms so sizes compare honestly.
  const numeric = (value: Money) => amountInDisplay(value, displayCurrency, rates);

  const { vessels, paused, overdue, canvasHeight } = useMemo(() => {
    const pausedItems = items.filter((i) => i.status === "paused");

    // The same projection engine as the Upcoming list, a year deep: EVERY
    // future charge sails, sized by the amount actually leaving that day
    // (a 500/year plan is a big ship on its one day, not a small box).
    const horizonEnd = addRecurrence(asOf, { unit: "month", interval: 12 });
    const charges = projectCharges(items, horizonEnd);

    // A charge whose day has passed already DOCKED: it becomes cargo standing
    // at the quay edge, waiting to be collected (tap → mark it paid), instead
    // of a ship pretending it is still at sea.
    const landed: Cargo[] = [];

    // One vessel per billing day: same-day payments sail together.
    const byDay = new Map<CalendarDate, Cargo[]>();
    for (const charge of charges) {
      const cargo = { charge, value: numeric(charge.amount) };
      if (charge.dueDate < asOf) {
        landed.push(cargo);
        continue;
      }
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
    // A crowded harbor gets taller water: the base height is the minimum
    // spacing, and every vessel past a comfortable fleet adds open sea, so
    // forty billing days never raft up the way they would in a fixed canvas.
    const height = BASE_CANVAS_HEIGHT + Math.max(0, kept.length - COMFORT_FLEET) * EXTRA_PER_VESSEL;
    const quayTop = height - QUAY_HEIGHT;
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

    // Oldest debt first: the crate that has waited longest leads the row.
    landed.sort((a, b) => (a.charge.dueDate < b.charge.dueDate ? -1 : 1));

    return { vessels: placed, paused: pausedItems, overdue: landed, canvasHeight: height };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, asOf, width, displayCurrency, rates]);

  const quayTop = canvasHeight - QUAY_HEIGHT;
  const surfaceTop = quayTop + WALL_H + HAZARD_H;

  if (vessels.length === 0 && paused.length === 0 && overdue.length === 0) {
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
  const craneBase = canvasHeight - 12;
  // How many overdue crates fit along the quay edge before the +N chip.
  const overdueShown = width > 0 ? Math.min(8, Math.max(1, Math.floor((width - 70) / 40))) : 0;
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
    <View style={styles.screen}>
      {/* Opens AT the quay: the initial offset overshoots and clamps to the
          bottom, so there is no first frame at the horizon and no visible
          jump. */}
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        contentOffset={{ x: 0, y: canvasHeight }}
      >
        {/* The scene assembles organically: water first, then the fleet fades
          in from the quay outward, the crane joining last — no single pop. */}
        <Animated.View
          style={[styles.canvas, { height: canvasHeight }]}
          entering={FadeIn.duration(200)}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        >
          {/* Open water: deeper (darker) the farther from the quay. */}
          <LinearGradient colors={[sea.deep, sea.shallow]} style={StyleSheet.absoluteFill} />

          {/* The tide: two sheets of ripples drifting toward the quay. */}
          {width > 0 && (
            <>
              <Tide
                width={width}
                height={canvasHeight}
                ripples={ripples.filter((_, i) => i % 2 === 0)}
                color={sea.ripple}
                phase={0}
              />
              <Tide
                width={width}
                height={canvasHeight}
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
            <Svg width={width} height={canvasHeight} style={StyleSheet.absoluteFill}>
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
                  stroke={sea.groove}
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
                height={canvasHeight - surfaceTop}
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
                  y2={canvasHeight}
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
                  { x: 10, y: canvasHeight - 16, c: 0 },
                  { x: 10, y: canvasHeight - 30, c: 1 },
                  { x: 12, y: canvasHeight - 44, c: 2 },
                  { x: 52, y: canvasHeight - 16, c: 3 },
                  { x: 52, y: canvasHeight - 30, c: 4 },
                  { x: width - 48, y: canvasHeight - 16, c: 5 },
                  { x: width - 48, y: canvasHeight - 30, c: 6 },
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
                      fill={sea.glint}
                    />
                    <Path
                      d={`M ${s.x + 36} ${s.y} L ${s.x + 41} ${s.y - 5} L ${s.x + 41} ${s.y + 8} L ${s.x + 36} ${s.y + 13} Z`}
                      fill={color}
                    />
                    <Path
                      d={`M ${s.x + 36} ${s.y} L ${s.x + 41} ${s.y - 5} L ${s.x + 41} ${s.y + 8} L ${s.x + 36} ${s.y + 13} Z`}
                      fill={sea.shade}
                    />
                    {[9, 18, 27].map((dx) => (
                      <Line
                        key={`corr-${dx}`}
                        x1={s.x + dx}
                        y1={s.y + 1.5}
                        x2={s.x + dx}
                        y2={s.y + 11.5}
                        stroke={sea.groove}
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
                      icon={item.icon ?? category?.icon}
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

          {/* Overdue = already docked: cargo standing at the quay edge, waiting
            to be collected. Tap a crate to open the item and settle it. */}
          {width > 0 &&
            overdue.slice(0, overdueShown).map((c, i) => {
              const category = categories.find((cat) => cat.id === c.charge.categoryId);
              return (
                <Pressable
                  key={`overdue-${c.charge.paymentItemId}-${c.charge.dueDate}`}
                  style={[styles.overdueCrate, { left: 14 + i * 40, top: surfaceTop - 34 }]}
                  onPress={() =>
                    router.push({ pathname: "/item", params: { id: c.charge.paymentItemId } })
                  }
                  accessibilityLabel={t("harbor.overdueA11y", { name: c.charge.name })}
                >
                  <BrandBadge
                    domain={c.charge.domain}
                    icon={c.charge.icon ?? category?.icon}
                    fallback={c.charge.name.charAt(0).toUpperCase()}
                    color={c.charge.color ?? colors.accent}
                    size={22}
                  />
                </Pressable>
              );
            })}
          {width > 0 && overdue.length > overdueShown && (
            <View
              style={[styles.overdueMore, { left: 14 + overdueShown * 40, top: surfaceTop - 26 }]}
            >
              <Text style={styles.overdueMoreText}>
                {t("harbor.more", { count: overdue.length - overdueShown })}
              </Text>
            </View>
          )}

          {/* The fleet. Each vessel is a billing day; tap it for the day.
            Only the near fleet bobs; the far one rides still water. */}
          {width > 0 &&
            vessels.map((v, i) => (
              <Animated.View
                key={v.key}
                // Nearest arrivals surface first; the far fleet follows.
                entering={FadeIn.delay(60 + Math.min(400, v.daysUntil * 6)).duration(180)}
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
                            icon={c.charge.icon ?? category?.icon}
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
              </Animated.View>
            ))}

          {/* The crane stands NEAREST the viewer: drawn over the fleet, so an
            arriving hull passes behind its legs and boom, never through. */}
          {width > 0 && (
            <Animated.View
              style={StyleSheet.absoluteFill}
              entering={FadeIn.delay(180).duration(240)}
              pointerEvents="none"
            >
              <DockLife craneX={craneX} craneBase={craneBase} sea={sea} chart={colors.chart} />
            </Animated.View>
          )}

          {/* The day bubble: what lands that day, anchored to the hull. */}
          {selected && bubble && (
            <>
              <View
                style={[styles.bubble, { top: bubble.top, left: bubble.left, width: BUBBLE_W }]}
              >
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
                        icon={c.charge.icon ?? category?.icon}
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
        </Animated.View>
      </ScrollView>

      {/* The sea dissolves into the page instead of cutting off, and the
          concept sits in one quiet line under the fade. */}
      <LinearGradient
        colors={[colors.background, withAlpha(colors.background, 0)]}
        style={styles.topFade}
        pointerEvents="none"
      >
        <Text style={styles.explainer}>{t("harbor.explainer")}</Text>
      </LinearGradient>
    </View>
  );
}

function createStyles(colors: ThemeColors, scheme: "light" | "dark") {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: "transparent" },
    content: { padding: spacing.md, paddingBottom: dockClearance, gap: spacing.sm },
    center: {
      flex: 1,
      justifyContent: "center",
      backgroundColor: colors.background,
    },
    canvas: {
      // Height comes inline: it grows with the fleet (base is the minimum).
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
      // The bubble floats over the water: full-weight shadow at night, a
      // breath of one over the light sea.
      shadowColor: "#000",
      shadowOpacity: scheme === "dark" ? 0.3 : 0.12,
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
    topFade: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 56,
      paddingTop: 6,
      alignItems: "center",
    },
    explainer: {
      ...typography.caption,
      fontSize: 11,
      color: colors.mutedText,
      textAlign: "center",
      paddingHorizontal: spacing.lg,
    },
    overdueCrate: {
      position: "absolute",
      width: 34,
      height: 34,
      borderRadius: radius.sm,
      borderWidth: 2,
      borderColor: colors.tones.warning,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    overdueMore: {
      position: "absolute",
      backgroundColor: colors.surface,
      borderRadius: radius.sm,
      paddingHorizontal: 5,
      paddingVertical: 2,
    },
    overdueMoreText: {
      ...typography.micro,
      color: colors.tones.warning,
      fontWeight: "600",
    },
  });
}
