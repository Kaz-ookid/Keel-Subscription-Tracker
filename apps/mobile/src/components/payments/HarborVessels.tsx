// The harbor's fleet (DESIGN.md §3.7 B): every billing day arrives as ONE
// vessel, and what the day costs decides what carries it: a container ship,
// a small cargo launch, a wooden crate, or a lost cardboard box. Sprites are
// side-view silhouettes placed on the top-down sea (the classic harbor-map
// trick) and anchored on their waterline; brand badges ride the cargo, so
// the ship is the day and the containers are the payments.

import Svg, { G, Line, Path, Rect } from "react-native-svg";

export type VesselKind = "ship" | "boat" | "crate" | "box";

export interface HarborPalette {
  deep: string;
  shallow: string;
  ripple: string;
  sail: string;
  wood: string;
  woodDark: string;
  concrete: string;
  concreteEdge: string;
  hazard: string;
  hazardDark: string;
  joint: string;
  steel: string;
  steelDark: string;
  hull: string;
  stripe: string;
  bridge: string;
  window: string;
  cardboard: string;
  cardboardDark: string;
  submerge: string;
  wake: string;
}

/** Night water and day water; the fleet's paint rides the theme with it. */
export function harborPalette(scheme: "light" | "dark"): HarborPalette {
  return scheme === "dark"
    ? {
        deep: "#060D1C",
        shallow: "#14294A",
        ripple: "rgba(143,199,191,0.14)",
        sail: "rgba(237,241,245,0.35)",
        wood: "#4A3A26",
        woodDark: "#372B1B",
        concrete: "#222933",
        concreteEdge: "#303945",
        hazard: "#C99F3A",
        hazardDark: "#161C26",
        joint: "rgba(0,0,0,0.35)",
        steel: "#425064",
        steelDark: "#2E3948",
        hull: "#354356",
        stripe: "#B75046",
        bridge: "#D7DEE7",
        window: "#2C3644",
        cardboard: "#A98A5F",
        cardboardDark: "#846A47",
        submerge: "rgba(6,13,28,0.45)",
        wake: "rgba(237,241,245,0.35)",
      }
    : {
        deep: "#8FB6C4",
        shallow: "#C6E0E4",
        ripple: "rgba(255,255,255,0.45)",
        sail: "rgba(7,20,41,0.35)",
        wood: "#8A6A45",
        woodDark: "#6E5334",
        concrete: "#B9C0C9",
        concreteEdge: "#CBD2DA",
        hazard: "#E5B93F",
        hazardDark: "#3A404A",
        joint: "rgba(7,20,41,0.18)",
        steel: "#5A6675",
        steelDark: "#46505D",
        hull: "#3E4C5F",
        stripe: "#C2564A",
        bridge: "#F4F7FA",
        window: "#46505D",
        cardboard: "#C9A876",
        cardboardDark: "#A0855C",
        submerge: "rgba(63,110,128,0.35)",
        wake: "rgba(255,255,255,0.6)",
      };
}

/** What carries a billing day: several payments always rate a hull; a lone
 *  one earns its vessel by its share of the harbor's biggest day. */
export function vesselKind(cargoCount: number, share: number): VesselKind {
  if (cargoCount >= 3) return "ship";
  if (cargoCount === 2) return share >= 0.35 ? "ship" : "boat";
  if (share >= 0.45) return "ship";
  if (share >= 0.18) return "boat";
  if (share >= 0.07) return "crate";
  return "box";
}

export interface VesselGeometry {
  w: number;
  h: number;
  /** Sprite-top → waterline distance; vessels anchor on this line. */
  waterY: number;
  /** Badge centers in sprite coordinates, one per visible cargo. */
  badges: { x: number; y: number; size: number }[];
}

// Ship deck hardware, shared by geometry and drawing.
const SHIP = { contW: 22, contH: 15, gap: 3, bridgeW: 15, margin: 9, off: 6 };
const BOAT = { crateW: 18, crateH: 13, off: 5 };

