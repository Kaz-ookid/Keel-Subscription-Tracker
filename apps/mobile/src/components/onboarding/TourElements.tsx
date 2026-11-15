// The tour pager's scroll-driven elements. Both read the pager's live
// position (ui/usePager's `progress`, in pages), so they can never disagree
// with the page.

import { View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";

/** One tour pane whose text rides the scroll: the title and body slide and
 *  fade at slightly different speeds, so paging feels layered, not stamped. */
export function TourPane({
  index,
  progress,
  title,
  body,
  paneStyle,
  titleStyle,
  bodyStyle,
}: {
  index: number;
  progress: SharedValue<number>;
  title: string;
  body: string;
  paneStyle: StyleProp<ViewStyle>;
  titleStyle: StyleProp<TextStyle>;
  bodyStyle: StyleProp<TextStyle>;
}) {
  const range = [index - 1, index, index + 1];
  const titleRide = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, range, [0, 1, 0], Extrapolation.CLAMP),
    transform: [
      { translateX: interpolate(progress.value, range, [36, 0, -36], Extrapolation.CLAMP) },
    ],
  }));
  const bodyRide = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, range, [0, 1, 0], Extrapolation.CLAMP),
    transform: [
      { translateX: interpolate(progress.value, range, [64, 0, -64], Extrapolation.CLAMP) },
    ],
  }));
  return (
    <View style={paneStyle}>
      <Animated.Text style={[titleStyle, titleRide]}>{title}</Animated.Text>
      <Animated.Text style={[bodyStyle, bodyRide]}>{body}</Animated.Text>
    </View>
  );
}

/** A dot that morphs into a pill as its pane arrives. */
export function Dot({
  index,
  progress,
  style,
}: {
  index: number;
  progress: SharedValue<number>;
  style: StyleProp<ViewStyle>;
}) {
  const range = [index - 1, index, index + 1];
  const ride = useAnimatedStyle(() => ({
    width: interpolate(progress.value, range, [8, 22, 8], Extrapolation.CLAMP),
    opacity: interpolate(progress.value, range, [0.35, 1, 0.35], Extrapolation.CLAMP),
  }));
  return <Animated.View style={[style, ride]} />;
}
