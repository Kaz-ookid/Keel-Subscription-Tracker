// The app's ENTIRE haptic vocabulary (DESIGN.md §3.6): four notes, no more —
// scarcity is what keeps them meaningful.
//   markPaid       a light tap when a payment is ticked off
//   importConfirm  a success note when an import batch lands
//   selection      the picker tick when a segmented control switches
//   hold           a firm tap when a press-and-hold opens an editor

import * as Haptics from "expo-haptics";

export function hapticMarkPaid(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function hapticImportConfirm(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export function hapticSelection(): void {
  void Haptics.selectionAsync();
}

export function hapticHold(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}