/** How many cargo a hull can SHOW; the rest becomes the vessel's +N chip. */
export function visibleCargo(kind: VesselKind, cargoCount: number): number {
  return Math.min(cargoCount, kind === "ship" ? 4 : 2);
}

export function vesselGeometry(
  kind: VesselKind,
  cargoCount: number,
  share: number,
): VesselGeometry {
  const n = visibleCargo(kind, cargoCount);
  if (kind === "ship") {
    // The hull stretches for its cargo and swells a little with its share.
    const boost = Math.round(share * 18);
    const w =
      SHIP.off * 2 +
      SHIP.margin * 2 +
      SHIP.bridgeW +
      4 +
      n * (SHIP.contW + SHIP.gap) -
      SHIP.gap +
      boost;
    const cargoX0 = SHIP.off + SHIP.margin + SHIP.bridgeW + 4 + boost / 2;
    return {
      w: Math.max(88, w),
      h: 56,
      waterY: 46,
      badges: Array.from({ length: n }, (_, i) => ({
        x: cargoX0 + i * (SHIP.contW + SHIP.gap) + SHIP.contW / 2,
        y: 18.5,
        size: 20,
      })),
    };
  }
  if (kind === "boat") {
    const boost = Math.round(share * 10);
    const w = BOAT.off * 2 + 30 + n * (BOAT.crateW + 3) + boost;
    const cargoX0 = BOAT.off + 22 + boost / 2;
    return {
      w,
      h: 44,
      waterY: 34,
      badges: Array.from({ length: n }, (_, i) => ({
        x: cargoX0 + i * (BOAT.crateW + 3) + BOAT.crateW / 2,
        y: 15,
        size: 18,
      })),
    };
  }
  if (kind === "crate") {
    return { w: 36, h: 38, waterY: 28, badges: [{ x: 18, y: 16, size: 20 }] };
  }
  return { w: 34, h: 36, waterY: 26, badges: [{ x: 17, y: 15, size: 18 }] };
}

interface SpriteProps {
  kind: VesselKind;
  geo: VesselGeometry;
  palette: HarborPalette;
  /** 1 sails bow-right, -1 mirrors the sprite (badges mirror in the caller). */
  facing: 1 | -1;
  /** Brand colors, one per visible cargo (paints ship containers). */
  cargoColors: string[];
}

export function VesselSprite({ kind, geo, palette, facing, cargoColors }: SpriteProps) {
  const { w, h, waterY } = geo;
  return (
    <Svg width={w} height={h} pointerEvents="none">
      <G transform={facing === -1 ? `translate(${w},0) scale(-1,1)` : undefined}>
        {kind === "ship" && <ShipBody geo={geo} palette={palette} cargoColors={cargoColors} />}
        {kind === "boat" && <BoatBody geo={geo} palette={palette} />}
        {kind === "crate" && <CrateBody palette={palette} />}
        {kind === "box" && <BoxBody palette={palette} />}
        {/* Below the waterline everything dims into the water. */}
        <Rect x={0} y={waterY} width={w} height={h - waterY} fill={palette.submerge} />
        {/* The water it sits in: short wake strokes at the hull. */}
        <Line x1={0} y1={waterY} x2={8} y2={waterY} stroke={palette.wake} strokeWidth={1.4} />
        <Line x1={w - 8} y1={waterY} x2={w} y2={waterY} stroke={palette.wake} strokeWidth={1.4} />
      </G>
    </Svg>
  );
}

