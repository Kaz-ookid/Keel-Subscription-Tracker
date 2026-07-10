// The Add/Edit modal. A fresh add starts on a chooser — pick from the brand
// bank (pre-fills name, category, brand color, logo, cadence) or start from
// scratch. Editing and the To-complete flow skip straight to the form. The
// form itself is pure composition: all state, derived values and submit logic
// live in useAddForm; the sections and sheets render the same `form`.

import { SUGGESTED_COMMITMENTS, type SuggestedCommitment } from "@keel/core";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { SlideInLeft, SlideInRight } from "react-native-reanimated";

import { AmountSection } from "../src/components/add-form/AmountSection";
import {
  DetailsSection,
  IdentityHeader,
  MetaSection,
} from "../src/components/add-form/DetailsSection";
import { FormSheets } from "../src/components/add-form/FormSheets";
import { ScheduleSection } from "../src/components/add-form/ScheduleSection";
import { useAddForm, type PlanType } from "../src/components/add-form/useAddForm";
import { ModalClose } from "../src/components/ModalClose";
import { SuggestionPicker } from "../src/components/SuggestionPicker";
import { useAppState } from "../src/state/app-state";
import { radius, spacing, typography, useTheme, type ThemeColors } from "../src/theme";

const PLAN_TYPES: { value: PlanType; labelKey: string }[] = [
  { value: "subscription", labelKey: "add.subscription" },
  { value: "installment", labelKey: "add.installment" },
];

export default function AddScreen() {
  const { id, suggestionId, draftId } = useLocalSearchParams<{
    id?: string;
    suggestionId?: string;
    draftId?: string;
  }>();
  // Editing, the To-complete flow and AI-import drafts arrive with the answer
  // already known.
  const direct = !!id || !!suggestionId || !!draftId;
  const [chosen, setChosen] = useState<SuggestedCommitment | undefined>(undefined);
  const [phase, setPhase] = useState<"choose" | "form">(direct ? "form" : "choose");
  // The modal's own slide-up covers the first mount; only PHASE swaps get the
  // lateral drill-in/out slides.
  const [navigated, setNavigated] = useState(false);

  if (phase === "choose") {
    return (
      <Animated.View
        style={flexStyles.flex}
        entering={navigated ? SlideInLeft.duration(250) : undefined}
      >
        <ChoosePhase
          onPick={(s) => {
            setNavigated(true);
            setChosen(s);
            setPhase("form");
          }}
          onCustom={() => {
            setNavigated(true);
            setChosen(undefined);
            setPhase("form");
          }}
        />
      </Animated.View>
    );
  }
  // Mounted only after the choice — the form hook initialises its state once.
  return (
    <Animated.View
      style={flexStyles.flex}
      entering={direct ? undefined : SlideInRight.duration(250)}
    >
      <FormPhase prefill={chosen} onBack={direct ? undefined : () => setPhase("choose")} />
    </Animated.View>
  );
}

const flexStyles = StyleSheet.create({ flex: { flex: 1 } });

/** The three doors in: type it from scratch, import a batch with AI, or pick
 *  a known brand below. Already-tracked names show greyed (no accidental
 *  duplicates); pending ones stay — saving clears them. */
function ChoosePhase({
  onPick,
  onCustom,
}: {
  onPick: (s: SuggestedCommitment) => void;
  onCustom: () => void;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items } = useAppState();

  // Tracked names show greyed rather than hidden — a missing Netflix reads
  // as a gap in the bank, a greyed one as "you already have it".
  const addedIds = useMemo(() => {
    const taken = new Set(items.map((i) => i.name.trim().toLowerCase()));
    return new Set(
      SUGGESTED_COMMITMENTS.filter((s) => taken.has(s.name.toLowerCase())).map((s) => s.id),
    );
  }, [items]);

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: t("titles.newCommitment"),
          headerLeft: () => <ModalClose />,
          headerRight: undefined,
        }}
      />
      <Pressable style={styles.customRow} onPress={onCustom}>
        <Text style={styles.customText}>{t("add.startScratch")}</Text>
        <Text style={styles.customHint}>{t("add.scratchHint")}</Text>
      </Pressable>
      {/* The quiet just-in-time discovery of the AI import (§6.1) — Settings
          stays its deliberate home. */}
      <Pressable style={[styles.customRow, styles.aiRow]} onPress={() => router.push("/import")}>
        <SymbolView name="sparkles" size={16} tintColor={colors.accent} />
        <Text style={styles.customText}>{t("add.importAI")}</Text>
        <Text style={styles.customHint}>{t("add.importAIHint")}</Text>
      </Pressable>
      <Text style={styles.orPick}>{t("add.orPick")}</Text>
      <SuggestionPicker suggestions={SUGGESTED_COMMITMENTS} addedIds={addedIds} onPick={onPick} />
    </View>
  );
}

function FormPhase({ prefill, onBack }: { prefill?: SuggestedCommitment; onBack?: () => void }) {
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
          // Reached from the chooser: LEFT goes BACK to it (a chevron). The ✕
          // only ever closes the whole task sheet, so it stays on direct
          // entries (edit, To-complete, AI drafts) where there is no chooser.
          headerLeft: onBack
            ? () => (
                <Pressable
                  onPress={onBack}
                  hitSlop={12}
                  accessibilityLabel={t("titles.newCommitment")}
                  style={styles.headerBack}
                >
                  <SymbolView name="chevron.left" size={17} tintColor={colors.white} />
                </Pressable>
              )
            : () => <ModalClose />,
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
    customRow: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      margin: spacing.md,
      marginBottom: spacing.sm,
    },
    customText: {
      ...typography.label,
      color: colors.text,
    },
    customHint: {
      ...typography.caption,
      color: colors.mutedText,
      flexShrink: 1,
    },
    aiRow: {
      marginTop: 0,
      alignItems: "center",
    },
    orPick: {
      ...typography.caption,
      fontWeight: "600",
      color: colors.mutedText,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xs,
    },
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
    headerAction: { ...typography.label, color: colors.white, paddingHorizontal: spacing.sm },
    headerActionDisabled: { opacity: 0.4 },
    headerBack: {
      width: 28,
      height: 28,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 6,
    },
  });
}
