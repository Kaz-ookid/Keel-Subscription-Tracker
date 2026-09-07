// The mandatory review screen (PROJECT_BRIEF §6.1 / edge case #11): everything
// the AI read is shown as editable proposals — nothing is saved until "Add N".
// Tap a card to fix it in the full Add form; ✗ drops it; unmatched account
// names become new accounts at confirm time (never silently, always announced
// on the card). AI output is a draft to check, not data to trust.

import {
  formatCalendarDate,
  formatMoney,
  toMajor,
  type Account,
  type ImportDraft,
  type ImportFieldName,
  type ImportWarning,
  type NewAccountInput,
} from "@keel/core";
import { useNavigation } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLOR_SWATCHES } from "../../src/constants";
import { BrandBadge } from "../../src/components/BrandBadge";
import { LogoConsentGate } from "../../src/components/LogoConsentGate";
import { hapticImportConfirm } from "../../src/lib/haptics";
import { HeroCard } from "../../src/components/HeroCard";
import { localizedRecurrence } from "../../src/i18n/recurrence";
import { Button } from "../../src/components/ui/Button";
import { useAppActions, useAppData } from "../../src/state/app-state";
import { useImportSession } from "../../src/state/import-session";
import { radius, spacing, typography, useTheme, type ThemeColors } from "../../src/theme";

import { useLockedRedirect } from "../../src/lib/lock-gate";
/** Warnings that get their own line; account-unmatched is the account chip. */
const WARNING_KEYS: Partial<Record<ImportWarning["code"], string>> = {
  "currency-mismatch": "importAI.warnCurrencyMismatch",
  "currency-defaulted": "importAI.warnCurrencyDefaulted",
  "category-unknown": "importAI.warnCategoryUnknown",
  "cadence-defaulted": "importAI.warnCadenceDefaulted",
  "date-defaulted": "importAI.warnDateDefaulted",
  "provider-unknown": "importAI.warnProviderUnknown",
  duplicate: "importAI.warnDuplicate",
};

/** Localized field labels for the AI's assumed/uncertain declarations. */
const FIELD_KEYS: Record<ImportFieldName, string> = {
  name: "importAI.fieldName",
  amount: "importAI.fieldAmount",
  currency: "importAI.fieldCurrency",
  settlement: "importAI.fieldSettlement",
  category: "importAI.fieldCategory",
  cadence: "importAI.fieldCadence",
  firstDate: "importAI.fieldFirstDate",
  account: "importAI.fieldAccount",
};

