// The task-sheet close (window taxonomy, DESIGN.md §3.5): leaving lives top
// LEFT as an ✕ on every pageSheet modal, so the system back chevron never
// masquerades as navigation inside a task. Confirming stays top right. The
// fixed box keeps the glyph optically centered in the header slot.

import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Pressable, StyleSheet } from "react-native";

export function ModalClose() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.back()}
      hitSlop={12}
      accessibilityLabel="Close"
      style={styles.box}
    >
      <SymbolView name="xmark" size={17} tintColor="#FFFFFF" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    // iOS places headerLeft tight to the edge; nudge into the title's optical
    // column so the glyph doesn't read as hugging the border.
    marginLeft: 6,
  },
});
