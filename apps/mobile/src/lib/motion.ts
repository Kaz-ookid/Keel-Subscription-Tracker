// Shared micro-motion helpers (DESIGN.md §3.6). A fold is an accordion: the
// container grows/shrinks through `foldLayout` (put it on the expanding view
// AND on every sibling it pushes around, or those siblings jump) while the
// revealed rows fade through `foldIn`/`foldOut`. All of it lives in
// reanimated: RN's LayoutAnimation is a silent no-op on the New Architecture,
// which is why earlier folds never animated on device.

import { useEffect } from "react";
import {
  FadeIn,
  FadeOut,
  LinearTransition,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

/** Height/position change of a fold and of the content it displaces. */
export const foldLayout = LinearTransition.duration(220);

/** The revealed rows: a quiet fade, no directional slide (a slide fights the
 *  grow and reads as content moving the wrong way). */
export const foldIn = FadeIn.duration(180);
export const foldOut = FadeOut.duration(120);

/** 0 to 1 as a control becomes selected. Chips and pill pickers drive their
 *  fill, contour and label from it, so a selection crossfades instead of
 *  snapping (rows it reveals open through ui/Fold). */
export function useSelectionProgress(selected: boolean): SharedValue<number> {
  const progress = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    // Reanimated shared values are driven by assigning `.value`.
    progress.value = withTiming(selected ? 1 : 0, { duration: 180 });
  }, [selected, progress]);
  return progress;
}
