// THE way to reveal rows after a choice (a picker, a switch): the block's
// height and opacity animate, so what sits below slides instead of jumping.
// Self-contained: no `layout` prop on any sibling, unlike motion.ts's fold
// trio, which needs one on every view it displaces. The content stays
// mounted while shut, out of reach of touch and VoiceOver.

import { useEffect, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

interface Props {
  open: boolean;
  children: ReactNode;
}

export function Fold({ open, children }: Props) {
  // The content's natural height, known after its first layout.
  const height = useSharedValue(0);
  const progress = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    // Reanimated shared values are driven by assigning `.value`.
    progress.value = withTiming(open ? 1 : 0, { duration: 220 });
  }, [open, progress]);
  const animated = useAnimatedStyle(() => ({
    height: height.value * progress.value,
    opacity: progress.value,
  }));

  return (
    <Animated.View
      style={[styles.box, animated]}
      pointerEvents={open ? "auto" : "none"}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? "auto" : "no-hide-descendants"}
    >
      {/* Out of the flow, so the content always has its OWN height. Laid out
          inside the animated box it was squeezed as the box shrank: texts
          collapsed to nothing while icons kept their size, and the squeezed
          height was measured as the natural one (build 29 reopened rows
          empty that way). */}
      <View
        style={styles.content}
        onLayout={(e) => {
          // An emptied block (a hint whose text went away) keeps its last
          // height while it closes.
          const next = e.nativeEvent.layout.height;
          if (next > 0) height.value = next;
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: "hidden" },
  content: { position: "absolute", top: 0, left: 0, right: 0 },
});
