import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Modal, StyleSheet, Text, View } from "react-native";

import { spacing, type ThemeColors, typography, useStyles } from "../theme";
import { GlassButton } from "./ui/GlassButton";

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** What closing means, said to VoiceOver. Without it the sheet is a picker
   *  that keeps its state: the tinted checkmark on the right ("Done"). With
   *  it ("Close", "Cancel") nothing is being confirmed: the xmark on the
   *  left. Apple's placement: leaving on the leading side, confirming on the
   *  trailing one. */
  closeLabel?: string;
  children: ReactNode;
}

/** A secondary "card" window using the native iOS page sheet (stops short of the
 *  top — no full-screen claustrophobia). Used for category + colour pickers. */
export function Sheet({ visible, title, onClose, closeLabel, children }: Props) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  return (
    <Modal
      visible={visible}
      presentationStyle="pageSheet"
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          {/* Equal side slots keep the title centred whichever side holds
              the button. */}
          <View style={styles.side}>
            {closeLabel !== undefined && (
              <GlassButton icon="xmark" accessibilityLabel={closeLabel} onPress={onClose} />
            )}
          </View>
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {title}
          </Text>
          <View style={[styles.side, styles.sideEnd]}>
            {closeLabel === undefined && (
              <GlassButton
                icon="checkmark"
                tinted
                accessibilityLabel={t("common.done")}
                onPress={onClose}
              />
            )}
          </View>
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
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    side: { width: 44, alignItems: "flex-start" },
    sideEnd: { alignItems: "flex-end" },
    title: {
      ...typography.label,
      color: colors.text,
      fontSize: 17,
      flex: 1,
      textAlign: "center",
    },
    body: {
      flex: 1,
    },
  });
}
