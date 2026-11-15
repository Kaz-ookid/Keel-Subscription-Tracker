import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { SlideInDown } from "react-native-reanimated";

import { useGlass } from "../lib/glass";
import { radius, spacing, type ThemeColors, typography, useStyles } from "../theme";
import { Glass } from "./ui/Glass";

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** Typically a <Picker> (native iOS wheel) supplied by the caller. */
  children: ReactNode;
  /** The tray as an inset glass panel, like the system's half sheets
   *  (iOS 26 and later; opaque tray otherwise). */
  glass?: boolean;
}

/** Bottom-anchored sheet hosting a native wheel picker, with a "Done" bar —
 *  the classic iOS "tap field → wheel slides up" pattern. */
export function WheelSheet({ visible, title, onClose, children, glass }: Props) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const glassOn = useGlass() && glass === true;
  const body = (
    <>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={styles.done}>{t("common.done")}</Text>
        </Pressable>
      </View>
      {children}
    </>
  );
  return (
    // Fade the MODAL (the scrim) and slide only the tray: sliding the whole
    // modal made the backdrop rise as a visible rectangle.
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View
        entering={SlideInDown.duration(280)}
        style={glassOn ? styles.inset : styles.sheet}
      >
        {glassOn ? <Glass style={styles.glassTray}>{body}</Glass> : body}
      </Animated.View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.scrim,
    },
    // Opaque on purpose: the wheel is text you READ, and content scrolling
    // through a translucent tray made it murky.
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingBottom: spacing.xl,
    },
    // The glass tray floats clear of the screen edges, corners following
    // the display's.
    inset: { paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
    glassTray: { borderRadius: 36, overflow: "hidden", paddingBottom: spacing.lg },
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
