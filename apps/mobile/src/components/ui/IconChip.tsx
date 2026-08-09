// The saturated rounded square with a white glyph — the system's own visual
// language for settings-style lists (§9d). ONE implementation; the color
// maps in each screen must draw from the iOS LIGHT-tier hexes (#007AFF,
// #34C759, #FF9500, #FF3B30, #5E5CE6, #8E8E93…) so a single list never
// mixes brightness tiers.

import { SymbolView } from "expo-symbols";
import { StyleSheet, View } from "react-native";

export function IconChip({ icon, color }: { icon: string; color: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: color }]}>
      <SymbolView name={icon as never} size={15} tintColor="#FFFFFF" />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    width: 29,
    height: 29,
    borderRadius: 6.5,
    alignItems: "center",
    justifyContent: "center",
  },
});
