// The assistant's mandatory review: every operation the model proposed is
// shown as before → after, destructive ones marked, each one excludable with
// a tap. Nothing is applied until the confirm, the whole batch lands through
// the store's applyAssistantPlan (which writes a safety backup first), and
// the action is recorded in the AI trace with a revert handle.

import {
  formatCalendarDate,
  formatMoney,
  isDestructiveOperation,
  type AssistantOperation,
  type AssistantUnresolved,
  type ImportDraft,
} from "@keel/core";
import { Stack, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HeroCard } from "../src/components/HeroCard";
import { Button } from "../src/components/ui/Button";
import { localizedRecurrence } from "../src/i18n/recurrence";
import { hapticImportConfirm } from "../src/lib/haptics";
import { useAppActions } from "../src/state/app-state";
import { useAssistantSession } from "../src/state/assistant-session";
import { radius, spacing, typography, useTheme, type ThemeColors } from "../src/theme";

const OP_LABEL_KEYS: Record<AssistantOperation["kind"], string> = {
  pause: "assistant.opPause",
  resume: "assistant.opResume",
  end: "assistant.opEnd",
  delete: "assistant.opDelete",
  rename: "assistant.opRename",
  set_amount: "assistant.opAmount",
  set_date: "assistant.opDate",
  set_account: "assistant.opAccount",
  mark_paid: "assistant.opMarkPaid",
  skip: "assistant.opSkip",
};

const UNRESOLVED_KEYS: Record<AssistantUnresolved["reason"], string> = {
  "item-not-found": "assistant.whyNotFound",
  "item-ambiguous": "assistant.whyAmbiguous",
  "account-not-found": "assistant.whyAccount",
  "not-supported": "assistant.whyNotSupported",
  "already-so": "assistant.whyAlready",
  "bad-value": "assistant.whyBadValue",
  "past-date": "assistant.whyPast",
  "unknown-op": "assistant.whyBadValue",
};

