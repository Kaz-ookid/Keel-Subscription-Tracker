// The Add/Edit form. Pure composition: all state, derived values and submit
// logic live in useAddForm; the sections and sheets render the same `form`.
// Reached two ways: pushed from the chooser (the system back button returns
// there) or directly with id/suggestionId/draftId params (edit, To-complete,
// AI drafts) — then the ✕ closes the whole sheet, since there is no chooser.

import { SUGGESTED_COMMITMENTS } from "@keel/core";
import { Stack, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AmountSection } from "../../src/components/add-form/AmountSection";
import {
  DetailsSection,
  IdentityHeader,
  MetaSection,
} from "../../src/components/add-form/DetailsSection";
import { FormSheets } from "../../src/components/add-form/FormSheets";
import { ScheduleSection } from "../../src/components/add-form/ScheduleSection";
import { useAddForm, type PlanType } from "../../src/components/add-form/useAddForm";
import { ModalClose } from "../../src/components/ModalClose";
import { radius, spacing, typography, useTheme, type ThemeColors } from "../../src/theme";

const PLAN_TYPES: { value: PlanType; labelKey: string }[] = [
  { value: "subscription", labelKey: "add.subscription" },
  { value: "installment", labelKey: "add.installment" },
];

export default function AddFormScreen() {
  const { id, suggestionId, draftId, pick } = useLocalSearchParams<{
    id?: string;
    suggestionId?: string;
    draftId?: string;
    /** A brand-bank pick made on the chooser, passed by id. */
    pick?: string;
  }>();
  const direct = !!id || !!suggestionId || !!draftId;
  const prefill = pick ? SUGGESTED_COMMITMENTS.find((s) => s.id === pick) : undefined;

  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const form = useAddForm(prefill);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen
        options={{
          title: form.isEditing || form.isDraft ? t("titles.edit") : t("titles.newSubscription"),
          // Direct entries are the sheet's first screen: the ✕ closes it.
          // From the chooser, the native back chevron appears on its own.
          ...(direct ? { headerLeft: () => <ModalClose /> } : {}),
          headerRight: () => (
            <Pressable onPress={form.submit} disabled={!form.canSubmit} hitSlop={12}>
              <Text style={[styles.headerAction, !form.canSubmit && styles.headerActionDisabled]}>
                {form.isEditing || form.isDraft ? t("common.save") : t("common.add")}
              </Text>
            </Pressable>
          ),
        }}
      />

      <IdentityHeader form={form} />

      {!form.isEditing && !form.isDraft && (
        <View style={styles.modeSwitch}>
          {PLAN_TYPES.map((m) => {
            const active = form.planType === m.value;
            return (
              <Pressable
                key={m.value}
                onPress={() => form.setPlanType(m.value)}
                style={[styles.modePill, active && styles.modePillActive]}
              >
                <Text style={[styles.modeText, active && styles.modeTextActive]}>
                  {t(m.labelKey)}
                </Text>
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
    modePillActive: { backgroundColor: colors.accentSoft },
    modeText: { ...typography.label, color: colors.mutedText },
    modeTextActive: { color: colors.accent },
    headerAction: { ...typography.label, color: colors.accent, paddingHorizontal: spacing.sm },
    headerActionDisabled: { opacity: 0.4 },
  });
}
