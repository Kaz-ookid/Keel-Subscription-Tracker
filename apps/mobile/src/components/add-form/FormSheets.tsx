import DateTimePicker from "@react-native-community/datetimepicker";
import { Picker as RNPicker } from "@react-native-picker/picker";
import {
  BNPL_PROVIDERS,
  calendarDate,
  CURRENCIES,
  currencyLabel,
  formatCalendarDate,
  type BnplProviderId,
  type CurrencyCode,
} from "@keel/core";
import { type ComponentType, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView } from "react-native";

import { SymbolView } from "expo-symbols";

import { COLOR_SWATCHES } from "../../constants";
import { contrastText, useTheme } from "../../theme";
import { AccountPickerSheet } from "../AccountSheet";
import { CategorySheet } from "../CategorySheet";
import { Sheet } from "../Sheet";
import { WheelSheet } from "../WheelSheet";
import { useFormStyles } from "./styles";
import { REMINDER_OPTIONS, type AddForm } from "./useAddForm";

// @react-native-picker/picker@2.11 doesn't declare `children` under React 19's
// JSX types; alias to a children-accepting component (runtime is unaffected).
const Picker = RNPicker as unknown as ComponentType<{
  selectedValue: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
}> & { Item: typeof RNPicker.Item };

const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];
const PROVIDER_IDS = Object.keys(BNPL_PROVIDERS) as BnplProviderId[];

/** Every picker sheet of the Add form, rendered once and driven by `form.sheet`. */
export function FormSheets({ form }: { form: AddForm }) {
  const { colors, scheme } = useTheme();
  const { t } = useTranslation();
  const styles = useFormStyles();
  const close = () => form.setSheet(null);

  return (
    <>
      <WheelSheet visible={form.sheet === "currency"} title={t("add.currency")} onClose={close}>
        <Picker
          selectedValue={form.currency}
          onValueChange={(v) => form.setCurrency(v as CurrencyCode)}
        >
          {CURRENCY_CODES.map((code) => (
            <Picker.Item
              key={code}
              label={`${currencyLabel(code)} — ${t(`currencies.${code}`, { defaultValue: CURRENCIES[code].name })}`}
              value={code}
              color={colors.text}
            />
          ))}
        </Picker>
      </WheelSheet>

      <WheelSheet visible={form.sheet === "date"} title={t("add.firstBilling")} onClose={close}>
        <DateTimePicker
          value={form.firstDate}
          mode="date"
          display="spinner"
          themeVariant={scheme}
          textColor={colors.text}
          onChange={(_, d) => {
            if (d) form.setFirstDate(d);
          }}
        />
      </WheelSheet>

      <WheelSheet visible={form.sheet === "endDate"} title={t("add.ends")} onClose={close}>
        <Picker
          selectedValue={form.endDateCal ?? "never"}
          onValueChange={(v) => form.setEndDate(v === "never" ? null : calendarDate(v))}
        >
          <Picker.Item label={t("common.never")} value="never" color={colors.text} />
          {form.endDateOptions.map((d, i) => (
            <Picker.Item
              key={d}
              label={t("add.endOption", { date: formatCalendarDate(d), count: i + 1 })}
              value={d}
              color={colors.text}
            />
          ))}
        </Picker>
      </WheelSheet>

      <WheelSheet visible={form.sheet === "reminder"} title={t("add.reminder")} onClose={close}>
        <Picker
          selectedValue={form.reminderKey}
          onValueChange={(v) => form.setReminderKey(String(v))}
        >
          {REMINDER_OPTIONS.map((o) => (
            <Picker.Item
              key={o.value}
              label={t(o.labelKey, { count: o.count })}
              value={o.value}
              color={colors.text}
            />
          ))}
        </Picker>
      </WheelSheet>

      <WheelSheet visible={form.sheet === "provider"} title={t("add.provider")} onClose={close}>
        <Picker
          selectedValue={form.provider}
          onValueChange={(v) => form.setProvider(v as BnplProviderId)}
        >
          {PROVIDER_IDS.map((id) => (
            <Picker.Item
              key={id}
              label={t(`providers.${id}`, { defaultValue: BNPL_PROVIDERS[id].label })}
              value={id}
              color={colors.text}
            />
          ))}
        </Picker>
      </WheelSheet>

      <CategorySheet
        visible={form.sheet === "category"}
        onClose={close}
        selectedId={form.categoryId}
        onSelect={form.setCategoryId}
      />

      <AccountPickerSheet
        visible={form.sheet === "account"}
        onClose={close}
        selectedId={form.accountId}
        onSelect={form.selectAccount}
      />

      <Sheet visible={form.sheet === "color"} title={t("add.colour")} onClose={close}>
        <ScrollView contentContainerStyle={styles.swatchGrid}>
          {COLOR_SWATCHES.map((c) => (
            <Pressable
              key={c}
              onPress={() => {
                form.setColor(c);
                close();
              }}
              style={[styles.colorSwatch, { backgroundColor: c }]}
            >
              {/* A checkmark reads on any swatch — a dark ring didn't. */}
              {form.color === c && (
                <SymbolView name="checkmark" size={18} tintColor={contrastText(c)} />
              )}
            </Pressable>
          ))}
        </ScrollView>
      </Sheet>
    </>
  );
}
