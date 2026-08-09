import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { radius, spacing, typography, useTheme, type ThemeColors } from "../theme";

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** Typically a <Picker> (native iOS wheel) supplied by the caller. */
  children: ReactNode;
}

/** Bottom-anchored sheet hosting a native wheel picker, with a "Done" bar —
 *  the classic iOS "tap field → wheel slides up" pattern. */
export function WheelSheet({ visible, title, onClose, children }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.done}>{t("common.done")}</Text>
          </Pressable>
        </View>
        {children}
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.scrim,
    },
    sheet: {
      backgroundColor: colors.materialStrong,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingBottom: spacing.xl,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.hairline,
    },
    title: {
      ...typography.label,
      color: colors.text,
    },
    done: {
      ...typography.label,
      color: colors.accent,
    },
  });
}
