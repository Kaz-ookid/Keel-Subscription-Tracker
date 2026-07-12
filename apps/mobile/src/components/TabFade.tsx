// The tab fade-through (§3.6), owned by the SCREEN instead of the navigator.
// The navigator switches instantly (animation "none"); whichever screen gains
// focus fades itself in. The navigator's own fade left scenes stuck invisible
// when a transition was interrupted; here every focus RESTARTS the fade from
// scratch, so there is no cross-screen animation state to corrupt — a screen
// can never be stuck at opacity 0 while focused.

import { useIsFocused } from "@react-navigation/native";
import { useEffect, type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

interface Props {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

export function TabFade({ style, children }: Props) {
  const focused = useIsFocused();
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!focused) return;
    // Reanimated shared values are driven by assigning `.value`.
    opacity.value = 0;
    opacity.value = withTiming(1, { duration: 150 });
  }, [focused, opacity]);

  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[style, fade]}>{children}</Animated.View>;
}
