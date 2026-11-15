// Glass lab, candidate 5: the system's own large title. Does it draw, and
// does it shrink into the bar when the list scrolls? In 2026-07 it rendered
// an empty band, which is why every screen draws its title in the content
// (ui/ScreenTitle). Debug text, not translated.

import { ScrollView, StyleSheet, Text } from "react-native";

import { DEBUG_TOOLS } from "../src/components/settings/DebugDrawer";
import { Card } from "../src/components/ui/Card";
import { spacing, type ThemeColors, typography, useStyles } from "../src/theme";

const ROWS = Array.from({ length: 30 }, (_, i) => `Row ${i + 1}`);

export default function GlassLabTitleScreen() {
  const styles = useStyles(createStyles);
  if (!DEBUG_TOOLS) return null;
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Card>
        {ROWS.map((row) => (
          <Text key={row} style={styles.row}>
            {row}
          </Text>
        ))}
      </Card>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: "transparent" },
    content: { padding: spacing.md, paddingBottom: spacing.xl },
    row: { ...typography.body, color: colors.text, paddingVertical: spacing.sm + 2 },
  });
}
