// A small (i) that explains a confusing field. Self-contained: tap it and it
// opens its own InfoPopup (the one shape all informative content shares,
// DESIGN.md §3.5) with a short, calm explanation. Drop it right after a
// field's label; it stays quiet until asked.

import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { type ThemeColors, typography, useStyles, useTheme } from "../theme";
import { InfoPopup } from "./InfoPopup";

interface Props {
  title: string;
  body: string;
  /** Accessibility label; defaults to the title. */
  a11yLabel?: string;
}

export function InfoDot({ title, body, a11yLabel }: Props) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel ?? title}
      >
        <SymbolView name="info.circle" size={15} tintColor={colors.mutedText} />
      </Pressable>
      <InfoPopup visible={open} title={title} onClose={() => setOpen(false)}>
        <Text style={styles.body}>{body}</Text>
      </InfoPopup>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    body: { ...typography.body, color: colors.text, lineHeight: 23 },
  });
}
