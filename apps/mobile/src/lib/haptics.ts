// The app's ENTIRE haptic vocabulary (DESIGN.md §3.6): a light tap when a
// payment is marked paid, a success note when an import batch lands. Two,
// no more — scarcity is what keeps them meaningful.

import * as Haptics from "expo-haptics";

export function hapticMarkPaid(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function hapticImportConfirm(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}
