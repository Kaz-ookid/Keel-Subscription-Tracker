// The task-sheet close (window taxonomy, DESIGN.md §3.5): leaving lives top
// LEFT as an ✕ on every pageSheet modal, so the system back chevron never
// masquerades as navigation inside a task. Confirming stays top right.
//
// Both glyphs are drawn as SVG strokes at exact coordinates inside a fixed
// 28pt box: the ✕ crosses at (14,14), the chevron's bounds straddle x=14.
// No font metrics, no background shape, nothing left to optically drift.

import { useRouter } from "expo-router";
import { Pressable, StyleSheet } from "react-native";
import Svg, { Path } from "react-native-svg";

export function ModalClose() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.back()}
      hitSlop={12}
      accessibilityLabel="Close"
      style={styles.box}
    >
      <Svg width={28} height={28}>
        <Path
          d="M 9.5 9.5 L 18.5 18.5 M 18.5 9.5 L 9.5 18.5"
          stroke="#FFFFFF"
          strokeWidth={2.2}
          strokeLinecap="round"
        />
      </Svg>
    </Pressable>
  );
}

/** Header back to a previous PHASE inside the same sheet (e.g. the add
 *  chooser). Same box and stroke as the ✕ so the two share one geometry. */
export function ModalBack({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={12} accessibilityLabel={label} style={styles.box}>
      <Svg width={28} height={28}>
        <Path
          d="M 16.5 7.5 L 11.5 14 L 16.5 20.5"
          stroke="#FFFFFF"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
});
