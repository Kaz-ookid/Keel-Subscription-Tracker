// The harbor's fleet (DESIGN.md §3.7 B): every billing day arrives as ONE
// vessel, and what the day costs decides what carries it: a container ship,
// a small cargo launch, a wooden crate, or a lost cardboard box. Sprites are
// side-view silhouettes placed on the top-down sea (the classic harbor-map
// trick) and anchored on their waterline. Each PAYMENT is a piece of cargo:
// its container/crate scales with the charge amount and wears the brand
// badge on its face, so nothing looks glued on top.

import Svg, { G, Line, Path, Rect } from "react-native-svg";

export type VesselKind = "ship" | "trawler" | "boat" | "dinghy" | "crate" | "box" | "bottle";

export interface HarborPalette {
  deep: string;
  shallow: string;
  ripple: string;
  sail: string;
  wood: string;
  woodDark: string;
  wall: string;
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
  glass: string;
  wake: string;
  /** Plank/corrugation lines and quay stains: the scene's linework ink. */
  groove: string;
  /** Dark side-face shading on crates and containers. */
  shade: string;
  /** The light catching a top face. */
  glint: string;
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
        wall: "#1B222D",
        concrete: "#242B36",
        concreteEdge: "#39424F",
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
        glass: "rgba(190,215,235,0.38)",
        wake: "rgba(237,241,245,0.35)",
        groove: "rgba(0,0,0,0.2)",
        shade: "rgba(0,0,0,0.3)",
        glint: "rgba(255,255,255,0.25)",
      }
    : {
        deep: "#8FB6C4",
        shallow: "#C6E0E4",
        ripple: "rgba(255,255,255,0.45)",
        sail: "rgba(7,20,41,0.35)",
        wood: "#8A6A45",
        woodDark: "#6E5334",
        wall: "#8E98A4",
        concrete: "#B9C0C9",
        concreteEdge: "#D4DAE1",
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
        glass: "rgba(255,255,255,0.62)",
        wake: "rgba(255,255,255,0.6)",
        // Navy-tinted inks: pure black linework read too heavy on day water.
        groove: "rgba(11,30,63,0.16)",
        shade: "rgba(11,30,63,0.2)",
        glint: "rgba(255,255,255,0.5)",
      };
}

/** What carries a billing day: several payments always rate a hull; a lone
 *  one earns its vessel by its share of the harbor's biggest day. Seven
 *  classes, so the fleet reads its price range at a glance: a message in a
 *  bottle, a lost parcel, a crate, a rowing dinghy, a working launch, a
 *  fishing trawler, a container ship. */
export function vesselKind(cargoCount: number, share: number): VesselKind {
  if (cargoCount >= 3) return "ship";
  if (cargoCount === 2) return share >= 0.5 ? "ship" : share >= 0.22 ? "trawler" : "boat";
  if (share >= 0.65) return "ship";
  if (share >= 0.4) return "trawler";
  if (share >= 0.24) return "boat";
  if (share >= 0.13) return "dinghy";
  if (share >= 0.06) return "crate";
  if (share >= 0.02) return "box";
  return "bottle";
}

/** A piece of cargo on the sprite; the badge sits centered on its face. */
export interface CargoRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface VesselGeometry {
  w: number;
  h: number;
  /** Sprite-top → waterline distance; vessels anchor on this line. */
  waterY: number;
  /** One rect per visible cargo, in sprite coordinates. */
  cargo: CargoRect[];
  /** Sprite tilt in degrees (the lost parcel lists a little). */
  tilt?: number;
}

/** The badge that fits a cargo face. */
export function badgeFor(rect: CargoRect): { x: number; y: number; size: number } {
  return {
    x: rect.x + rect.w / 2,
    y: rect.y + rect.h / 2,
    size: Math.max(13, Math.min(rect.w, rect.h) - 3),
  };
}

/** How many cargo a hull can SHOW; the rest becomes the vessel's +N chip. */
export function visibleCargo(kind: VesselKind, cargoCount: number): number {
  if (kind === "ship") return Math.min(cargoCount, 4);
  if (kind === "trawler" || kind === "boat") return Math.min(cargoCount, 2);
  return 1;
}

const SHIP = { off: 6, stern: 8, bridgeW: 15, gap: 3 };
const TRAWLER = { off: 5, bow: 22, gap: 3 };
const BOAT = { off: 5, stern: 4, cabinW: 12, gap: 3 };

