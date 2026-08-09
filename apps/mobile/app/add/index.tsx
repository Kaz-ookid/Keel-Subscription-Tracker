// The Add chooser: pick from the brand bank (pre-fills name, category, brand
// color, logo, cadence), create your own (the bank's first row, or the
// "Create ‹typed name›" row while searching), or hand the batch to the AI
// import. Picking pushes /add/form — a real navigation, so the form's back
// button is the system's own.

import { SUGGESTED_COMMITMENTS } from "@keel/core";
import { Stack, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ModalClose } from "../../src/components/ModalClose";
import { SuggestionPicker } from "../../src/components/SuggestionPicker";
import { useAiHidden } from "../../src/lib/ai-visibility";
import { useAppData } from "../../src/state/app-state";
import { radius, spacing, typography, useTheme, type ThemeColors } from "../../src/theme";

export default function AddChooserScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items } = useAppData();
  const aiHidden = useAiHidden();

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
      <Stack.Screen options={{ headerLeft: () => <ModalClose /> }} />
      {/* The quiet just-in-time discovery of the AI import (§6.1) — Settings
          stays its deliberate home. Gone entirely under the AI lock. */}
      {!aiHidden && (
        <Pressable style={styles.customRow} onPress={() => router.push("/add/import")}>
          <SymbolView name="sparkles" size={16} tintColor={colors.accent} />
          <Text style={styles.customText}>{t("add.importAI")}</Text>
          <Text style={styles.customHint}>{t("add.importAIHint")}</Text>
        </Pressable>
      )}
      {/* The second door: the browse picker in queue mode — tap many services
          now, fill in the details whenever (they wait under All). */}
      <Pressable
        style={[styles.customRow, styles.secondRow]}
        onPress={() => router.push({ pathname: "/onboarding", params: { mode: "browse" } })}
      >
        <SymbolView name="rectangle.stack.badge.plus" size={16} tintColor={colors.accent} />
        <Text style={styles.customText}>{t("add.todoDoor")}</Text>
        <Text style={styles.customHint}>{t("add.todoDoorHint")}</Text>
      </Pressable>
      <Text style={styles.orPick}>{t("add.orPick")}</Text>
      {/* "Start from scratch" lives INSIDE the bank now: a persistent New
          subscription first row, and a Create ‹typed name› row while
          searching — the beta lesson was that a separate door above didn't
          answer "what if mine isn't in the list?" at the moment it's asked. */}
      <SuggestionPicker
        suggestions={SUGGESTED_COMMITMENTS}
        addedIds={addedIds}
        onPick={(s) => router.push({ pathname: "/add/form", params: { pick: s.id } })}
        onCreate={(name) => router.push({ pathname: "/add/form", params: name ? { name } : {} })}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    customRow: {
      flexDirection: "row",
      alignItems: "center",
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
    secondRow: {
      marginTop: 0,
    },
    // Breathing room on both sides: it separates the doors above from the
    // bank's search field below instead of sticking to either.
    orPick: {
      ...typography.caption,
      fontWeight: "600",
      color: colors.mutedText,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
    },
  });
}
