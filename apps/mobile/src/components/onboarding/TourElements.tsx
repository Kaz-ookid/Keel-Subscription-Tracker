// The tour pager's scroll-driven elements. Both read the pager's live offset
// directly, so they can never disagree with the page. Pane text styles are
// injected: the done/caught-up panes share them, and the screen stays their
// single source of truth.

import { Dimensions, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";

const SCREEN_WIDTH = Dimensions.get("window").width;

/** One tour pane whose text rides the scroll: the title and body slide and
 *  fade at slightly different speeds, so paging feels layered, not stamped. */
export function TourPane({
  index,
  scrollX,
  title,
  body,
  paneStyle,
  titleStyle,
  bodyStyle,
}: {
  index: number;
  scrollX: SharedValue<number>;
  title: string;
  body: string;
  paneStyle: StyleProp<ViewStyle>;
  titleStyle: StyleProp<TextStyle>;
  bodyStyle: StyleProp<TextStyle>;
}) {
  const range = [(index - 1) * SCREEN_WIDTH, index * SCREEN_WIDTH, (index + 1) * SCREEN_WIDTH];
  const titleRide = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, range, [0, 1, 0], Extrapolation.CLAMP),
    transform: [
      { translateX: interpolate(scrollX.value, range, [36, 0, -36], Extrapolation.CLAMP) },
    ],
  }));
  const bodyRide = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, range, [0, 1, 0], Extrapolation.CLAMP),
    transform: [
      { translateX: interpolate(scrollX.value, range, [64, 0, -64], Extrapolation.CLAMP) },
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
  scrollX,
  style,
}: {
  index: number;
  scrollX: SharedValue<number>;
  style: StyleProp<ViewStyle>;
}) {
  const range = [(index - 1) * SCREEN_WIDTH, index * SCREEN_WIDTH, (index + 1) * SCREEN_WIDTH];
  const ride = useAnimatedStyle(() => ({
    width: interpolate(scrollX.value, range, [8, 22, 8], Extrapolation.CLAMP),
    opacity: interpolate(scrollX.value, range, [0.35, 1, 0.35], Extrapolation.CLAMP),
  }));
  return <Animated.View style={[style, ride]} />;
}