export default function AssistantReviewScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { plan, excluded, toggleExcluded, clear } = useAssistantSession();
  const { applyAssistantPlan } = useAppActions();

  const operations = plan?.operations ?? [];
  const additions = plan?.additions ?? [];
  const unresolved = plan?.unresolved ?? [];
  const includedOps = operations.filter((op) => !excluded.has(op.id));
  const includedAdditions = additions.filter((d) => !excluded.has(d.id));
  const includedCount = includedOps.length + includedAdditions.length;

  const confirm = () => {
    hapticImportConfirm();
    const result = applyAssistantPlan(includedOps, includedAdditions);
    clear();
    router.navigate("/");
    const applied = result.added + result.updated + result.removed;
    Alert.alert(
      t("assistant.appliedTitle"),
      `${t("assistant.appliedMsg", { count: applied })}${
        result.backupName ? ` ${t("assistant.backupNote")}` : ""
      }`,
    );
  };

  /** The one-line change description: before → after where it applies. */
  const detailLine = (op: AssistantOperation): string | null => {
    switch (op.kind) {
      case "rename":
        return `${op.item.name} → ${op.name}`;
      case "set_amount":
        return `${formatMoney(op.previous)} → ${formatMoney(op.amount)}`;
      case "set_date":
        return `${formatCalendarDate(op.previous)} → ${formatCalendarDate(op.date)}`;
      case "set_account":
        return `${op.previous ? op.previous.name : t("assistant.noAccount")} → ${op.account.name}`;
      case "pause":
        return t("assistant.opPauseSub");
      case "resume":
        return t("assistant.opResumeSub");
      case "end":
        return t("assistant.opEndSub");
      case "delete":
        return t("assistant.opDeleteSub");
      case "mark_paid":
        return t("assistant.opMarkPaidSub");
      case "skip":
        return t("assistant.opSkipSub");
    }
  };

  const additionLine = (draft: ImportDraft): string =>
    draft.kind === "subscription"
      ? `${formatMoney(draft.input.amount)} · ${localizedRecurrence(draft.input.recurrence)}`
      : t("importAI.splitLine", {
          total: formatMoney(draft.input.totalAmount),
          count: draft.input.numberOfInstallments,
        });

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: "" }} />
      <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
        <HeroCard
          label={t("assistant.reviewTitle")}
          amount={t("assistant.reviewHero", { count: includedCount })}
          sub={t("assistant.reviewHint")}
        />
        {plan?.note && <Text style={styles.note}>“{plan.note}”</Text>}

        {operations.map((op) => {
          const left = excluded.has(op.id);
          const destructive = isDestructiveOperation(op);
          return (
            <Pressable
              key={op.id}
              style={[styles.card, destructive && styles.cardDestructive, left && styles.cardLeft]}
              onPress={() => toggleExcluded(op.id)}
            >
              <View style={styles.middle}>
                <Text style={styles.opLabel}>
                  {t(OP_LABEL_KEYS[op.kind])}
                  {destructive ? ` · ${t("assistant.destructive")}` : ""}
                </Text>
                <Text style={styles.name} numberOfLines={1}>
                  {op.item.name}
                </Text>
                {detailLine(op) && <Text style={styles.sub}>{detailLine(op)}</Text>}
                {left && <Text style={styles.leftOut}>{t("assistant.excluded")}</Text>}
              </View>
              <SymbolView
                name={left ? "circle" : "checkmark.circle.fill"}
                size={22}
                tintColor={left ? colors.mutedText : colors.accent}
              />
            </Pressable>
          );
        })}

        {additions.map((draft) => {
          const left = excluded.has(draft.id);
          return (
            <Pressable
              key={draft.id}
              style={[styles.card, left && styles.cardLeft]}
              onPress={() => toggleExcluded(draft.id)}
            >
              <View style={styles.middle}>
                <Text style={styles.opLabel}>{t("assistant.opAdd")}</Text>
                <Text style={styles.name} numberOfLines={1}>
                  {draft.input.name}
                </Text>
                <Text style={styles.sub}>{additionLine(draft)}</Text>
                {left && <Text style={styles.leftOut}>{t("assistant.excluded")}</Text>}
              </View>
              <SymbolView
                name={left ? "circle" : "checkmark.circle.fill"}
                size={22}
                tintColor={left ? colors.mutedText : colors.accent}
              />
            </Pressable>
          );
        })}

        {unresolved.length > 0 && (
          <View style={styles.unresolvedCard}>
            <Text style={styles.unresolvedTitle}>{t("assistant.unresolvedTitle")}</Text>
            {unresolved.map((entry, i) => (
              <Text key={`${entry.op}-${i}`} style={styles.unresolvedLine}>
                ⚠{" "}
                {t(UNRESOLVED_KEYS[entry.reason], {
                  name: entry.itemName ?? entry.op,
                })}
              </Text>
            ))}
          </View>
        )}

        {operations.length === 0 && additions.length === 0 && (
          <Text style={styles.empty}>{t("assistant.emptyPlan")}</Text>
        )}
      </ScrollView>

      {includedCount > 0 && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <Button label={t("assistant.apply", { count: includedCount })} onPress={confirm} />
        </View>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: "transparent" },
    content: { padding: spacing.md, paddingBottom: spacing.xl * 2, gap: spacing.sm },
    note: { ...typography.caption, color: colors.mutedText, fontStyle: "italic" },
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.material,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    cardDestructive: {
      borderLeftWidth: 3,
      borderLeftColor: colors.tones.danger,
    },
    cardLeft: { opacity: 0.45 },
    middle: { flex: 1, gap: 2 },
    opLabel: { ...typography.micro, color: colors.mutedText },
    name: { ...typography.label, color: colors.text },
    sub: { ...typography.caption, color: colors.mutedText },
    leftOut: { ...typography.caption, color: colors.tones.warning },
    unresolvedCard: {
      backgroundColor: colors.material,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.xs,
    },
    unresolvedTitle: { ...typography.label, color: colors.text },
    unresolvedLine: { ...typography.caption, color: colors.tones.warning },
    empty: {
      ...typography.body,
      color: colors.mutedText,
      textAlign: "center",
      paddingTop: spacing.xl,
    },
    footer: {
      padding: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.materialStrong,
    },
  });
}