/**
 * `cargoShares` is one 0..1 value per VISIBLE cargo (its charge relative to
 * the fleet's biggest single charge); `dayShare` is the whole day's total
 * relative to the fleet's biggest day.
 */
export function vesselGeometry(
  kind: VesselKind,
  cargoShares: number[],
  dayShare: number,
): VesselGeometry {
  // WIDE size ranges on purpose (dogfood round 6: a 2-franc crate must never
  // resemble a 350-franc one): the sqrt keeps small values visible, the span
  // does the talking. The caller also scales the whole sprite by the day's
  // share, so kind + cargo size + hull scale stack up.
  if (kind === "ship") {
    // Containers grow with their charge; the hull stretches to hold them.
    const boost = Math.round(dayShare * 20);
    const deckY = 32;
    let x = SHIP.off + SHIP.stern + SHIP.bridgeW + 4 + boost / 2;
    const cargo: CargoRect[] = cargoShares.map((s) => {
      const w = Math.round(16 + 22 * Math.sqrt(s));
      const h = Math.round(14 + 12 * Math.sqrt(s));
      const rect = { x, y: deckY - h, w, h };
      x += w + SHIP.gap;
      return rect;
    });
    const w = x - SHIP.gap + 12 + boost / 2 + SHIP.off;
    return { w: Math.max(92, w), h: 56, waterY: 46, cargo };
  }
  if (kind === "trawler") {
    const boost = Math.round(dayShare * 12);
    const deckY = 28;
    let x = TRAWLER.off + 8;
    const cargo: CargoRect[] = cargoShares.map((s) => {
      const w = Math.round(14 + 14 * Math.sqrt(s));
      const h = Math.round(12 + 10 * Math.sqrt(s));
      const rect = { x, y: deckY - h, w, h };
      x += w + TRAWLER.gap;
      return rect;
    });
    const w = x - TRAWLER.gap + 4 + 16 + 12 + boost + TRAWLER.off;
    return { w: Math.max(78, w), h: 54, waterY: 42, cargo };
  }
  if (kind === "boat") {
    const boost = Math.round(dayShare * 10);
    const deckY = 26;
    let x = BOAT.off + BOAT.stern + BOAT.cabinW + 4 + boost / 2;
    const cargo: CargoRect[] = cargoShares.map((s) => {
      const w = Math.round(14 + 14 * Math.sqrt(s));
      const h = Math.round(12 + 10 * Math.sqrt(s));
      const rect = { x, y: deckY - h, w, h };
      x += w + BOAT.gap;
      return rect;
    });
    const w = x - BOAT.gap + 10 + boost / 2 + BOAT.off;
    return { w, h: 44, waterY: 34, cargo };
  }
  if (kind === "dinghy") {
    // A rowing dinghy with one parcel amidships.
    const s = cargoShares[0] ?? 0;
    const cw = Math.round(13 + 11 * Math.sqrt(s));
    const ch = Math.round(11 + 9 * Math.sqrt(s));
    const w = cw + 36;
    return { w, h: 42, waterY: 32, cargo: [{ x: (w - cw) / 2, y: 24 - ch, w: cw, h: ch }] };
  }
  if (kind === "bottle") {
    // A message in a bottle: the smallest charges drift in glass.
    return { w: 38, h: 30, waterY: 22, cargo: [{ x: 5, y: 7, w: 20, h: 14 }], tilt: -6 };
  }
  if (kind === "crate") {
    // A floating crate rides low: about a quarter of it under the water.
    const side = Math.round(22 + 20 * Math.sqrt(cargoShares[0] ?? 0));
    const w = side + 12;
    const h = side + 14;
    const waterY = h - 9;
    return { w, h, waterY, cargo: [{ x: 6, y: waterY + 5 - side, w: side, h: side }] };
  }
  const side = Math.round(18 + 16 * Math.sqrt(cargoShares[0] ?? 0));
  const w = side + 12;
  const h = side + 14;
  const waterY = h - 9;
  return {
    w,
    h,
    waterY,
    cargo: [{ x: 6, y: waterY + 4 - side, w: side, h: side }],
    tilt: -9,
  };
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
        {kind === "trawler" && <TrawlerBody geo={geo} palette={palette} />}
        {kind === "boat" && <BoatBody geo={geo} palette={palette} />}
        {kind === "dinghy" && <DinghyBody geo={geo} palette={palette} />}
        {kind === "crate" && <CrateBody geo={geo} palette={palette} />}
        {kind === "box" && <BoxBody geo={geo} palette={palette} />}
        {kind === "bottle" && <BottleBody geo={geo} palette={palette} />}
        {/* The water it sits in: short wake strokes at the hull. */}
        <Line x1={0} y1={waterY} x2={7} y2={waterY} stroke={palette.wake} strokeWidth={1.4} />
        <Line x1={w - 7} y1={waterY} x2={w} y2={waterY} stroke={palette.wake} strokeWidth={1.4} />
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
        d={`M ${x0} 32 L ${x1 - 10} 32 L ${x1} ${waterY} L ${x1 - 5} 50 L ${x0 + 6} 50 L ${x0} ${waterY} Z`}
        fill={palette.hull}
      />
      {/* Boot stripe just above the waterline. */}
      <Rect x={x0 + 4} y={42.5} width={x1 - x0 - 10} height={2.5} fill={palette.stripe} />
      {/* Bridge castle at the stern, with its window band. */}
      <Rect x={x0 + 4} y={12} width={SHIP.bridgeW} height={20} rx={1.5} fill={palette.bridge} />
      <Rect x={x0 + 6.5} y={15} width={SHIP.bridgeW - 5} height={3} fill={palette.window} />
      {/* Containers on deck, one per payment, sized by its charge and
          painted in the brand's color; the badge sits on this face. */}
      {geo.cargo.map((c, i) => (
        <G key={`cont-${i}`}>
          <Rect
            x={c.x}
            y={c.y}
            width={c.w}
            height={c.h}
            rx={1.5}
            fill={cargoColors[i] ?? palette.steel}
          />
          <Line
            x1={c.x + 3}
            y1={c.y + 1.5}
            x2={c.x + 3}
            y2={c.y + c.h - 1.5}
            stroke={palette.groove}
            strokeWidth={1.4}
          />
          <Line
            x1={c.x + c.w - 3}
            y1={c.y + 1.5}
            x2={c.x + c.w - 3}
            y2={c.y + c.h - 1.5}
            stroke={palette.groove}
            strokeWidth={1.4}
          />
        </G>
      ))}
    </>
  );
}

