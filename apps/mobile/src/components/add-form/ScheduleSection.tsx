import { BNPL_PROVIDERS, formatCalendarDate, type TimeUnit } from "@keel/core";
import { SymbolView } from "expo-symbols";
import { useTranslation } from "react-i18next";
import { Pressable, Text, TextInput, View } from "react-native";

import { showNativeActionSheet } from "../../lib/native-sheet";
import { useTheme } from "../../theme";
import { FieldButton } from "../FieldButton";
import { InfoDot } from "../InfoDot";
import { Segmented, type SegmentedOption } from "../Segmented";
import { Card } from "../ui/Card";
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
      <View style={styles.labelWithInfo}>
        <Text style={styles.label}>{t("add.repeatsOn")}</Text>
        <InfoDot title={t("add.infoRepeatsTitle")} body={t("add.infoRepeatsBody")} />
      </View>
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

/** Some banks never debit on a weekend: the charge effectively moves to the
 *  Friday before or the Monday after. Off by default; the recurrence grid
 *  stays anchored, only the shown/charged dates shift. A field + native
 *  sheet (not a three-way segment: it wrapped to two ugly lines), with an
 *  (i) since "moves to Monday" deserves a sentence. */
function WeekendRow({ form }: { form: AddForm }) {
  const { t } = useTranslation();
  const { scheme, colors } = useTheme();
  const mutedText = colors.mutedText;
  const styles = useFormStyles();
  const valueKey =
    form.weekendShift === "before"
      ? "add.weekendBefore"
      : form.weekendShift === "after"
        ? "add.weekendAfter"
        : "add.weekendKeep";
  const pick = () =>
    showNativeActionSheet(
      {
        title: t("add.weekends"),
        options: [
          t("add.weekendKeep"),
          t("add.weekendBefore"),
          t("add.weekendAfter"),
          t("common.cancel"),
        ],
        cancelButtonIndex: 3,
        userInterfaceStyle: scheme,
      },
      (index) => {
        if (index === 0) form.setWeekendShift("none");
        else if (index === 1) form.setWeekendShift("before");
        else if (index === 2) form.setWeekendShift("after");
      },
    );
  return (
    <View style={styles.rowField}>
      <View style={styles.labelWithInfo}>
        <Text style={styles.label}>{t("add.weekends")}</Text>
        <InfoDot title={t("add.infoWeekendsTitle")} body={t("add.infoWeekendsBody")} />
      </View>
      <Pressable style={styles.rowValueButton} onPress={pick} hitSlop={8}>
        <Text style={styles.rowValueText}>{t(valueKey)}</Text>
        <SymbolView name="chevron.up.chevron.down" size={11} tintColor={mutedText} />
      </Pressable>
    </View>
  );
}

/** Trial / price change: a recurring price that changes on a date. One
 *  mechanism, two readings — with a 0 amount it's a free trial (the first
 *  real charge IS the conversion date), with a paid amount it's a scheduled
 *  price change on a normal billing grid. The labels follow the same
 *  free-vs-paid split the item detail screen already uses. */
function TrialRow({ form, freeTrial }: { form: AddForm; freeTrial: boolean }) {
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
            <Text style={styles.label}>
              {freeTrial ? t("add.regularPrice") : t("item.newPrice")}
            </Text>
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
            label={freeTrial ? t("add.trialEnds") : t("item.changesOn")}
            value={formatCalendarDate(form.convertsCal)}
            onPress={() => form.setSheet("convertsDate")}
          />
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
      <Card variant="list" style={styles.group}>
        {/* The payment count moved up next to Amount, where the per-payment
            preview explains it; here the plan starts at its rhythm. */}
        <View style={[styles.field, styles.fieldFirst]}>
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

        <WeekendRow form={form} />

        <FieldButton
          label={t("add.provider")}
          value={t(`providers.${form.provider}`, {
            defaultValue: BNPL_PROVIDERS[form.provider].label,
          })}
          onPress={() => form.setSheet("provider")}
        />
      </Card>
    );
  }

  // Only a FREE trial folds the billing rows away (its first real charge IS
  // the conversion date). A paid item with a scheduled price change keeps
  // billing on its own grid, so First/Last billing must stay visible and
  // editable — hiding them here was the beta bug "changing the date does
  // nothing": the date that moves the next payment was unreachable.
  const freeTrial = form.showTrial && !(form.amountValue > 0);

  return (
    <>
      <Card variant="list" style={styles.group}>
        <View style={[styles.field, styles.fieldFirst]}>
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

        {!freeTrial && (
          <FieldButton
            label={t("add.firstBilling")}
            value={formatCalendarDate(form.firstDateCal)}
            onPress={() => form.setSheet("date")}
          />
        )}

        <RepeatsOnRow form={form} />

        <WeekendRow form={form} />

        <TrialRow form={form} freeTrial={freeTrial} />

        {!freeTrial && (
          <FieldButton
            label={t("add.lastBilling")}
            value={form.endDateCal ? formatCalendarDate(form.endDateCal) : t("common.never")}
            onPress={() => form.setSheet("endDate")}
          />
        )}
      </Card>
      {form.trialPreview ? <Text style={styles.preview}>{form.trialPreview}</Text> : null}
    </>
  );
}
