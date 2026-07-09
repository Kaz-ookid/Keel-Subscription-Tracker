// The signature water surface (DESIGN.md §3.7 A): two slow sine layers
// drifting across the bottom of the hero card. Purely decorative — the card's
// number does the talking; the water level (set by the caller from spending
// vs average) is the one-glance "riding high or low" cue. SVG + reanimated
// only, 8s/13s loops, a few pixels of amplitude: steady, never flashy.

import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

interface Props {
  /** Height of the water body in px (the caller maps spending → level). */
  height: number;
  /** Card width; the wave tiles to 2x this and loops seamlessly. */
  width: number;
  /** Wave fill color (drawn at low opacity per layer). */
  color: string;
}

const AMP = 3;

/** One seamless tile of sine-ish wave (cubic approximation), filled to the
 *  bottom. Two periods per `width` so the loop point is invisible. */
function wavePath(width: number, height: number): string {
  const half = width / 4; // half period
  let d = `M0 ${AMP}`;
  for (let i = 0; i < 8; i++) {
    const dy = i % 2 === 0 ? -AMP : AMP;
    d += ` c ${half / 3} ${dy} ${(2 * half) / 3} ${dy} ${half} 0`;
  }
  return `${d} V ${height} H 0 Z`;
}

function WaveLayer({
  width,
  height,
  color,
  opacity,
  duration,
  phase,
}: Props & { opacity: number; duration: number; phase: number }) {
  const shift = useSharedValue(phase);

  useEffect(() => {
    // Reanimated shared values are driven by assigning `.value`.
    shift.value = withRepeat(
      withTiming(phase - width, { duration, easing: Easing.linear }),
      -1,
      false,
    );
  }, [shift, width, duration, phase]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: shift.value % width }] }));

  return (
    <Animated.View style={[styles.layer, { width: width * 2, height }, style]}>
      <Svg width={width * 2} height={height}>
        <Path d={wavePath(width * 2, height)} fill={color} fillOpacity={opacity} />
      </Svg>
    </Animated.View>
  );
}

export function Waterline({ height, width, color }: Props) {
  if (width <= 0) return null;
  return (
    <View pointerEvents="none" style={[styles.water, { height: height + AMP * 2 }]}>
      <WaveLayer
        width={width}
        height={height + AMP * 2}
        color={color}
        opacity={0.1}
        duration={13000}
        phase={-width / 3}
      />
      <WaveLayer
        width={width}
        height={height}
        color={color}
        opacity={0.16}
        duration={8000}
        phase={0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  water: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
  },
  layer: {
    position: "absolute",
    left: 0,
    bottom: 0,
  },
});