function TrawlerBody({ geo, palette }: { geo: VesselGeometry; palette: HarborPalette }) {
  const { w } = geo;
  const x0 = TRAWLER.off;
  const x1 = w - TRAWLER.off;
  const whX = x1 - 12 - 16; // wheelhouse forward, near the bow
  return (
    <>
      {/* A working hull with a proud, rising bow. */}
      <Path
        d={`M ${x0} 28 L ${x1 - 10} 23 Q ${x1 - 2} 22.5 ${x1 - 4} 30 L ${x1 - 8} 46 L ${x0 + 6} 46 Z`}
        fill={palette.hull}
      />
      <Rect x={x0 + 3} y={39} width={x1 - x0 - 13} height={2.5} fill={palette.stripe} />
      {/* Wheelhouse and the mast with its fishing boom astern. */}
      <Rect x={whX} y={12} width={16} height={16} rx={1.5} fill={palette.bridge} />
      <Rect x={whX + 2.5} y={15} width={11} height={3.5} fill={palette.window} />
      <Line x1={whX - 5} y1={28} x2={whX - 5} y2={6} stroke={palette.steelDark} strokeWidth={1.6} />
      <Line
        x1={whX - 5}
        y1={10}
        x2={whX - 24}
        y2={20}
        stroke={palette.steelDark}
        strokeWidth={1.4}
      />
      <Line
        x1={whX - 24}
        y1={20}
        x2={whX - 24}
        y2={26}
        stroke={palette.steelDark}
        strokeWidth={1}
      />
      {/* The catch of the day: crated cargo on the aft deck. */}
      {geo.cargo.map((c, i) => (
        <G key={`crate-${i}`}>
          <Rect x={c.x} y={c.y} width={c.w} height={c.h} rx={1} fill={palette.wood} />
          <Rect
            x={c.x}
            y={c.y}
            width={c.w}
            height={c.h}
            rx={1}
            fill="none"
            stroke={palette.woodDark}
            strokeWidth={1.2}
          />
        </G>
      ))}
    </>
  );
}

function DinghyBody({ geo, palette }: { geo: VesselGeometry; palette: HarborPalette }) {
  const { w } = geo;
  const c = geo.cargo[0];
  return (
    <>
      {/* An open rowing boat, sheer curving to both ends. */}
      <Path
        d={`M 5 22 Q ${w / 2} 26 ${w - 5} 22 L ${w - 9} 32 Q ${w / 2} 37 9 32 Z`}
        fill={palette.wood}
      />
      <Path
        d={`M 5 22 Q ${w / 2} 26 ${w - 5} 22`}
        stroke={palette.woodDark}
        strokeWidth={2}
        fill="none"
      />
      {/* The parcel it ferries. */}
      <Rect x={c.x} y={c.y} width={c.w} height={c.h} rx={1.5} fill={palette.cardboard} />
      <Rect
        x={c.x}
        y={c.y}
        width={c.w}
        height={c.h}
        rx={1.5}
        fill="none"
        stroke={palette.cardboardDark}
        strokeWidth={1.2}
      />
    </>
  );
}

