// Shared micro-motion helpers (DESIGN.md §3.6). A fold is an accordion: the
// container grows/shrinks through `foldLayout` (put it on the expanding view
// AND on every sibling it pushes around, or those siblings jump) while the
// revealed rows fade through `foldIn`/`foldOut`. All of it lives in
// reanimated: RN's LayoutAnimation is a silent no-op on the New Architecture,
// which is why earlier folds never animated on device.

import { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";

/** Height/position change of a fold and of the content it displaces. */
export const foldLayout = LinearTransition.duration(220);

/** The revealed rows: a quiet fade, no directional slide (a slide fights the
 *  grow and reads as content moving the wrong way). */
export const foldIn = FadeIn.duration(180);
export const foldOut = FadeOut.duration(120);
