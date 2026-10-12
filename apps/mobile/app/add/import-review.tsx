// The mandatory review screen (PROJECT_BRIEF §6.1 / edge case #11): everything
// the AI read is shown as editable proposals — nothing is saved until "Add N".
// Tap a card to fix it in the full Add form; ✗ drops it; unmatched account
// names become new accounts at confirm time (never silently, always announced
// on the card). AI output is a draft to check, not data to trust.
//
// The list is grouped by account, existing accounts first, then the ones
// the import will create, then the items with none; a card without an
// account carries the account chips so it can be placed in one tap, with
// a "+" chip to create the account on the spot.

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
import { useNavigation, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLOR_SWATCHES } from "../../src/constants";
import { AccountEditSheet } from "../../src/components/AccountSheet";
import { BrandBadge } from "../../src/components/BrandBadge";
import { LogoConsentGate } from "../../src/components/LogoConsentGate";
import { hapticImportConfirm } from "../../src/lib/haptics";
import { HeroCard } from "../../src/components/HeroCard";
import { localizedRecurrence } from "../../src/i18n/recurrence";
import { Button } from "../../src/components/ui/Button";
import { Chip } from "../../src/components/ui/Chip";
import { SectionDivider } from "../../src/components/ui/SectionDivider";
import { useAppActions, useAppData } from "../../src/state/app-state";
import { useImportSession } from "../../src/state/import-session";
import {
  radius,
  spacing,
  type ThemeColors,
  typography,
  useStyles,
  useTheme,
} from "../../src/theme";

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

/** One list row: a group heading or a draft card. */
type Row =
  | { type: "header"; id: string; label: string; dot?: string; isNew: boolean }
  | { type: "draft"; id: string; draft: ImportDraft };

export default function ImportReviewScreen() {
  // Write screen: a locked mount bounces to the locked sheet (deep links
  // and stale stacks included).
  const locked = useLockedRedirect();
  const router = useRouter();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { drafts, skipped, skippedNames, source, removeDraft, assignAccount, clear } =
    useImportSession();
  const { accounts, categories } = useAppData();
  const { addAccount, addSubscription, addInstallmentPlan, logAiActivity, createAiBackup } =
    useAppActions();

  const sortedAccounts = useMemo(
    () => accounts.filter((a) => !a.isArchived).sort((a, b) => a.name.localeCompare(b.name)),
    [accounts],
  );

  // The "+" chip's sheet: one per screen, remounted per opening so the form
  // starts blank; the draft that asked remembers to take the new account.
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [creatingSession, setCreatingSession] = useState(0);
  const openCreate = (draftId: string) => {
    setCreatingFor(draftId);
    setCreatingSession((s) => s + 1);
  };

  // Grouped by account: existing accounts A to Z, then the accounts the
  // import will create, then the items with none. Headings only when there
  // is something to tell apart.
  const rows = useMemo<Row[]>(() => {
    const byExisting = new Map<string, ImportDraft[]>();
    const byNew = new Map<string, ImportDraft[]>();
    const none: ImportDraft[] = [];
    for (const draft of drafts) {
      const account = draft.input.accountId
        ? accounts.find((a) => a.id === draft.input.accountId)
        : undefined;
      if (account) {
        byExisting.set(account.id, [...(byExisting.get(account.id) ?? []), draft]);
      } else if (draft.accountName) {
        const key = draft.accountName.toLowerCase();
        byNew.set(key, [...(byNew.get(key) ?? []), draft]);
      } else none.push(draft);
    }
    const groups: { header: Omit<Row & { type: "header" }, "type">; drafts: ImportDraft[] }[] = [];
    for (const account of sortedAccounts) {
      const mine = byExisting.get(account.id);
      if (mine) {
        groups.push({
          header: { id: `h-${account.id}`, label: account.name, dot: account.color, isNew: false },
          drafts: mine,
        });
      }
    }
    for (const [key, mine] of [...byNew.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const name = mine[0].accountName ?? key;
      groups.push({
        header: { id: `h-new-${key}`, label: t("importAI.groupNewAccount", { name }), isNew: true },
        drafts: mine,
      });
    }
    if (none.length > 0) {
      groups.push({
        header: { id: "h-none", label: t("importAI.groupNoAccount"), isNew: false },
        drafts: none,
      });
    }
    const withHeaders = groups.length > 1 || groups[0]?.header.isNew;
    return groups.flatMap((group) => [
      ...(withHeaders ? [{ type: "header" as const, ...group.header }] : []),
      ...group.drafts.map((draft) => ({ type: "draft" as const, id: draft.id, draft })),
    ]);
  }, [drafts, accounts, sortedAccounts, t]);

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
    skippedNames.length > 0
      ? t("importAI.reviewSkippedNames", { names: skippedNames.join(", ") })
      : null,
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

  const renderDraft = (draft: ImportDraft) => {
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
    // No account at all: the chips place it in one tap, "+" creates one.
    const placeable = !account && !draft.accountName;

    return (
      <View style={[styles.card, flagged && styles.cardFlagged]}>
        <Pressable
          style={styles.cardBody}
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
              <Text style={styles.warn}>
                {t("importAI.newAccount", { name: draft.accountName })}
              </Text>
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
        {placeable && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {sortedAccounts.map((candidate) => (
              <Chip
                key={candidate.id}
                label={candidate.name}
                dot={candidate.color}
                selected={false}
                onPress={() => assignAccount(draft.id, candidate)}
              />
            ))}
            <Chip
              label={t("importAI.chipNewAccount")}
              selected={false}
              onPress={() => openCreate(draft.id)}
            />
          </ScrollView>
        )}
      </View>
    );
  };

  const renderRow = ({ item }: { item: Row }) =>
    item.type === "header" ? (
      <SectionDivider
        label={item.label}
        style={[styles.header, item.isNew && styles.headerNew]}
        trailing={
          item.dot ? <View style={[styles.accountDot, { backgroundColor: item.dot }]} /> : null
        }
      />
    ) : (
      renderDraft(item.draft)
    );

  if (locked) return null;
  return (
    <View style={styles.screen}>
      {/* First AI review also shows brand logos: ask before any load. */}
      <LogoConsentGate />
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        data={rows}
        keyExtractor={(row) => row.id}
        renderItem={renderRow}
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
      <AccountEditSheet
        key={creatingSession}
        visible={creatingFor !== null}
        onClose={() => setCreatingFor(null)}
        onCreated={(account) => {
          if (creatingFor) assignAccount(creatingFor, account);
        }}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: "transparent" },
    listContent: { padding: spacing.md, paddingBottom: spacing.xl * 2, gap: spacing.sm },
    header: { marginTop: spacing.sm },
    headerNew: { opacity: 0.85 },
    card: {
      backgroundColor: colors.material,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.sm,
    },
    cardBody: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
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
    chipRow: { flexDirection: "row", gap: spacing.sm },
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
