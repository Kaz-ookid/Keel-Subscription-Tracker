import {
  ACCOUNT_TYPES,
  CURRENCIES,
  type Account,
  type AccountType,
  type CurrencyCode,
  type NewAccountInput,
} from "@keel/core";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { COLOR_SWATCHES } from "../constants";
import { useAppState } from "../state/app-state";
import {
  contrastText,
  radius,
  spacing,
  tones,
  typography,
  useTheme,
  type ThemeColors,
} from "../theme";
import { IconBadge } from "./IconBadge";
import { Segmented, type SegmentedOption } from "./Segmented";
import { Sheet } from "./Sheet";

/** SF Symbol per account type (the core descriptor icons are abstract names). */
export const ACCOUNT_TYPE_SYMBOLS: Record<AccountType, string> = {
  checking: "building.columns.fill",
  savings: "banknote.fill",
  credit_card: "creditcard.fill",
  other: "wallet.bifold.fill",
};

const TYPE_OPTIONS: SegmentedOption<AccountType>[] = (
  Object.keys(ACCOUNT_TYPES) as AccountType[]
).map((t) => ({ value: t, label: ACCOUNT_TYPES[t].label }));

const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

interface FormProps {
  initial?: Account;
  submitLabel: string;
  onSubmit: (input: NewAccountInput) => void;
}

/** The create/edit fields, shared by the picker's inline add and the tab. */
function AccountForm({ initial, submitLabel, onSubmit }: FormProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [name, setName] = useState(initial?.name ?? "");
  const [institution, setInstitution] = useState(initial?.institution ?? "");
  const [type, setType] = useState<AccountType>(initial?.type ?? "checking");
  const [currency, setCurrency] = useState<CurrencyCode>(initial?.currency ?? "EUR");
  const [color, setColor] = useState(initial?.color ?? "#3B82F6");

  const submit = () => {
    if (!name.trim()) return;
    onSubmit({
      name,
      type,
      currency,
      institution: institution.trim() || undefined,
      color,
      icon: ACCOUNT_TYPE_SYMBOLS[type],
    });
  };

  return (
    <View style={styles.form}>
      <TextInput
        style={[styles.input, !name.trim() && styles.requiredMissing]}
        placeholder="Account name — e.g. Revolut, PayPal, BNP"
        placeholderTextColor={colors.mutedText}
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder="Details (optional) — e.g. joint account, travel card"
        placeholderTextColor={colors.mutedText}
        value={institution}
        onChangeText={setInstitution}
      />

      <Segmented options={TYPE_OPTIONS} value={type} onChange={setType} />

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
                {CURRENCIES[code].flag} {code}
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

      <Pressable
        style={[styles.submitBtn, !name.trim() && styles.submitBtnDisabled]}
        onPress={submit}
      >
        <Text style={styles.submitText}>{submitLabel}</Text>
      </Pressable>
    </View>
  );
}

/** A row rendering of one account, reused by the picker. */
function AccountLine({ account, colors }: { account: Account; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.left}>
      <IconBadge icon={account.icon} color={account.color} size={32} />
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
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { accounts, addAccount } = useAppState();
  const [adding, setAdding] = useState(false);

  const pick = (id: string | undefined) => {
    onSelect(id);
    onClose();
  };

  return (
    <Sheet visible={visible} title="Account" onClose={onClose}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable style={styles.row} onPress={() => pick(undefined)}>
          <Text style={styles.rowText}>None</Text>
          {!selectedId && <SymbolView name="checkmark" size={16} tintColor={colors.accent} />}
        </Pressable>

        {accounts.map((a) => (
          <Pressable key={a.id} style={styles.row} onPress={() => pick(a.id)}>
            <AccountLine account={a} colors={colors} />
            <View style={styles.right}>
              <Text style={styles.rowSub}>{a.currency}</Text>
              {selectedId === a.id && (
                <SymbolView name="checkmark" size={16} tintColor={colors.accent} />
              )}
            </View>
          </Pressable>
        ))}

        {adding ? (
          <AccountForm
            submitLabel="Add account"
            onSubmit={(input) => {
              const account = addAccount(input);
              setAdding(false);
              pick(account.id);
            }}
          />
        ) : (
          <Pressable style={styles.row} onPress={() => setAdding(true)}>
            <View style={styles.left}>
              <SymbolView name="plus.circle.fill" size={20} tintColor={colors.accent} />
              <Text style={[styles.rowText, { color: colors.accent }]}>Add account</Text>
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
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { addAccount, updateAccount } = useAppState();

  return (
    <Sheet visible={visible} title={account ? "Edit account" : "New account"} onClose={onClose}>
      <ScrollView contentContainerStyle={styles.content}>
        <AccountForm
          initial={account}
          submitLabel={account ? "Save" : "Add account"}
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
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
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
      borderColor: tones.warning,
    },
    chipRow: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    chip: {
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipActive: {
      backgroundColor: colors.navy,
      borderColor: colors.navy,
    },
    chipText: {
      ...typography.label,
      color: colors.text,
    },
    chipTextActive: {
      color: colors.white,
    },
    swatch: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    submitBtn: {
      backgroundColor: colors.navy,
      borderRadius: radius.sm,
      paddingVertical: spacing.sm,
      alignItems: "center",
    },
    submitBtnDisabled: {
      opacity: 0.5,
    },
    submitText: {
      ...typography.label,
      color: colors.white,
    },
  });
}
