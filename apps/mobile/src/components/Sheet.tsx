import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, spacing, typography } from "../theme";

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** A secondary "card" window using the native iOS page sheet (stops short of the
 *  top — no full-screen claustrophobia). Used for category + colour pickers. */
export function Sheet({ visible, title, onClose, children }: Props) {
  return (
    <Modal
      visible={visible}
      presentationStyle="pageSheet"
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>
        <View style={styles.body}>{children}</View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: {
    ...typography.label,
    color: colors.text,
    fontSize: 17,
  },
  done: {
    ...typography.label,
    color: colors.navy,
  },
  body: {
    flex: 1,
  },
});
