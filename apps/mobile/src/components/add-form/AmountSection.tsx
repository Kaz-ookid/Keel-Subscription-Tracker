import { currencyLabel } from "@keel/core";
import { useTranslation } from "react-i18next";
import { Pressable, Text, TextInput, View } from "react-native";

import { useTheme } from "../../theme";
import { FieldButton } from "../FieldButton";
import { Segmented, type SegmentedOption } from "../Segmented";
import { Card } from "../ui/Card";
import { useFormStyles } from "./styles";
import type { AddForm, AmountMode } from "./useAddForm";

/** Amount + currency chip, plus the Pay-in-X total/per-payment toggle. */
export function AmountSection({ form }: { form: AddForm }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useFormStyles();

  const amountModeOptions: SegmentedOption<AmountMode>[] = [
    { value: "total", label: t("add.total") },
    { value: "perPayment", label: t("add.perPayment") },
  ];

  return (
    <>
      {/* During a trial this field is the TRIAL price (0 = free), so an empty
          value is valid — only the regular price is then required. */}
      <View
        style={[
          styles.amountCard,
          !form.showTrial && !(form.amountValue > 0) && styles.requiredMissing,
        ]}
      >
        <Pressable style={styles.currencyChip} onPress={() => form.setSheet("currency")}>
          <Text style={styles.currencyChipText}>{currencyLabel(form.effectiveCurrency)}</Text>
        </Pressable>
        <TextInput
          style={styles.amountInput}
          value={form.amountText}
          onChangeText={form.setAmountText}
          placeholder={form.showTrial ? t("add.trialPriceFree") : "0.00"}
          placeholderTextColor={colors.mutedText}
          keyboardType="decimal-pad"
        />
      </View>
      {form.showTrial ? <Text style={styles.preview}>{t("add.trialPriceHint")}</Text> : null}

      <Card variant="list" style={styles.group}>
        {/* Where the money comes from, right next to how much it is — for both
            modes now: automatic debits the account, manual just associates it. */}
        <FieldButton
          first
          label={t("add.account")}
          value={
            form.selectedAccount?.name ??
            (form.accountId ? t("add.archivedAccount") : t("add.choose"))
          }
          hint={form.isAutomatic && !form.selectedAccount}
          accessory={
            form.selectedAccount ? (
              <View style={[styles.dot, { backgroundColor: form.selectedAccount.color }]} />
            ) : undefined
          }
          onPress={() => form.setSheet("account")}
        />

        {form.isInstallment && (
          <>
            <View style={styles.rowField}>
              <Text style={styles.label}>{t("add.amountIs")}</Text>
              <View style={styles.rowControl}>
                <Segmented
                  options={amountModeOptions}
                  value={form.amountMode}
                  onChange={form.setAmountMode}
                />
              </View>
            </View>
            {/* The count lives with the amount: together they are what the
                per-payment preview below is computed from. */}
            <View style={styles.rowField}>
              <Text style={styles.label}>{t("add.numberOfPayments")}</Text>
              <TextInput
                style={[styles.input, styles.intervalInput]}
                value={form.installmentsText}
                onChangeText={form.setInstallmentsText}
                keyboardType="number-pad"
              />
            </View>
          </>
        )}
      </Card>
      {form.isInstallment && form.installmentPreview ? (
        <Text style={styles.preview}>{form.installmentPreview}</Text>
      ) : null}
    </>
  );
}
