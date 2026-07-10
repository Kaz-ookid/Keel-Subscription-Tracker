// The task-sheet close (window taxonomy, DESIGN.md §3.5): leaving lives top
// LEFT as an ✕ on every pageSheet modal, so the system back chevron never
// masquerades as navigation inside a task. Confirming stays top right.
//
// Both glyphs sit in a tinted CIRCLE (the iOS sheet-control pattern): flexbox
// centers the symbol on the circle's exact geometric center, so there is no
// optical nudging to get wrong — the circle itself is the visual reference.

import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Pressable, StyleSheet } from "react-native";

export function ModalClose() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.back()}
      hitSlop={10}
      accessibilityLabel="Close"
      style={styles.circle}
    >
      <SymbolView name="xmark" size={13} weight="semibold" tintColor="#FFFFFF" />
    </Pressable>
  );
}

/** Header back to a previous PHASE inside the same sheet (e.g. the add
 *  chooser). Same circle as the ✕ so the two share one geometry. */
export function ModalBack({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityLabel={label} style={styles.circle}>
      {/* SF chevrons carry their optical compensation inside the glyph box,
          so plain centering is correct here too. */}
      <SymbolView name="chevron.left" size={13} weight="semibold" tintColor="#FFFFFF" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    // Headers are navy in both schemes; a soft white wash draws the circle.
    backgroundColor: "rgba(255,255,255,0.16)",
  },
});
