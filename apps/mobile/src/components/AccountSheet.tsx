import {
  CURRENCIES,
  currencyLabel,
  type Account,
  type CurrencyCode,
  type NewAccountInput,
} from "@keel/core";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { COLOR_SWATCHES } from "../constants";
import { useAppState } from "../state/app-state";
import { contrastText, radius, spacing, typography, useTheme, type ThemeColors } from "../theme";
import { BrandBadge } from "./BrandBadge";
import { Sheet } from "./Sheet";
import { Button } from "./ui/Button";

// Users pick the icon directly — "checking/savings/credit card" labels asked a
// question nobody filling in "Revolut" was thinking about. (The model keeps
// its `type` field; it just isn't part of the form.)
const ICON_CHOICES = [
  "building.columns.fill",
  "creditcard.fill",
  "banknote.fill",
  "wallet.bifold.fill",
  "bitcoinsign.circle.fill",
  "chart.line.uptrend.xyaxis",
  "globe",
];

const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

interface FormProps {
  initial?: Account;
  submitLabel: string;
  onSubmit: (input: NewAccountInput) => void;
}

/** The create/edit fields, shared by the picker's inline add and the tab. */
function AccountForm({ initial, submitLabel, onSubmit }: FormProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [name, setName] = useState(initial?.name ?? "");
  const [institution, setInstitution] = useState(initial?.institution ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? ICON_CHOICES[0]);
  const [currency, setCurrency] = useState<CurrencyCode>(initial?.currency ?? "EUR");
  const [color, setColor] = useState(initial?.color ?? "#3B82F6");

  const submit = () => {
    if (!name.trim()) return;
    onSubmit({
      name,
      type: initial?.type ?? "other",
      currency,
      institution: institution.trim() || undefined,
      color,
      icon,
    });
  };

  return (
    <View style={styles.form}>
      <TextInput
        style={[styles.input, !name.trim() && styles.requiredMissing]}
        placeholder={t("accounts.namePlaceholder")}
        placeholderTextColor={colors.mutedText}
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder={t("accounts.detailsPlaceholder")}
        placeholderTextColor={colors.mutedText}
        value={institution}
        onChangeText={setInstitution}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipRow}>
          {ICON_CHOICES.map((choice) => (
            <Pressable
              key={choice}
              onPress={() => setIcon(choice)}
              style={[styles.iconChoice, icon === choice && styles.iconChoiceActive]}
            >
              <SymbolView
                name={choice as SymbolViewProps["name"]}
                size={20}
                tintColor={icon === choice ? colors.white : colors.text}
              />
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* One currency per account (v1 rule) — payments inherit it. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipRow}>
          {CURRENCY_CODES.map((code) => (
            <Pressable
              key={code}
              onPress={() => setCurrency(code)}
              style={[styles.chip, currency === code && styles.chipActive]}
            >
              <Text style={[styles.chipText, currency === code && styles.chipTextActive]}>
                {currencyLabel(code)}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipRow}>
          {COLOR_SWATCHES.map((c) => (
            <Pressable
              key={c}
              onPress={() => setColor(c)}
              style={[styles.swatch, { backgroundColor: c }]}
            >
              {/* A checkmark reads on any swatch — a dark ring didn't. */}
              {color === c && <SymbolView name="checkmark" size={14} tintColor={contrastText(c)} />}
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Button label={submitLabel} onPress={submit} disabled={!name.trim()} />
    </View>
  );
}

/** A row rendering of one account, reused by the picker. */
function AccountLine({ account, colors }: { account: Account; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.left}>
      <BrandBadge icon={account.icon} color={account.color} size={32} />
      <View>
        <Text style={styles.rowText}>{account.name}</Text>
        {account.institution ? <Text style={styles.rowSub}>{account.institution}</Text> : null}
      </View>
    </View>
  );
}

interface PickerProps {
  visible: boolean;
  onClose: () => void;
  selectedId?: string;
  onSelect: (id: string | undefined) => void;
}

/** Secondary card to pick an account — or create one inline mid-form. */
export function AccountPickerSheet({ visible, onClose, selectedId, onSelect }: PickerProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { accounts, addAccount } = useAppState();
  const [adding, setAdding] = useState(false);

  const pick = (id: string | undefined) => {
    onSelect(id);
    onClose();
  };

  return (
    <Sheet visible={visible} title={t("accounts.sheetTitle")} onClose={onClose}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable style={styles.row} onPress={() => pick(undefined)}>
          <Text style={styles.rowText}>{t("common.none")}</Text>
          {!selectedId && <SymbolView name="checkmark" size={16} tintColor={colors.accent} />}
        </Pressable>

        {accounts.map((a) => (
          <Pressable key={a.id} style={[styles.row, styles.rowDivider]} onPress={() => pick(a.id)}>
            <AccountLine account={a} colors={colors} />
            <View style={styles.right}>
              <Text style={styles.rowSub}>{currencyLabel(a.currency)}</Text>
              {selectedId === a.id && (
                <SymbolView name="checkmark" size={16} tintColor={colors.accent} />
              )}
            </View>
          </Pressable>
        ))}

        {adding ? (
          <AccountForm
            submitLabel={t("accounts.addAccount")}
            onSubmit={(input) => {
              const account = addAccount(input);
              setAdding(false);
              pick(account.id);
            }}
          />
        ) : (
          <Pressable style={[styles.row, styles.rowDivider]} onPress={() => setAdding(true)}>
            <View style={styles.left}>
              <SymbolView name="plus.circle.fill" size={20} tintColor={colors.accent} />
              <Text style={[styles.rowText, { color: colors.accent }]}>
                {t("accounts.addAccount")}
              </Text>
            </View>
          </Pressable>
        )}
      </ScrollView>
    </Sheet>
  );
}

interface EditProps {
  visible: boolean;
  onClose: () => void;
  /** Edit this account; omit to create a new one. */
  account?: Account;
}

/** Create/edit sheet used by the Accounts tab. */
export function AccountEditSheet({ visible, onClose, account }: EditProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { addAccount, updateAccount } = useAppState();

  return (
    <Sheet
      visible={visible}
      title={account ? t("accounts.editAccount") : t("accounts.newAccount")}
      onClose={onClose}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <AccountForm
          initial={account}
          submitLabel={account ? t("common.save") : t("accounts.addAccount")}
          onSubmit={(input) => {
            if (account) updateAccount(account.id, input);
            else addAccount(input);
            onClose();
          }}
        />
      </ScrollView>
    </Sheet>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    content: {
      padding: spacing.md,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: spacing.md,
    },
    // Divider on top, skipped for the first ("None") row: no trailing line.
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    left: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    right: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    rowText: {
      ...typography.body,
      color: colors.text,
    },
    rowSub: {
      ...typography.caption,
      color: colors.mutedText,
    },
    form: {
      paddingVertical: spacing.md,
      gap: spacing.md,
    },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      ...typography.body,
      color: colors.text,
    },
    requiredMissing: {
      borderColor: colors.tones.warning,
    },
    chipRow: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    iconChoice: {
      width: 40,
      height: 40,
      borderRadius: radius.sm,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    iconChoiceActive: {
      backgroundColor: colors.action,
      borderColor: colors.action,
    },
    chip: {
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipActive: {
      backgroundColor: colors.action,
      borderColor: colors.action,
    },
    chipText: {
      ...typography.label,
      color: colors.text,
    },
    chipTextActive: {
      color: colors.actionText,
    },
    swatch: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
