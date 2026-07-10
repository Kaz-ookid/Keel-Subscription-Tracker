// The task-sheet close (window taxonomy, DESIGN.md §3.5): leaving lives top
// LEFT as an ✕ on every pageSheet modal, so the system back chevron never
// masquerades as navigation inside a task. Confirming stays top right.
//
// Both ride react-navigation's own HeaderBackButton, so they sit at the EXACT
// native position and size of every other screen's back chevron (the item
// screen's back button is the reference). The ✕ only swaps the glyph.

import { HeaderBackButton } from "@react-navigation/elements";
import { useRouter } from "expo-router";
import Svg, { Path } from "react-native-svg";

export function ModalClose() {
  const router = useRouter();
  return (
    <HeaderBackButton
      onPress={() => router.back()}
      tintColor="#FFFFFF"
      accessibilityLabel="Close"
      displayMode="minimal"
      backImage={({ tintColor }) => (
        <Svg width={24} height={24}>
          <Path
            d="M 7.5 7.5 L 16.5 16.5 M 16.5 7.5 L 7.5 16.5"
            stroke={tintColor}
            strokeWidth={2.4}
            strokeLinecap="round"
          />
        </Svg>
      )}
    />
  );
}

/** Header back to a previous PHASE inside the same sheet (e.g. the add
 *  chooser): the untouched native chevron, same metrics everywhere. */
export function ModalBack({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <HeaderBackButton
      onPress={onPress}
      tintColor="#FFFFFF"
      accessibilityLabel={label}
      displayMode="minimal"
    />
  );
}