export default function ImportReviewScreen() {
  // Write screen: a locked mount bounces to the locked sheet (deep links
  // and stale stacks included).
  const locked = useLockedRedirect();
  const router = useRouter();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { drafts, skipped, source, removeDraft, clear } = useImportSession();
  const { accounts, categories } = useAppData();
  const { addAccount, addSubscription, addInstallmentPlan, logAiActivity, createAiBackup } =
    useAppActions();

  // The light attention report: how many cards carry a flag, an AI note, or
  // an unpaid backlog — the ones worth a second look before confirming.
  const attention = drafts.filter(
    (d) =>
      d.warnings.length > 0 ||
      d.uncertainFields.length > 0 ||
      d.input.notes ||
      !d.settlePast ||
      d.accountName,
  ).length;
  const heroSub = [
    t("importAI.reviewHint"),
    skipped > 0 ? t("importAI.reviewSkipped", { count: skipped }) : null,
    attention > 0 ? t("importAI.reviewAttention", { count: attention }) : null,
  ]
    .filter(Boolean)
    .join(" ");

  const confirmAll = () => {
    hapticImportConfirm();
    // A safety backup BEFORE anything lands, so a bad import can be rolled
    // back whole from the AI history (same net the assistant has).
    const backupName = createAiBackup();
    // Unmatched account names become real accounts — one per distinct name,
    // in the currency of the first draft that mentions it.
    const createdByName = new Map<string, Account>();
    const accountIdFor = (draft: ImportDraft): string | undefined => {
      if (draft.input.accountId) return draft.input.accountId;
      if (!draft.accountName) return undefined;
      const key = draft.accountName.toLowerCase();
      let account = createdByName.get(key);
      if (!account) {
        const currency =
          draft.kind === "subscription"
            ? draft.input.amount.currency
            : draft.input.totalAmount.currency;
        const input: NewAccountInput = {
          name: draft.accountName,
          type: "other",
          currency,
          color: COLOR_SWATCHES[createdByName.size % COLOR_SWATCHES.length],
          icon: "building.columns.fill",
        };
        account = addAccount(input);
        createdByName.set(key, account);
      }
      return account.id;
    };

    for (const draft of drafts) {
      const accountId = accountIdFor(draft);
      // Past cycles were paid outside the app (unless the input said the
      // user is behind) — land them settled, never as a wall of overdue.
      const options = { settlePastPayments: draft.settlePast };
      if (draft.kind === "subscription") {
        addSubscription({ ...draft.input, accountId }, options);
      } else {
        addInstallmentPlan({ ...draft.input, accountId }, options);
      }
    }
    // The AI trace: what landed, from which door — the record the AI tab
    // shows so a big import never blurs the full picture.
    logAiActivity({
      tool: source,
      summary: { added: drafts.length, updated: 0, removed: 0 },
      itemNames: drafts.map((d) => d.input.name),
      backupName,
    });
    clear();
    // Close the WHOLE Add sheet, back to whoever presented it (the tabs,
    // Settings, or onboarding — which then advances to its done pane).
    // dismissAll() only pops to the sheet's own first screen, which stranded
    // the user back on the import hub after saving.
    const sheet = navigation.getParent();
    if (sheet) sheet.goBack();
    else router.back();
  };

  const renderDraft = ({ item: draft }: { item: ImportDraft }) => {
    const input = draft.input;
    const category = categories.find((c) => c.id === input.categoryId);
    const account = input.accountId ? accounts.find((a) => a.id === input.accountId) : undefined;
    const amountLine =
      draft.kind === "subscription"
        ? `${formatMoney(draft.input.amount)} · ${localizedRecurrence(input.recurrence)}`
        : t("importAI.splitLine", {
            total: formatMoney(draft.input.totalAmount),
            count: draft.input.numberOfInstallments,
          });
    const firstDate =
      draft.kind === "subscription"
        ? draft.input.firstChargeDate
        : draft.input.firstInstallmentDate;
    const trial =
      draft.kind === "subscription" && draft.input.introOffer
        ? t(toMajor(draft.input.amount) === 0 ? "importAI.trialLine" : "importAI.changeLine", {
            amount: formatMoney(draft.input.introOffer.regularAmount),
            date: formatCalendarDate(draft.input.introOffer.convertsOn),
          })
        : null;
    const warningLines = draft.warnings
      .map((w) => {
        const key = WARNING_KEYS[w.code];
        return key ? t(key, { detail: w.detail }) : null;
      })
      .filter((line): line is string => line !== null);
    // The per-item report: everything the user should look at, in orange,
    // plus ONE quiet line naming the fields the parser defaulted because the
    // input didn't state them. (Format v2 computes assumptions in code, so
    // the line is accurate and short; the old model self-reports were noise.)
    const uncertainLines = draft.uncertainFields.map((f) =>
      f === "name"
        ? t("importAI.uncertainName")
        : t("importAI.uncertainGeneric", { field: t(FIELD_KEYS[f]) }),
    );
    const assumedShown = draft.assumedFields.filter((f) => !draft.uncertainFields.includes(f));
    const assumedLine =
      assumedShown.length > 0
        ? t("importAI.assumedLine", {
            fields: assumedShown.map((f) => t(FIELD_KEYS[f])).join(" · "),
          })
        : null;
    const flagged =
      warningLines.length > 0 ||
      uncertainLines.length > 0 ||
      (!account && !!draft.accountName) ||
      !draft.settlePast;

    return (
      <Pressable
        style={[styles.card, flagged && styles.cardFlagged]}
        onPress={() => router.push({ pathname: "/add/form", params: { draftId: draft.id } })}
      >
        <BrandBadge
          domain={input.domain}
          icon={input.icon ?? category?.icon}
          fallback={input.name.charAt(0).toUpperCase()}
          color={input.color ?? colors.accent}
          size={36}
        />
        <View style={styles.middle}>
          <Text style={styles.name} numberOfLines={1}>
            {input.name}
          </Text>
          <Text style={styles.amount}>{amountLine}</Text>
          <Text style={styles.sub}>
            {t("importAI.fromDate", { date: formatCalendarDate(firstDate) })}
            {category
              ? ` · ${t(`categories.${category.id}`, { defaultValue: category.name })}`
              : ""}
            {` · ${t(input.settlementMode === "manual" ? "row.manual" : "row.automatic")}`}
          </Text>
          {trial && <Text style={styles.sub}>{trial}</Text>}
          {/* What the AI wrote in "notes": conversions, assumptions, caveats. */}
          {input.notes && <Text style={styles.notes}>“{input.notes}”</Text>}
          {!draft.settlePast && <Text style={styles.warn}>⚠ {t("importAI.backlogLine")}</Text>}
          {account && (
            <View style={styles.accountRow}>
              <View style={[styles.accountDot, { backgroundColor: account.color }]} />
              <Text style={styles.sub}>{account.name}</Text>
            </View>
          )}
          {!account && draft.accountName && (
            <Text style={styles.warn}>{t("importAI.newAccount", { name: draft.accountName })}</Text>
          )}
          {uncertainLines.map((line, i) => (
            <Text key={`u${i}`} style={styles.warn}>
              ⚠ {line}
            </Text>
          ))}
          {warningLines.map((line, i) => (
            <Text key={`w${i}`} style={styles.warn}>
              ⚠ {line}
            </Text>
          ))}
          {/* Quiet by design: defaults are fine, the user just gets to know. */}
          {assumedLine && <Text style={styles.sub}>{assumedLine}</Text>}
        </View>
        <View style={styles.actions}>
          <Pressable
            onPress={() => removeDraft(draft.id)}
            hitSlop={10}
            accessibilityLabel={t("importAI.removeA11y", { name: input.name })}
          >
            <SymbolView name="xmark.circle.fill" size={20} tintColor={colors.mutedText} />
          </Pressable>
          <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
        </View>
      </Pressable>
    );
  };

  if (locked) return null;
  return (
    <View style={styles.screen}>
      {/* First AI review also shows brand logos: ask before any load. */}
      <LogoConsentGate />
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        data={drafts}
        keyExtractor={(d) => d.id}
        renderItem={renderDraft}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <HeroCard
            label={t("importAI.reviewTitle")}
            amount={t("importAI.reviewHero", { count: drafts.length })}
            sub={heroSub}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t("importAI.reviewEmpty")}</Text>
          </View>
        }
      />
      {drafts.length > 0 && (
        // The screen lives in a page sheet, which eats the bottom inset —
        // pad the footer so the confirm never sits half off-screen.
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <Button label={t("importAI.addAll", { count: drafts.length })} onPress={confirmAll} />
        </View>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: "transparent" },
    listContent: { padding: spacing.md, paddingBottom: spacing.xl * 2, gap: spacing.sm },
    card: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
      backgroundColor: colors.material,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    // The "needs a look" stripe — flagged cards pop without shouting.
    cardFlagged: {
      borderLeftWidth: 3,
      borderLeftColor: colors.tones.warning,
    },
    middle: { flex: 1, gap: 2 },
    name: { ...typography.label, color: colors.text },
    amount: { ...typography.body, color: colors.text },
    sub: { ...typography.caption, color: colors.mutedText },
    notes: { ...typography.caption, color: colors.mutedText, fontStyle: "italic" },
    warn: { ...typography.caption, color: colors.tones.warning },
    accountRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs + 2 },
    accountDot: { width: 8, height: 8, borderRadius: 4 },
    actions: { alignItems: "flex-end", gap: spacing.md, alignSelf: "stretch" },
    empty: { alignItems: "center", paddingTop: spacing.xl },
    emptyText: { ...typography.body, color: colors.mutedText },
    footer: {
      padding: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.materialStrong,
    },
  });
}
