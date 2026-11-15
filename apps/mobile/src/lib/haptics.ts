// The app's ENTIRE haptic vocabulary, by Apple's documented meanings ("Playing
// haptics" in the Human Interface Guidelines): few notes, one use each.
//   selection  a value changes under the finger: the pills, chips, pickers
//              and toggles Keel draws itself
//   markPaid   a light tap when a payment is ticked off
//   latch      a light tap when a swiped row snaps open
//   hold       a firm tap when a press-and-hold opens an editor
//   success    a task went through: an import landed, a purchase, a restore
//   error      a task was refused: a purchase or a restore that failed
// Nothing here for switches, wheels, the tab bar or alerts: the system plays
// its own there, and doubling it is the mistake Apple warns about.

import * as Haptics from "expo-haptics";

export function hapticSelection(): void {
  void Haptics.selectionAsync();
}

export function hapticMarkPaid(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function hapticLatch(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function hapticHold(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

export function hapticSuccess(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export function hapticError(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
}
