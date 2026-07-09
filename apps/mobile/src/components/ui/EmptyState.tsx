// THE empty state (DESIGN.md §3.4): icon, title, hint, optional CTA — one
// shape for every list and screen that can be empty, replacing the six
// hand-rolled title+hint blocks the audit found. Positioning stays with the
// caller (centered screen, list ListEmptyComponent, ...) via `style`.

import { SymbolView } from "expo-symbols";
import { useMemo } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { spacing, typography, useTheme, type ThemeColors } from "../../theme";
import { Button, type ButtonVariant } from "./Button";

interface Props {
  /** SF Symbol drawn quiet and large above the title. */
  icon: string;
  title: string;
  hint?: string;
  /** The one way forward from here, when there is one. */
  cta?: { label: string; onPress: () => void; icon?: string; variant?: ButtonVariant };
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({ icon, title, hint, cta, style }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.container, style]}>
      <SymbolView name={icon as never} size={36} tintColor={colors.mutedText} />
      <Text style={styles.title}>{title}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {cta ? (
        <Button
          label={cta.label}
          onPress={cta.onPress}
          icon={cta.icon}
          variant={cta.variant ?? "primary"}
          style={styles.cta}
        />
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      alignItems: "center",
      gap: spacing.sm,
      padding: spacing.lg,
    },
    title: {
      ...typography.subtitle,
      fontWeight: "600",
      color: colors.text,
      textAlign: "center",
    },
    hint: {
      ...typography.body,
      color: colors.mutedText,
      textAlign: "center",
    },
    cta: {
      marginTop: spacing.sm,
    },
  });
}
