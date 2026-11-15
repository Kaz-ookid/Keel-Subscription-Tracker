// A quiet one-time offer: an icon, a title, one sentence, a small button and
// an optional ✕. The look only; the caller decides when it shows and what
// retires it (Payments' Face ID card via onboarding/LockNudge, Settings'
// "Discover Keel").

import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";

import { radius, spacing, type ThemeColors, typography, useStyles, useTheme } from "../../theme";
import { Button } from "./Button";

interface Props {
  icon: SymbolViewProps["name"];
  title: string;
  body: string;
  cta: string;
  onPress: () => void;
  /** Adds a ✕ to the card: "not now". */
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function NudgeCard({ icon, title, body, cta, onPress, onDismiss, style }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  return (
    <View style={[styles.card, style]}>
      <SymbolView name={icon} size={24} tintColor={colors.accent} />
      <View style={styles.texts}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
      <Button size="sm" label={cta} onPress={onPress} />
      {onDismiss && (
        <Pressable accessibilityLabel={t("common.close")} hitSlop={8} onPress={onDismiss}>
          <SymbolView name="xmark" size={13} tintColor={colors.mutedText} />
        </Pressable>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.material,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.hairline,
      padding: spacing.md,
    },
    texts: { flex: 1, gap: 2 },
    title: { ...typography.label, color: colors.text },
    body: { ...typography.caption, color: colors.mutedText, lineHeight: 17 },
  });
}
