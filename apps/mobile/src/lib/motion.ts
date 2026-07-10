// Shared micro-motion helpers (DESIGN.md §3.6). `animateFold` wraps the next
// layout change (a fold opening, a row appearing) in the standard 250ms
// ease — call it right before the setState that changes layout, so lists
// never just pop.

import { LayoutAnimation } from "react-native";

export function animateFold(): void {
  LayoutAnimation.configureNext(
    LayoutAnimation.create(
      250,
      LayoutAnimation.Types.easeInEaseOut,
      LayoutAnimation.Properties.opacity,
    ),
  );
}
