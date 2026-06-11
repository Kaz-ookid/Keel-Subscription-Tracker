// The Add/Edit modal: pure composition. All state, derived values and submit
// logic live in useAddForm; the sections and sheets render the same `form`.

import { Stack } from "expo-router";
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AmountSection } from "../src/components/add-form/AmountSection";
import { DetailsSection, MetaSection } from "../src/components/add-form/DetailsSection";
import { FormSheets } from "../src/components/add-form/FormSheets";
import { ScheduleSection } from "../src/components/add-form/ScheduleSection";
import { useAddForm, type PlanType } from "../src/components/add-form/useAddForm";
import { radius, spacing, typography, useTheme, type ThemeColors } from "../src/theme";

const PLAN_TYPES: { value: PlanType; label: string }[] = [
  { value: "subscription", label: "Subscription" },
  { value: "installment", label: "Pay in X" },
];

export default function AddScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const form = useAddForm();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          title: form.isEditing ? "Edit" : "New subscription",
          headerRight: () => (
            <Pressable onPress={form.submit} disabled={!form.canSubmit} hitSlop={12}>
              <Text style={[styles.headerAction, !form.canSubmit && styles.headerActionDisabled]}>
                {form.isEditing ? "Save" : "Add"}
              </Text>
            </Pressable>
          ),
        }}
      />

      {!form.isEditing && (
        <View style={styles.modeSwitch}>
          {PLAN_TYPES.map((m) => {
            const active = form.planType === m.value;
            return (
              <Pressable
                key={m.value}
                onPress={() => form.setPlanType(m.value)}
                style={[styles.modePill, active && styles.modePillActive]}
              >
                <Text style={[styles.modeText, active && styles.modeTextActive]}>{m.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <AmountSection form={form} />
      <DetailsSection form={form} />
      <ScheduleSection form={form} />
      <MetaSection form={form} />
      <FormSheets form={form} />
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.md, paddingBottom: spacing.xl },
    modeSwitch: {
      flexDirection: "row",
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 3,
      gap: 3,
      marginBottom: spacing.md,
    },
    modePill: {
      flex: 1,
      alignItems: "center",
      paddingVertical: spacing.sm,
      borderRadius: radius.sm,
    },
    modePillActive: { backgroundColor: colors.navy },
    modeText: { ...typography.label, color: colors.mutedText },
    modeTextActive: { color: colors.white },
    headerAction: { ...typography.label, color: colors.white, paddingHorizontal: spacing.sm },
    headerActionDisabled: { opacity: 0.4 },
  });
}
