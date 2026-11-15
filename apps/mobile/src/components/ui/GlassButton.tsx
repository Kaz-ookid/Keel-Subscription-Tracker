// A button that floats over content: a glass circle (icon only) or capsule
// (with a label), built on ui/Glass. `tinted` is for the screen's one primary
// action. In a native header use Stack.Toolbar instead: the system draws
// that glass itself. Buttons that sit IN content stay ui/Button.

import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

import { contrastText, spacing, typography, useTheme } from "../../theme";
import { Glass } from "./Glass";

interface Props {
  icon?: SymbolViewProps["name"];
  label?: string;
  onPress: () => void;
  tinted?: boolean;
  /** The tall capsule of a screen's floating confirm. */
  large?: boolean;
  disabled?: boolean;
  /** Required for an icon-only button. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

// Apple's minimum hit target.
const SIZE = 44;

export function GlassButton({
  icon,
  label,
  onPress,
  tinted,
  large,
  disabled,
  accessibilityLabel,
  style,
}: Props) {
  const { colors } = useTheme();
  const ink = tinted ? contrastText(colors.accent) : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[disabled && styles.disabled, style]}
    >
      <Glass
        interactive
        tint={tinted ? colors.accent : undefined}
        style={[styles.glass, label !== undefined && styles.capsule, large && styles.large]}
      >
        {icon !== undefined && <SymbolView name={icon} size={18} tintColor={ink} />}
        {label !== undefined && (
          <Text style={[styles.label, { color: ink }]} numberOfLines={1}>
            {label}
          </Text>
        )}
      </Glass>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  glass: {
    minWidth: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  capsule: { paddingHorizontal: spacing.md },
  large: { height: 52, borderRadius: 26 },
  label: { ...typography.label },
  disabled: { opacity: 0.4 },
});
