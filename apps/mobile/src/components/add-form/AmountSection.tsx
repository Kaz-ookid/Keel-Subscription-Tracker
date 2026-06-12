import { currencyLabel } from "@keel/core";
import { Pressable, Text, TextInput, View } from "react-native";

import { useTheme } from "../../theme";
import { FieldButton } from "../FieldButton";
import { Segmented, type SegmentedOption } from "../Segmented";
import { useFormStyles } from "./styles";
import type { AddForm, AmountMode } from "./useAddForm";

const AMOUNT_MODE_OPTIONS: SegmentedOption<AmountMode>[] = [
  { value: "total", label: "Total" },
  { value: "perPayment", label: "Per payment" },
];

/** Amount + currency chip, plus the Pay-in-X total/per-payment toggle. */
export function AmountSection({ form }: { form: AddForm }) {
  const { colors } = useTheme();
  const styles = useFormStyles();

  return (
    <>
      <View style={[styles.amountCard, !(form.amountValue > 0) && styles.requiredMissing]}>
        <Pressable
          style={[styles.currencyChip, form.selectedAccount && styles.currencyChipLocked]}
          onPress={() => form.setSheet("currency")}
          disabled={!!form.selectedAccount}
        >
          <Text style={styles.currencyChipText}>{currencyLabel(form.effectiveCurrency)}</Text>
        </Pressable>
        <TextInput
          style={styles.amountInput}
          value={form.amountText}
          onChangeText={form.setAmountText}
          placeholder="0.00"
          placeholderTextColor={colors.mutedText}
          keyboardType="decimal-pad"
        />
      </View>

      {/* Where the money comes from, right next to how much it is. Manual
          payments are deliberately not pre-linked to an account (brief §8). */}
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

      {form.isInstallment && (
        <>
          <View style={styles.rowField}>
            <Text style={styles.label}>Amount is</Text>
            <View style={styles.rowControl}>
              <Segmented
                options={AMOUNT_MODE_OPTIONS}
                value={form.amountMode}
                onChange={form.setAmountMode}
              />
            </View>
          </View>
          {form.installmentPreview ? (
            <Text style={styles.preview}>{form.installmentPreview}</Text>
          ) : null}
        </>
      )}
    </>
  );
}
