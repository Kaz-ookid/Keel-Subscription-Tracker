import { BNPL_PROVIDERS, formatCalendarDate, type TimeUnit } from "@keel/core";
import { useTranslation } from "react-i18next";
import { Text, TextInput, View } from "react-native";

import { FieldButton } from "../FieldButton";
import { Segmented, type SegmentedOption } from "../Segmented";
import { useFormStyles } from "./styles";
import type { AddForm } from "./useAddForm";

function useUnitOptions(): SegmentedOption<TimeUnit>[] {
  const { t } = useTranslation();
  return [
    { value: "day", label: t("add.unitDay") },
    { value: "week", label: t("add.unitWeek") },
    { value: "month", label: t("add.unitMonth") },
    { value: "year", label: t("add.unitYear") },
  ];
}

/** Niche but discoverable: monthly cycles can repeat by weekday instead of
 *  by date — two interpretations of the date already picked, nothing more. */
function RepeatsOnRow({ form }: { form: AddForm }) {
  const { t } = useTranslation();
  const styles = useFormStyles();
  if (form.unit !== "month") return null;
  return (
    <View style={styles.rowField}>
      <Text style={styles.label}>{t("add.repeatsOn")}</Text>
      <View style={styles.rowControl}>
        <Segmented
          options={[
            { value: "date", label: form.dayLabel },
            { value: "weekday", label: form.anchorLabel },
          ]}
          value={form.anchorMode ? "weekday" : "date"}
          onChange={(v) => form.setAnchorMode(v === "weekday")}
        />
      </View>
    </View>
  );
}

/** Free trial / intro price: a recurring price that changes on a date. Niche
 *  but discoverable, like RepeatsOnRow — off by default, and when on it folds
 *  the regular price + conversion date in (replacing the plain "First billing"
 *  date, which for a free trial IS the conversion date). */
function TrialRow({ form }: { form: AddForm }) {
  const { t } = useTranslation();
  const styles = useFormStyles();
  return (
    <>
      <View style={styles.rowField}>
        <Text style={styles.label}>{t("add.freeTrial")}</Text>
        <View style={styles.rowControl}>
          <Segmented
            options={[
              { value: "off", label: t("common.no") },
              { value: "on", label: t("common.yes") },
            ]}
            value={form.isTrial ? "on" : "off"}
            onChange={(v) => form.setIsTrial(v === "on")}
          />
        </View>
      </View>

      {form.showTrial && (
        <>
          <View style={styles.rowField}>
            <Text style={styles.label}>{t("add.regularPrice")}</Text>
            <View style={styles.rowControl}>
              <TextInput
                style={styles.input}
                value={form.trialRegularText}
                onChangeText={form.setTrialRegularText}
                placeholder="0.00"
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          <FieldButton
            label={t("add.trialEnds")}
            value={formatCalendarDate(form.convertsCal)}
            onPress={() => form.setSheet("convertsDate")}
          />

          {form.trialPreview ? <Text style={styles.preview}>{form.trialPreview}</Text> : null}
        </>
      )}
    </>
  );
}

/** The plan-type-specific rows: cycle/first/last billing for subscriptions,
 *  count/frequency/first payment/provider for Pay-in-X. (M3's Annual variant
 *  slots in here as a third branch.) */
export function ScheduleSection({ form }: { form: AddForm }) {
  const { t } = useTranslation();
  const styles = useFormStyles();
  const unitOptions = useUnitOptions();

  if (form.isInstallment) {
    return (
      <>
        <View style={styles.rowField}>
          <Text style={styles.label}>{t("add.numberOfPayments")}</Text>
          <TextInput
            style={[styles.input, styles.intervalInput]}
            value={form.installmentsText}
            onChangeText={form.setInstallmentsText}
            keyboardType="number-pad"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t("add.cycleEvery")}</Text>
          <View style={styles.cycleRow}>
            <TextInput
              style={[styles.input, styles.intervalInput]}
              value={form.intervalText}
              onChangeText={form.setIntervalText}
              keyboardType="number-pad"
            />
            <Segmented options={unitOptions} value={form.unit} onChange={form.setUnit} />
          </View>
        </View>

        <FieldButton
          label={t("add.firstPayment")}
          value={formatCalendarDate(form.firstDateCal)}
          onPress={() => form.setSheet("date")}
        />

        <RepeatsOnRow form={form} />

        <FieldButton
          label={t("add.provider")}
          value={t(`providers.${form.provider}`, {
            defaultValue: BNPL_PROVIDERS[form.provider].label,
          })}
          onPress={() => form.setSheet("provider")}
        />
      </>
    );
  }

  return (
    <>
      <View style={styles.field}>
        <Text style={styles.label}>{t("add.cycleEvery")}</Text>
        <View style={styles.cycleRow}>
          <TextInput
            style={[styles.input, styles.intervalInput]}
            value={form.intervalText}
            onChangeText={form.setIntervalText}
            keyboardType="number-pad"
          />
          <Segmented options={unitOptions} value={form.unit} onChange={form.setUnit} />
        </View>
      </View>

      {/* A free trial's first real charge IS the conversion date, so the plain
          "First/Last billing" rows give way to the trial fields. */}
      {!form.showTrial && (
        <FieldButton
          label={t("add.firstBilling")}
          value={formatCalendarDate(form.firstDateCal)}
          onPress={() => form.setSheet("date")}
        />
      )}

      <RepeatsOnRow form={form} />

      <TrialRow form={form} />

      {!form.showTrial && (
        <FieldButton
          label={t("add.lastBilling")}
          value={form.endDateCal ? formatCalendarDate(form.endDateCal) : t("common.never")}
          onPress={() => form.setSheet("endDate")}
        />
      )}
    </>
  );
}
