import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { spacing, typography, useTheme, type ThemeColors } from "../theme";

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** The header button's text; defaults to "Done" (pickers that keep state).
   *  Pass "Close" for act-on-tap lists where nothing is being confirmed. */
  closeLabel?: string;
  children: ReactNode;
}

/** A secondary "card" window using the native iOS page sheet (stops short of the
 *  top — no full-screen claustrophobia). Used for category + colour pickers. */
export function Sheet({ visible, title, onClose, closeLabel, children }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
            <Text style={styles.done}>{closeLabel ?? t("common.done")}</Text>
          </Pressable>
        </View>
        <View style={styles.body}>{children}</View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
      borderBottomColor: colors.hairline,
    },
    title: {
      ...typography.label,
      color: colors.text,
      fontSize: 17,
    },
    done: {
      ...typography.label,
      color: colors.accent,
    },
    body: {
      flex: 1,
    },
  });
}
