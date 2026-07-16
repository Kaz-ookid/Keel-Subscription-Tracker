// The tab fade-through (§3.6), owned by the SCREEN instead of the navigator.
// The navigator switches instantly (animation "none"); whichever screen gains
// focus fades itself in. The navigator's own fade left scenes stuck invisible
// when a transition was interrupted; here every focus RESTARTS the fade from
// scratch, so there is no cross-screen animation state to corrupt — a screen
// can never be stuck at opacity 0 while focused.
//
// Only a REAL tab change fades, though. A screen also regains focus when a
// modal or pushed screen above it closes — it was on screen the whole time,
// and restarting the fade there blanked the visible UI half a second after
// every dismiss. So the module remembers which tab held focus last: same tab
// again → snap to visible (no animation); a different tab → the fade-through.
// Both paths end at opacity 1, so the anti-stuck guarantee stands.

import { useIsFocused, useRoute } from "@react-navigation/native";
import { useEffect, type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

interface Props {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

// The one tab whose screen last held focus — shared across all TabFade
// instances (only the tab screens mount one).
let lastFocusedTab: string | null = null;

export function TabFade({ style, children }: Props) {
  const focused = useIsFocused();
  const { key } = useRoute();
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!focused) return;
    const tabChanged = lastFocusedTab !== key;
    lastFocusedTab = key;
    // Reanimated shared values are driven by assigning `.value`.
    if (tabChanged) {
      opacity.value = 0;
      opacity.value = withTiming(1, { duration: 150 });
    } else {
      // Focus came back from a modal/push above: already visible, stay put.
      opacity.value = 1;
    }
  }, [focused, key, opacity]);

  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[style, fade]}>{children}</Animated.View>;
}
