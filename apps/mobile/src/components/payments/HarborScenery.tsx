// The harbor's living scenery (DESIGN.md §3.7 B): the fleet's bob, the tide's
// drifting ripples, and the working crane. Pure animation pieces — no app
// state, no layout math; HarborView places them in the scene.

import { useEffect, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Line, Path, Rect } from "react-native-svg";

import type { HarborPalette } from "./HarborVessels";

/** A vessel's gentle 1-2px bob, phase-shifted so the fleet never moves in
 *  lockstep. */
export function Drift({ index, children }: { index: number; children: ReactNode }) {
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

/** Bob only when asked (hooks can't be conditional, wrappers can). */
export function MaybeDrift({
  active,
  index,
  children,
}: {
  active: boolean;
  index: number;
  children: ReactNode;
}) {
  if (!active) return <View>{children}</View>;
  return <Drift index={index}>{children}</Drift>;
}

/** The tide. Ripple strokes drift toward the quay in slow, phase-shifted
 *  sheets that fade in and out, so the water itself says which way the
 *  fleet is headed: down, toward today. */
export function Tide({
  width,
  height,
  ripples,
  color,
  phase,
}: {
  width: number;
  /** The scene canvas height the ripple sheet spans. */
  height: number;
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
      <Svg width={width} height={height}>
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

/** The working crane, drawn as the scene's FOREGROUND layer: it stands on
 *  the quay nearest the viewer, so arriving hulls pass behind it. The
 *  trolley shuttles between the yard and the water side, lowering its
 *  container at each end. One long quiet loop: alive, not busy. */
export function DockLife({
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
        style={[styles.craneSvg, { left: craneX - 100, top: craneBase - 136 }]}
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
        style={[styles.craneAssembly, { top: craneBase - 109, left: craneX - 12 }, trolleyStyle]}
      >
        <View style={[styles.trolley, { backgroundColor: sea.hazard }]} />
        <Animated.View style={[styles.cable, { backgroundColor: sea.steelDark }, cableStyle]} />
        <View style={[styles.hookContainer, { backgroundColor: chart[5 % chart.length] }]} />
      </Animated.View>
    </View>
  );
}

// DockLife's fixed shapes (theme-independent geometry; colors come inline).
const styles = StyleSheet.create({
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
