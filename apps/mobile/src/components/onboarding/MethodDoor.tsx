// One door on the onboarding method step: icon, title, a one-line pitch, and
// a chevron. The doors are the step; each just points somewhere else.

import { SymbolView } from "expo-symbols";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { radius, spacing, type ThemeColors, typography, useStyles, useTheme } from "../../theme";

interface Props {
  icon: string;
  title: string;
  sub: string;
  onPress: () => void;
}

export function MethodDoor({ icon, title, sub, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <SymbolView name={icon as never} size={24} tintColor={colors.accent} />
      <View style={styles.texts}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>{sub}</Text>
      </View>
      <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: colors.material,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.hairline,
      padding: spacing.md,
    },
    texts: { flex: 1, gap: 2 },
    title: { ...typography.label, color: colors.text, fontSize: 17 },
    sub: { ...typography.caption, color: colors.mutedText, lineHeight: 18 },
  });
}
