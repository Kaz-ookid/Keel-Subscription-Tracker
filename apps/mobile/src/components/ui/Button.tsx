// THE button (DESIGN.md §3.4). Two sizes, four variants, one look everywhere:
// this replaces the seven hand-rolled Pressable+Text pairs the audit found.
// primary = the action fill (navy by day, sea glass by night); secondary =
// outlined; quiet = text-only accent; destructive = text-only danger.

import { SymbolView } from "expo-symbols";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

import { radius, spacing, tones, typography, useTheme, type ThemeColors } from "../../theme";

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

  const container = [
    styles.base,
    size === "lg" ? styles.lg : styles.sm,
    styles[variant],
    disabled && styles.disabled,
    style,
  ];
  const textColor =
    variant === "primary"
      ? colors.actionText
      : variant === "secondary"
        ? colors.text
        : variant === "quiet"
          ? colors.accent
          : tones.danger;

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
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    sm: {
      borderRadius: radius.sm,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      gap: spacing.xs,
    },
    primary: { backgroundColor: colors.action },
    secondary: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    quiet: {},
    destructive: {},
    disabled: { opacity: 0.4 },
    textLg: { ...typography.label },
    textSm: { ...typography.caption, fontWeight: "600" },
  });
}
