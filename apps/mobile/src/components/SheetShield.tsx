// The invisible full-screen touch-catcher behind every native action sheet
// (see lib/native-sheet.ts for why it exists). Rendered ONCE, last in the
// root layout so it covers every screen; it only mounts while a sheet is up
// and removes itself the instant it swallows the stray dismissing touch.

import { StyleSheet, View } from "react-native";

import { lowerSheetShield, useSheetShieldUp } from "../lib/native-sheet";

export function SheetShield() {
  const up = useSheetShieldUp();
  if (!up) return null;
  return (
    <View
      style={[StyleSheet.absoluteFill, styles.shield]}
      pointerEvents="auto"
      onTouchEnd={lowerSheetShield}
    />
  );
}

const styles = StyleSheet.create({
  // Transparent on purpose: the native sheet already dims the screen; this
  // layer exists only to eat touches, never to be seen.
  shield: { backgroundColor: "transparent", zIndex: 1000 },
});
