// The task-sheet leave affordance, top LEFT on every sheet screen that has
// no real screen behind it (user decision, dogfood round 11: one chevron
// everywhere, no ✕). It mimics the system back glyph: a BARE chevron with
// symmetric bounds — iOS wraps custom header buttons in its own circular
// chrome and centers bare content itself, exactly like the native chevron.
// Where a real screen IS behind (chooser → form/import), navigation provides
// the genuine system back button and this component stays out of it.

import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import Svg, { Path } from "react-native-svg";

export function ModalClose() {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close">
      {/* Drawn to the SYSTEM back glyph's metrics (≈9pt wide, 17pt tall
          strokes at 3pt weight in a symmetric box) so it reads identical to
          the native chevron on the pushed screens. */}
      <Svg width={12} height={22}>
        <Path
          d="M 10.5 2.5 L 1.5 11 L 10.5 19.5"
          stroke="#FFFFFF"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </Pressable>
  );
}
