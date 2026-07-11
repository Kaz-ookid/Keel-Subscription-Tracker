// THE button (DESIGN.md §3.4, re-cut for §9f). Two sizes, four variants, one
// look everywhere — and that look is Apple's TINTED capsule (iOS .bordered
// prominence): an accent wash with accent text, never a solid color block.
// primary = tinted capsule; secondary = material capsule with a hairline;
// quiet = text-only accent; destructive = text-only danger.

import { SymbolView } from "expo-symbols";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

import { spacing, typography, useTheme, withAlpha, type ThemeColors } from "../../theme";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "destructive";
export type ButtonSize = "lg" | "sm";

interface Props {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Optional leading SF Symbol. */
  icon?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "lg",
  icon,
  disabled,
  style,
  accessibilityLabel,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Press feedback (DESIGN.md §3.6): a slight settle, one look everywhere.
  const container = ({ pressed }: { pressed: boolean }) => [
    styles.base,
    size === "lg" ? styles.lg : styles.sm,
    styles[variant],
    disabled && styles.disabled,
    pressed && styles.pressed,
    style,
  ];
  const textColor =
    variant === "primary" || variant === "quiet"
      ? colors.accent
      : variant === "secondary"
        ? colors.text
        : colors.tones.danger;

  return (
    <Pressable
      style={container}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {icon ? (
        <SymbolView name={icon as never} size={size === "lg" ? 16 : 13} tintColor={textColor} />
      ) : null}
      <Text
        style={[size === "lg" ? styles.textLg : styles.textSm, { color: textColor }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    base: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
    },
    lg: {
      borderRadius: 999,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    sm: {
      borderRadius: 999,
      paddingVertical: spacing.xs + 1,
      paddingHorizontal: spacing.sm + 2,
      gap: spacing.xs,
    },
    primary: { backgroundColor: withAlpha(colors.accent, 0.18) },
    secondary: {
      borderWidth: 1,
      borderColor: colors.hairline,
      backgroundColor: colors.material,
    },
    quiet: {},
    destructive: {},
    disabled: { opacity: 0.4 },
    pressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
    textLg: { ...typography.label },
    textSm: { ...typography.caption, fontWeight: "600" },
  });
}
