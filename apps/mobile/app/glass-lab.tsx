// The glass lab (debug builds only, behind the debug drawer): the candidates
// of the Liquid Glass pass that can only be judged on a phone. Each block is
// one decision; the verdict shapes the next phase. Debug text, not
// translated.

import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { findNodeHandle, ScrollView, StyleSheet, Text, View } from "react-native";

import { DEBUG_TOOLS } from "../src/components/settings/DebugDrawer";
import { Button } from "../src/components/ui/Button";
import { GlassButton } from "../src/components/ui/GlassButton";
import { OptionWheel } from "../src/components/ui/OptionWheel";
import { ScreenTitle } from "../src/components/ui/ScreenTitle";
import { SegmentedPills } from "../src/components/ui/SegmentedPills";
import { useGlass } from "../src/lib/glass";
import { showNativeActionSheet } from "../src/lib/native-sheet";
import { spacing, type ThemeColors, typography, useStyles, useTheme } from "../src/theme";

const WHEEL = ["Weekly", "Monthly", "Every 2 months", "Quarterly", "Yearly"].map((label) => ({
  value: label,
  label,
}));
const PILLS = [
  { value: "a", label: "Upcoming" },
  { value: "b", label: "All" },
] as const;

export default function GlassLabScreen() {
  const router = useRouter();
  const { colors, scheme } = useTheme();
  const styles = useStyles(createStyles);
  const glass = useGlass();
  const [pill, setPill] = useState<"a" | "b">("a");
  const [wheel, setWheel] = useState(false);
  const [wheelValue, setWheelValue] = useState("Monthly");
  const sheetButton = useRef<View>(null);

  // A registered route is a deep link: the lab exists in debug builds only.
  if (!DEBUG_TOOLS) return null;
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <ScreenTitle>Glass lab</ScreenTitle>
      <Text style={styles.note}>
        {glass
          ? "Real Liquid Glass is on."
          : "Fallback: no Liquid Glass on this iOS, or the debug switch is on."}
      </Text>

      <Text style={styles.label}>1. Glass buttons over colour</Text>
      <View style={styles.strip}>
        <LinearGradient
          colors={[colors.accent, colors.tones.warning, colors.tones.success]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <GlassButton icon="xmark" accessibilityLabel="Close" onPress={() => {}} />
        <GlassButton icon="plus" tinted accessibilityLabel="Add" onPress={() => {}} />
        <GlassButton label="Add 3 items" tinted onPress={() => {}} />
      </View>

      <Text style={styles.label}>2. Pill switch: today, then on glass</Text>
      <SegmentedPills options={PILLS} value={pill} onChange={setPill} />
      <SegmentedPills options={PILLS} value={pill} onChange={setPill} glass />

      <Text style={styles.label}>3. Wheel on its tray</Text>
      <View style={styles.start}>
        <Button
          size="sm"
          variant="secondary"
          label="Open the wheel"
          onPress={() => setWheel(true)}
        />
      </View>

      <Text style={styles.label}>4. Action sheet from its button</Text>
      <View ref={sheetButton} collapsable={false} style={styles.start}>
        <Button
          size="sm"
          variant="secondary"
          label="Open the action sheet"
          onPress={() =>
            showNativeActionSheet(
              {
                options: ["Pause", "Delete", "Cancel"],
                destructiveButtonIndex: 1,
                cancelButtonIndex: 2,
                userInterfaceStyle: scheme,
                anchor: findNodeHandle(sheetButton.current) ?? undefined,
              },
              () => {},
            )
          }
        />
      </View>

      <Text style={styles.label}>5. Native large title</Text>
      <View style={styles.start}>
        <Button
          size="sm"
          variant="secondary"
          label="Open the test screen"
          onPress={() => router.push("/glass-lab-title")}
        />
      </View>

      <OptionWheel
        visible={wheel}
        title="Billing cycle"
        onClose={() => setWheel(false)}
        options={WHEEL}
        value={wheelValue}
        onChange={setWheelValue}
      />
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: "transparent" },
    content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
    note: { ...typography.caption, color: colors.mutedText },
    label: { ...typography.label, color: colors.text, paddingTop: spacing.sm },
    strip: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: 24,
      overflow: "hidden",
    },
    start: { alignSelf: "flex-start" },
  });
}
