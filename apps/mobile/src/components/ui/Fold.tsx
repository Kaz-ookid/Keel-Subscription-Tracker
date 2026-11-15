// THE way to reveal rows after a choice (a picker, a switch): the block's
// height and opacity animate, so what sits below slides instead of jumping.
// Self-contained: no `layout` prop on any sibling, unlike motion.ts's fold
// trio, which needs one on every view it displaces. The content stays
// mounted while shut, out of reach of touch and VoiceOver.

import { useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

interface Props {
  open: boolean;
  children: ReactNode;
}

export function Fold({ open, children }: Props) {
  // The content's natural height, known after its first layout.
  const [height, setHeight] = useState<number | null>(null);
  const progress = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    // Reanimated shared values are driven by assigning `.value`.
    progress.value = withTiming(open ? 1 : 0, { duration: 220 });
  }, [open, progress]);
  const animated = useAnimatedStyle(() => {
    // Before the first measure: natural height if open, nothing if shut.
    if (height === null) return open ? {} : { height: 0, opacity: 0 };
    return { height: height * progress.value, opacity: progress.value };
  }, [height, open]);

  return (
    <Animated.View
      style={[{ overflow: "hidden" }, animated]}
      pointerEvents={open ? "auto" : "none"}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? "auto" : "no-hide-descendants"}
    >
      {/* Keeps its natural height inside the clipped box (views do not
          shrink), so this layout IS the measure. An emptied block (a hint
          whose text went away) keeps its last height while it closes. */}
      <View
        onLayout={(e) => {
          const next = e.nativeEvent.layout.height;
          if (next > 0) setHeight(next);
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}
