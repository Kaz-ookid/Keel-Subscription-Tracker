// The AI surfaces' centered notice card: a symbol (or a spinner while a
// probe runs), a title, a short body, and whatever links or buttons the
// caller adds. Consent, offline, unavailable and checking states all share
// this one card so they never drift apart again.

import { SymbolView } from "expo-symbols";
import type { ComponentProps, ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { radius, spacing, typography, useStyles, useTheme, type ThemeColors } from "../../theme";

export function AiNotice({
  icon,
  tint,
  title,
  body,
  busy,
  children,
}: {
  icon?: ComponentProps<typeof SymbolView>["name"];
  tint?: string;
  title?: string;
  body?: string;
  /** A probe in flight: a spinner instead of the symbol. */
  busy?: boolean;
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  return (
    <View style={styles.card}>
      {busy ? (
        <ActivityIndicator color={colors.accent} />
      ) : icon ? (
        <SymbolView name={icon} size={28} tintColor={tint ?? colors.accent} />
      ) : null}
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {children}
    </View>
  );
}

/** The quiet accent link that sits under a notice's body. */
export function AiNoticeLink({ label, onPress }: { label: string; onPress: () => void }) {
  const styles = useStyles(createStyles);
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.material,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: radius.xl,
      padding: spacing.xl,
      marginTop: spacing.md,
    },
    title: { ...typography.label, color: colors.text, textAlign: "center" },
    body: { ...typography.caption, color: colors.mutedText, textAlign: "center", lineHeight: 18 },
    link: { ...typography.caption, fontWeight: "600", color: colors.accent },
  });
}
