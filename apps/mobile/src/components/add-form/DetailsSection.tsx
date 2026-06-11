import { type SettlementMode } from "@keel/core";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Text, TextInput, View } from "react-native";

import { useTheme } from "../../theme";
import { FieldButton } from "../FieldButton";
import { Segmented, type SegmentedOption } from "../Segmented";
import { useFormStyles } from "./styles";
import type { AddForm } from "./useAddForm";

const SETTLEMENT_OPTIONS: SegmentedOption<SettlementMode>[] = [
  { value: "automatic", label: "Automatic" },
  { value: "manual", label: "Manual" },
];

/** The rows every plan type shares: name, description, settlement, account,
 *  reminder, category, colour. */
export function DetailsSection({ form }: { form: AddForm }) {
  const { colors } = useTheme();
  const styles = useFormStyles();

  return (
    <>
      <View style={styles.field}>
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={[styles.input, !form.name.trim() && styles.requiredMissing]}
          value={form.name}
          onChangeText={form.setName}
          placeholder="e.g. Netflix"
          placeholderTextColor={colors.mutedText}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={styles.input}
          value={form.notes}
          onChangeText={form.setNotes}
          placeholder="Optional"
          placeholderTextColor={colors.mutedText}
        />
      </View>
    </>
  );
}

/** Settlement, account, reminder, category and colour — rendered after the
 *  schedule rows so the form reads: what → how much → when → how → extras. */
export function MetaSection({ form }: { form: AddForm }) {
  const { colors } = useTheme();
  const styles = useFormStyles();

  return (
    <>
      <View style={styles.rowField}>
        <Text style={styles.label}>Settlement</Text>
        <View style={styles.rowControl}>
          <Segmented
            options={SETTLEMENT_OPTIONS}
            value={form.settlementMode}
            onChange={form.setSettlementMode}
          />
        </View>
      </View>

      {form.isAutomatic && (
        <FieldButton
          label="Account"
          value={form.selectedAccount?.name ?? (form.accountId ? "Archived account" : "Choose")}
          hint={!form.selectedAccount}
          accessory={
            form.selectedAccount ? (
              <View style={[styles.dot, { backgroundColor: form.selectedAccount.color }]} />
            ) : undefined
          }
          onPress={() => form.setSheet("account")}
        />
      )}

      <FieldButton
        label="Reminder"
        value={form.reminderLabel}
        onPress={() => form.setSheet("reminder")}
      />

      <FieldButton
        label="Category"
        value={form.selectedCategory?.name ?? "None"}
        accessory={
          form.selectedCategory?.icon ? (
            <SymbolView
              name={form.selectedCategory.icon as SymbolViewProps["name"]}
              size={20}
              tintColor={colors.mutedText}
            />
          ) : undefined
        }
        onPress={() => form.setSheet("category")}
      />

      <FieldButton
        label="Colour"
        accessory={<View style={[styles.dot, { backgroundColor: form.color ?? colors.border }]} />}
        onPress={() => form.setSheet("color")}
      />
    </>
  );
}
