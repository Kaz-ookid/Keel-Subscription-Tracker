// The Add/Edit form. Pure composition: all state, derived values and submit
// logic live in useAddForm; the sections and sheets render the same `form`.
// Reached two ways: pushed from the chooser (the system back button returns
// there) or directly with id/suggestionId/draftId params (edit, To-complete,
// AI drafts) — then the ✕ closes the whole sheet, since there is no chooser.

import { SUGGESTED_COMMITMENTS } from "@keel/core";
import { useNavigation, usePreventRemove } from "@react-navigation/native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

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
import { SegmentedPills } from "../../src/components/ui/SegmentedPills";
import { spacing, typography, useTheme, type ThemeColors } from "../../src/theme";

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

  // Leaving a dirty form (✕ or back) asks first; saving passes through via
  // the bypass. The sheet's swipe-down can't be intercepted from a nested
  // screen, so while dirty it's disabled on the hosting modal instead.
  const navigation = useNavigation();
  usePreventRemove(form.isDirty, ({ data }) => {
    if (form.guardBypass.current) {
      navigation.dispatch(data.action);
      return;
    }
    Alert.alert(t("add.discardTitle"), undefined, [
      { text: t("add.keepEditing"), style: "cancel" },
      {
        text: t("add.discard"),
        style: "destructive",
        onPress: () => navigation.dispatch(data.action),
      },
    ]);
  });
  useEffect(() => {
    const parent = navigation.getParent();
    parent?.setOptions({ gestureEnabled: !form.isDirty });
    return () => parent?.setOptions({ gestureEnabled: true });
  }, [navigation, form.isDirty]);

  return (
    <ScrollView
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
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
          {/* Same sliding wash as the Payments switcher, one shared piece. */}
          <SegmentedPills
            options={PLAN_TYPES.map((m) => ({ value: m.value, label: t(m.labelKey) }))}
            value={form.planType}
            onChange={form.setPlanType}
          />
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
    screen: { flex: 1, backgroundColor: "transparent" },
    content: { padding: spacing.md, paddingBottom: spacing.xl },
    modeSwitch: {
      marginBottom: spacing.md,
    },
    headerAction: { ...typography.label, color: colors.accent, paddingHorizontal: spacing.sm },
    headerActionDisabled: { opacity: 0.4 },
  });
}
