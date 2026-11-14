// THE large screen title (DESIGN.md §9b): 34 pt bold, one line. A long
// translation shrinks to 70% before it is ever cut. It carries no padding of
// its own: most screens sit it inside their padded content; the ones that do
// not (Payments, Accounts) pass theirs through `style`.

import { type ReactNode } from "react";
import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";

import { type ThemeColors, useStyles } from "../../theme";

interface Props {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}

export function ScreenTitle({ children, style }: Props) {
  const styles = useStyles(createStyles);
  return (
    <Text
      style={[styles.title, style]}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
    >
      {children}
    </Text>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    title: { fontSize: 34, fontWeight: "700", color: colors.text },
  });
}