function ShipBody({
  geo,
  palette,
  cargoColors,
}: {
  geo: VesselGeometry;
  palette: HarborPalette;
  cargoColors: string[];
}) {
  const { w, waterY } = geo;
  const x0 = SHIP.off;
  const x1 = w - SHIP.off;
  return (
    <>
      {/* Hull: raked stern, bow slanting into the water. */}
      <Path
        d={`M ${x0} 26 L ${x1 - 10} 26 L ${x1} ${waterY} L ${x1 - 5} 50 L ${x0 + 6} 50 L ${x0} ${waterY} Z`}
        fill={palette.hull}
      />
      {/* Boot stripe just above the waterline. */}
      <Rect x={x0 + 4} y={42.5} width={x1 - x0 - 10} height={2.5} fill={palette.stripe} />
      {/* Bridge castle at the stern, with its window band. */}
      <Rect x={x0 + 4} y={8} width={SHIP.bridgeW} height={18} rx={1.5} fill={palette.bridge} />
      <Rect x={x0 + 6.5} y={11} width={SHIP.bridgeW - 5} height={3} fill={palette.window} />
      {/* Containers on deck, one per payment, in each brand's color. */}
      {geo.badges.map((b, i) => (
        <G key={`cont-${i}`}>
          <Rect
            x={b.x - SHIP.contW / 2}
            y={11}
            width={SHIP.contW}
            height={SHIP.contH}
            rx={1.5}
            fill={cargoColors[i] ?? palette.steel}
          />
          <Line
            x1={b.x - 4}
            y1={12.5}
            x2={b.x - 4}
            y2={24.5}
            stroke="rgba(0,0,0,0.18)"
            strokeWidth={1.4}
          />
          <Line
            x1={b.x + 4}
            y1={12.5}
            x2={b.x + 4}
            y2={24.5}
            stroke="rgba(0,0,0,0.18)"
            strokeWidth={1.4}
          />
        </G>
      ))}
    </>
  );
}

function BoatBody({ geo, palette }: { geo: VesselGeometry; palette: HarborPalette }) {
  const { w } = geo;
  const x0 = BOAT.off;
  const x1 = w - BOAT.off;
  return (
    <>
      {/* A working launch: light hull, dark gunwale, wheelhouse at the stern. */}
      <Path
        d={`M ${x0} 22 L ${x1 - 6} 22 Q ${x1} 23 ${x1 - 4} 30 L ${x1 - 8} 38 L ${x0 + 8} 38 Q ${x0 + 1} 29 ${x0} 22 Z`}
        fill={palette.bridge}
      />
      <Rect x={x0 + 1} y={22} width={x1 - x0 - 4} height={2.5} fill={palette.hull} />
      <Rect x={x0 + 4} y={10} width={12} height={12} rx={1.5} fill={palette.hull} />
      <Rect x={x0 + 6} y={12.5} width={8} height={3} fill={palette.bridge} />
      {/* Crated cargo on the open deck. */}
      {geo.badges.map((b, i) => (
        <G key={`crate-${i}`}>
          <Rect
            x={b.x - BOAT.crateW / 2}
            y={9}
            width={BOAT.crateW}
            height={BOAT.crateH}
            rx={1}
            fill={palette.wood}
          />
          <Line
            x1={b.x - BOAT.crateW / 2 + 1}
            y1={15.5}
            x2={b.x + BOAT.crateW / 2 - 1}
            y2={15.5}
            stroke={palette.woodDark}
            strokeWidth={1.2}
          />
        </G>
      ))}
    </>
  );
}

function CrateBody({ palette }: { palette: HarborPalette }) {
  return (
    <>
      {/* A wooden crate riding low, half under the waterline. */}
      <Rect x={5} y={6} width={26} height={24} rx={2} fill={palette.wood} />
      <Line x1={6} y1={14} x2={30} y2={14} stroke={palette.woodDark} strokeWidth={1.4} />
      <Line x1={6} y1={22} x2={30} y2={22} stroke={palette.woodDark} strokeWidth={1.4} />
      <Rect
        x={5}
        y={6}
        width={26}
        height={24}
        rx={2}
        fill="none"
        stroke={palette.woodDark}
        strokeWidth={1.6}
      />
    </>
  );
}

function BoxBody({ palette }: { palette: HarborPalette }) {
  return (
    // A parcel that fell off some ship, listing a few degrees.
    <G transform="rotate(-9 17 15)">
      <Rect x={6} y={7} width={22} height={19} rx={1.5} fill={palette.cardboard} />
      {/* Packing tape and the open-flap crease. */}
      <Rect x={15.5} y={7} width={3} height={19} fill={palette.cardboardDark} />
      <Line x1={6} y1={11} x2={28} y2={11} stroke={palette.cardboardDark} strokeWidth={1.2} />
    </G>
  );
}
