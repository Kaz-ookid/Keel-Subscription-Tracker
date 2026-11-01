// Living numbers (§9g): the RN equivalent of SwiftUI's
// contentTransition(.numericText()). Each character lives in its own clipped
// cell; when a digit changes it rolls (old drops out, new drops in), and when
// the number gains or loses digits the cells collapse or grow while their
// neighbors slide into place — 204 becoming 24 merges exactly like Subo.
//
// Characters are keyed by their position FROM THE RIGHT, so the unchanging
// tail (units, decimals, currency) stays perfectly still while the head
// reshuffles. Digits render tabular so widths never wobble.

import { useMemo } from "react";
import { StyleSheet, View, type StyleProp, type TextStyle } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOutDown } from "react-native-reanimated";

interface Props {
  text: string;
  style?: StyleProp<TextStyle>;
}

// No layout transition on the cells: a width that animates while the text
// inside it changes sent the main thread into an endless mount-animate-
// mount loop on Fabric (the launch freeze of 2026-11-01, CPU reports from
// 2026-10-12 with the same stack). Digits still roll; cells now jump to
// their new width.
export function LivingNumber({ text, style }: Props) {
  const chars = useMemo(() => [...text], [text]);
  const n = chars.length;
  return (
    <View style={styles.row}>
      {chars.map((char, i) => {
        const posFromRight = n - 1 - i;
        return (
          <Animated.View key={posFromRight} entering={FadeIn.duration(180)} style={styles.cell}>
            <Animated.Text
              key={`${posFromRight}-${char}`}
              entering={FadeInDown.duration(200)}
              exiting={FadeOutDown.duration(160)}
              style={[style, styles.char]}
            >
              {char}
            </Animated.Text>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  // The roll stays inside its own little window.
  cell: {
    overflow: "hidden",
  },
  char: {
    fontVariant: ["tabular-nums"],
  },
});
