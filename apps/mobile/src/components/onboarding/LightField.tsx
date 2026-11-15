// Soft light sources drifting over the Ambient stage: pure aura language
// (DESIGN.md §9), no scenery. Each glow runs its own slow loop with its own
// period so they never sync. Two layouts: the tour's light wanders the whole
// screen; "top" gathers it in the upper half, for a screen that wears one
// colour (the item screen and its brand).

import { useEffect } from "react";
import { Dimensions } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;

/** One soft light source: drifts along its own slow loop and swells slightly. */
function Glow({
  size,
  color,
  peak,
  top,
  left,
  driftX,
  driftY,
  duration,
}: {
  size: number;
  color: string;
  /** Center-stop opacity: how strong the light reads. */
  peak: number;
  top: number;
  left: number;
  driftX: number;
  driftY: number;
  duration: number;
}) {
  const phase = useSharedValue(0);
  useEffect(() => {
    // Reanimated shared values are driven by assigning `.value`.
    phase.value = withRepeat(
      withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [phase, duration]);
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(phase.value, [0, 1], [0, driftX]) },
      { translateY: interpolate(phase.value, [0, 1], [0, driftY]) },
      { scale: 1 + phase.value * 0.12 },
    ],
  }));
  const gradientId = `glow-${top}-${left}`;
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", top, left }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={gradientId} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={peak} />
            <Stop offset="60%" stopColor={color} stopOpacity={peak * 0.3} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${gradientId})`} />
      </Svg>
    </Animated.View>
  );
}

/** Three unsynchronized glows: different sizes, periods and drift directions
 *  keep the light wandering without ever repeating visibly. */
export function LightField({ accent, weight }: { accent: string; weight?: "top" }) {
  if (weight === "top") {
    return (
      <>
        <Glow
          size={640}
          color={accent}
          peak={0.34}
          top={-300}
          left={SCREEN_WIDTH * 0.18}
          driftX={-90}
          driftY={50}
          duration={12000}
        />
        <Glow
          size={440}
          color={accent}
          peak={0.24}
          top={-120}
          left={-220}
          driftX={100}
          driftY={40}
          duration={17000}
        />
        <Glow
          size={340}
          color={accent}
          peak={0.14}
          top={SCREEN_HEIGHT * 0.12}
          left={SCREEN_WIDTH * 0.5}
          driftX={-70}
          driftY={-50}
          duration={10000}
        />
      </>
    );
  }
  return (
    <>
      <Glow
        size={560}
        color={accent}
        peak={0.3}
        top={-190}
        left={SCREEN_WIDTH * 0.4}
        driftX={-80}
        driftY={60}
        duration={11000}
      />
      <Glow
        size={400}
        color={accent}
        peak={0.18}
        top={SCREEN_HEIGHT * 0.42}
        left={-170}
        driftX={70}
        driftY={-90}
        duration={16000}
      />
      <Glow
        size={300}
        color={accent}
        peak={0.14}
        top={SCREEN_HEIGHT * 0.66}
        left={SCREEN_WIDTH * 0.55}
        driftX={-60}
        driftY={-70}
        duration={9000}
      />
    </>
  );
}
