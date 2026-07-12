// A slow light sweep across a glass surface: the "quietly premium" shimmer
// for the Full Keel card. One soft diagonal band glides through, rests, and
// comes back; parents must clip (overflow hidden). Aura language, subtle by
// construction: low opacity, long period.

import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";

import { withAlpha } from "../../theme";

interface Props {
  /** The clipped parent's width; the band travels edge to edge. */
  width: number;
  color: string;
  /** Band strength at its core. */
  opacity?: number;
}

export function Sheen({ width, color, opacity = 0.16 }: Props) {
  const phase = useSharedValue(0);
  useEffect(() => {
    // Reanimated shared values are driven by assigning `.value`.
    phase.value = withRepeat(
      withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
  }, [phase]);

  const sweep = useAnimatedStyle(() => {
    // The rotated band's corners reach far past its own width, so the rest
    // positions scale with the parent and the band FADES OUT while parked:
    // it can never be caught waiting inside the card.
    const start = -(width * 0.6 + 180);
    const end = width + 180;
    return {
      opacity: interpolate(phase.value, [0, 0.12, 0.22, 0.68, 0.78, 1], [0, 0, 1, 1, 0, 0]),
      transform: [
        {
          translateX: interpolate(phase.value, [0, 0.12, 0.78, 1], [start, start, end, end]),
        },
        { rotate: "16deg" },
      ],
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.band, sweep]}>
      <LinearGradient
        colors={["transparent", withAlpha(color, opacity), "transparent"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  band: {
    position: "absolute",
    top: -40,
    bottom: -40,
    width: 120,
  },
});
