import { BNPL_PROVIDERS, formatCalendarDate, type TimeUnit } from "@keel/core";
import { Text, TextInput, View } from "react-native";

import { FieldButton } from "../FieldButton";
import { Segmented, type SegmentedOption } from "../Segmented";
import { useFormStyles } from "./styles";
import type { AddForm } from "./useAddForm";

const UNIT_OPTIONS: SegmentedOption<TimeUnit>[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

/** The plan-type-specific rows: cycle/first/last billing for subscriptions,
 *  count/frequency/first payment/provider for Pay-in-X. (M3's Annual variant
 *  slots in here as a third branch.) */
export function ScheduleSection({ form }: { form: AddForm }) {
  const styles = useFormStyles();

  if (form.isInstallment) {
    return (
      <>
        <View style={styles.rowField}>
          <Text style={styles.label}>Number of payments</Text>
          <TextInput
            style={[styles.input, styles.intervalInput]}
            value={form.installmentsText}
            onChangeText={form.setInstallmentsText}
            keyboardType="number-pad"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Cycle — every</Text>
          <View style={styles.cycleRow}>
            <TextInput
              style={[styles.input, styles.intervalInput]}
              value={form.intervalText}
              onChangeText={form.setIntervalText}
              keyboardType="number-pad"
            />
            <Segmented options={UNIT_OPTIONS} value={form.unit} onChange={form.setUnit} />
          </View>
        </View>

        <FieldButton
          label="First payment"
          value={formatCalendarDate(form.firstDateCal)}
          onPress={() => form.setSheet("date")}
        />

        <FieldButton
          label="Provider"
          value={BNPL_PROVIDERS[form.provider].label}
          onPress={() => form.setSheet("provider")}
        />
      </>
    );
  }

  return (
    <>
      <View style={styles.field}>
        <Text style={styles.label}>Cycle — every</Text>
        <View style={styles.cycleRow}>
          <TextInput
            style={[styles.input, styles.intervalInput]}
            value={form.intervalText}
            onChangeText={form.setIntervalText}
            keyboardType="number-pad"
          />
          <Segmented options={UNIT_OPTIONS} value={form.unit} onChange={form.setUnit} />
        </View>
      </View>

      <FieldButton
        label="First billing"
        value={formatCalendarDate(form.firstDateCal)}
        onPress={() => form.setSheet("date")}
      />

      <FieldButton
        label="Last billing"
        value={form.endDateCal ? formatCalendarDate(form.endDateCal) : "Never"}
        onPress={() => form.setSheet("endDate")}
      />
    </>
  );
}
