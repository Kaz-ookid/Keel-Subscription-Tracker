// A light explainer popup: a rounded card that slides over a dimmed backdrop,
// closes on tap-outside or the ✕. For short helper content (tips, privacy
// notes) where the full-height page Sheet feels heavy. Content scrolls when
// taller than ~65% of the screen; padding is generous on purpose.

import { SymbolView } from "expo-symbols";
import { useMemo, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { radius, spacing, typography, useTheme, type ThemeColors } from "../theme";

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function InfoPopup({ visible, title, onClose, children }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Stop backdrop-press from closing when the card itself is tapped. */}
        <Pressable
          style={[styles.card, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <SymbolView name="xmark.circle.fill" size={24} tintColor={colors.mutedText} />
            </Pressable>
          </View>
          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(0,0,0,0.45)",
    },
    card: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingTop: spacing.lg,
      paddingHorizontal: spacing.lg,
      maxHeight: "72%",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
      paddingBottom: spacing.md,
    },
    title: {
      ...typography.subtitle,
      fontWeight: "700",
      color: colors.text,
      flexShrink: 1,
    },
    bodyScroll: { flexGrow: 0 },
    body: { paddingBottom: spacing.md, gap: spacing.md },
  });
}