function BottleBody({ geo, palette }: { geo: VesselGeometry; palette: HarborPalette }) {
  const c = geo.cargo[0];
  const cx = c.x + c.w / 2;
  const cy = c.y + c.h / 2;
  return (
    // A message in a bottle, listing gently: glass body, neck, cork.
    <G transform={`rotate(${geo.tilt ?? 0} ${cx} ${cy})`}>
      <Rect x={4} y={7} width={22} height={14} rx={6} fill={palette.glass} />
      <Rect x={25} y={10.5} width={5.5} height={7} fill={palette.glass} />
      <Rect x={30} y={9.5} width={4.5} height={9} rx={1.5} fill={palette.cardboardDark} />
      <Path d={`M 8 10.5 q 5 -2 10 0`} stroke={palette.wake} strokeWidth={1.2} fill="none" />
    </G>
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
        d={`M ${x0} 26 L ${x1 - 6} 26 Q ${x1} 27 ${x1 - 4} 32 L ${x1 - 8} 38 L ${x0 + 8} 38 Q ${x0 + 1} 31 ${x0} 26 Z`}
        fill={palette.bridge}
      />
      <Rect x={x0 + 1} y={26} width={x1 - x0 - 4} height={2.5} fill={palette.hull} />
      <Rect x={x0 + 4} y={14} width={BOAT.cabinW} height={12} rx={1.5} fill={palette.hull} />
      <Rect x={x0 + 6} y={16.5} width={BOAT.cabinW - 4} height={3} fill={palette.bridge} />
      {/* Crated cargo on the open deck, sized by its charge. */}
      {geo.cargo.map((c, i) => (
        <G key={`crate-${i}`}>
          <Rect x={c.x} y={c.y} width={c.w} height={c.h} rx={1} fill={palette.wood} />
          <Rect
            x={c.x}
            y={c.y}
            width={c.w}
            height={c.h}
            rx={1}
            fill="none"
            stroke={palette.woodDark}
            strokeWidth={1.2}
          />
        </G>
      ))}
    </>
  );
}

function CrateBody({ geo, palette }: { geo: VesselGeometry; palette: HarborPalette }) {
  const c = geo.cargo[0];
  return (
    <>
      {/* A wooden crate riding low in the water. */}
      <Rect x={c.x} y={c.y} width={c.w} height={c.h} rx={2} fill={palette.wood} />
      <Line
        x1={c.x + 1}
        y1={c.y + c.h * 0.3}
        x2={c.x + c.w - 1}
        y2={c.y + c.h * 0.3}
        stroke={palette.woodDark}
        strokeWidth={1.4}
      />
      <Line
        x1={c.x + 1}
        y1={c.y + c.h * 0.7}
        x2={c.x + c.w - 1}
        y2={c.y + c.h * 0.7}
        stroke={palette.woodDark}
        strokeWidth={1.4}
      />
      <Rect
        x={c.x}
        y={c.y}
        width={c.w}
        height={c.h}
        rx={2}
        fill="none"
        stroke={palette.woodDark}
        strokeWidth={1.6}
      />
    </>
  );
}

function BoxBody({ geo, palette }: { geo: VesselGeometry; palette: HarborPalette }) {
  const c = geo.cargo[0];
  const cx = c.x + c.w / 2;
  const cy = c.y + c.h / 2;
  return (
    // A parcel that fell off some ship, listing a few degrees.
    <G transform={`rotate(${geo.tilt ?? 0} ${cx} ${cy})`}>
      <Rect x={c.x} y={c.y} width={c.w} height={c.h} rx={1.5} fill={palette.cardboard} />
      {/* Packing tape and the open-flap crease. */}
      <Rect x={cx - 1.5} y={c.y} width={3} height={c.h} fill={palette.cardboardDark} />
      <Line
        x1={c.x}
        y1={c.y + 4}
        x2={c.x + c.w}
        y2={c.y + 4}
        stroke={palette.cardboardDark}
        strokeWidth={1.2}
      />
    </G>
  );
}
