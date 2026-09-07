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
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { SymbolView, type SymbolViewProps } from "expo-symbols";

import { COLOR_SWATCHES, ICON_POOL } from "../../constants";
import { formatHour } from "../../lib/dates";
import { contrastText, spacing, typography, useTheme } from "../../theme";
import { AccountPickerSheet } from "../AccountSheet";
import { BrandBadge, isEmojiMark } from "../BrandBadge";
import { CategorySheet } from "../CategorySheet";
import { Sheet } from "../Sheet";
import { OptionWheel } from "../ui/OptionWheel";
import { WheelSheet } from "../WheelSheet";
import { useFormStyles } from "./styles";
import { REMINDER_OPTIONS, type AddForm, type RepeatKey } from "./useAddForm";

// @react-native-picker/picker@2.11 doesn't declare `children` under React 19's
// JSX types; alias to a children-accepting component (runtime is unaffected).
const Picker = RNPicker as unknown as ComponentType<{
  selectedValue: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
}> & { Item: typeof RNPicker.Item };

const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];
const PROVIDER_IDS = Object.keys(BNPL_PROVIDERS) as BnplProviderId[];

// The native date wheel can measure ZERO height when laid out while the tray
// is still sliding in, leaving the sheet collapsed at the bottom. Pinning the
// standard wheel height makes the measurement irrelevant.
const DATE_WHEEL_HEIGHT = 216;

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
              label={`${currencyLabel(code)} · ${t(`currencies.${code}`, { defaultValue: CURRENCIES[code].name })}`}
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
          style={{ height: DATE_WHEEL_HEIGHT }}
          onChange={(_, d) => {
            if (d) form.setFirstDate(d);
          }}
        />
      </WheelSheet>

      <WheelSheet
        visible={form.sheet === "convertsDate"}
        title={t("add.trialEnds")}
        onClose={close}
      >
        <DateTimePicker
          value={form.convertsDate}
          mode="date"
          display="spinner"
          themeVariant={scheme}
          textColor={colors.text}
          style={{ height: DATE_WHEEL_HEIGHT }}
          onChange={(_, d) => {
            if (d) form.setConvertsDate(d);
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

      {/* The reminder sheets edit the rule whose row opened them
          (form.reminderIndex) — rule 1 for the simple case. */}
      <WheelSheet visible={form.sheet === "reminder"} title={t("add.reminder")} onClose={close}>
        <Picker
          selectedValue={form.reminderRows[form.reminderIndex]?.key ?? "1"}
          onValueChange={(v) => form.patchReminderDraft(form.reminderIndex, { key: String(v) })}
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

      <WheelSheet
        visible={form.sheet === "reminderHour"}
        title={t("add.reminderTime")}
        onClose={close}
      >
        <Picker
          selectedValue={form.reminderRows[form.reminderIndex]?.hourValue ?? "9"}
          onValueChange={(v) => form.patchReminderDraft(form.reminderIndex, { hourKey: String(v) })}
        >
          {Array.from({ length: 24 }, (_, hour) => (
            <Picker.Item
              key={hour}
              label={formatHour(hour)}
              value={String(hour)}
              color={colors.text}
            />
          ))}
        </Picker>
      </WheelSheet>

      <OptionWheel
        visible={form.sheet === "reminderRepeat"}
        title={t("add.reminderRepeat")}
        onClose={close}
        options={[
          { value: "off", label: t("add.repeatOff") },
          { value: "daily", label: t("add.repeatDaily") },
          { value: "weekly", label: t("add.repeatWeekly") },
        ]}
        value={form.reminderRows[form.reminderIndex]?.repeatKey ?? "off"}
        onChange={(v) => form.patchReminderDraft(form.reminderIndex, { repeatKey: v as RepeatKey })}
      />

      <OptionWheel
        visible={form.sheet === "weekend"}
        title={t("add.weekends")}
        onClose={close}
        options={[
          { value: "none", label: t("add.weekendKeep") },
          { value: "before", label: t("add.weekendBefore") },
          { value: "after", label: t("add.weekendAfter") },
        ]}
        value={form.weekendShift}
        onChange={(v) => form.setWeekendShift(v as "none" | "before" | "after")}
      />

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

      <Sheet visible={form.sheet === "color"} title={t("add.identityTitle")} onClose={close}>
        {/* A custom logo by website (with a live preview), or a colour swatch. */}
        <View
          style={{
            alignItems: "center",
            gap: spacing.sm,
            marginBottom: spacing.md,
            paddingTop: spacing.md,
            paddingHorizontal: spacing.md,
          }}
        >
          <BrandBadge
            domain={form.domain}
            icon={form.icon ?? form.selectedCategory?.icon}
            fallback={(form.name.trim().charAt(0) || "?").toUpperCase()}
            color={form.color ?? colors.accent}
            size={56}
          />
          <TextInput
            style={[styles.sheetInput, { alignSelf: "stretch" }]}
            value={form.domain ?? ""}
            onChangeText={(v) => form.setDomain(v.trim() || undefined)}
            placeholder={t("add.logoPlaceholder")}
            placeholderTextColor={colors.mutedText}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Text style={{ ...typography.caption, color: colors.mutedText, alignSelf: "stretch" }}>
            {t("add.logoHint")}
          </Text>
        </View>
        <Text
          style={{
            ...typography.caption,
            color: colors.mutedText,
            marginBottom: spacing.sm,
            paddingHorizontal: spacing.md,
          }}
        >
          {t("add.orColour")}
        </Text>
        <ScrollView>
          <View style={styles.swatchGrid}>
            {/* The ADAPTIVE swatch: the exact color of the latest logo (or a
              bank hex) leads the grid. It sticks around even after the logo
              is removed, so "that green" stays pickable as a plain colour. */}
            {form.adaptiveColor && (
              <Pressable
                onPress={() => {
                  // Same grammar as any swatch: a colour, not a logo.
                  form.setColor(form.adaptiveColor);
                  form.setDomain(undefined);
                  close();
                }}
                style={[styles.colorSwatch, { backgroundColor: form.adaptiveColor }]}
              >
                {form.color === form.adaptiveColor && (
                  <SymbolView
                    name="checkmark"
                    size={18}
                    tintColor={contrastText(form.adaptiveColor)}
                  />
                )}
              </Pressable>
            )}
            {COLOR_SWATCHES.map((c) => (
              <Pressable
                key={c}
                onPress={() => {
                  // Choosing a colour means "use a colour, not a logo".
                  form.setColor(c);
                  form.setDomain(undefined);
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
          </View>

          {/* The mark: the item's own icon (or emoji) on the plain badge.
              Doesn't touch the logo — a rendered logo still wins; the mark
              shows wherever the plain badge does. */}
          <Text
            style={{
              ...typography.caption,
              color: colors.mutedText,
              marginBottom: spacing.sm,
              paddingHorizontal: spacing.md,
            }}
          >
            {t("add.orMark")}
          </Text>
          <View style={styles.markGrid}>
            {/* Auto: back to the category's icon. */}
            <Pressable
              onPress={() => form.setIcon(undefined)}
              style={[styles.markCell, form.icon === undefined && styles.markCellActive]}
              accessibilityLabel={t("add.markAuto")}
            >
              <SymbolView
                name={(form.selectedCategory?.icon ?? "sparkles") as SymbolViewProps["name"]}
                size={22}
                tintColor={form.icon === undefined ? colors.accent : colors.mutedText}
              />
            </Pressable>
            {ICON_POOL.map((choice) => (
              <Pressable
                key={choice}
                onPress={() => form.setIcon(choice)}
                style={[styles.markCell, form.icon === choice && styles.markCellActive]}
              >
                <SymbolView
                  name={choice as SymbolViewProps["name"]}
                  size={22}
                  tintColor={form.icon === choice ? colors.accent : colors.text}
                />
              </Pressable>
            ))}
            {/* Any Apple emoji, via the emoji keyboard: type one in the cell. */}
            <View
              style={[
                styles.markCell,
                form.icon !== undefined && isEmojiMark(form.icon) && styles.markCellActive,
              ]}
            >
              <TextInput
                style={styles.markEmojiInput}
                value={form.icon && isEmojiMark(form.icon) ? form.icon : ""}
                placeholder="😀"
                placeholderTextColor={colors.mutedText}
                onChangeText={(text) => {
                  const mark = text.trim();
                  if (!mark) return;
                  // Only a real emoji counts; letters stay the fallback's job.
                  if (isEmojiMark(mark)) form.setIcon(mark.slice(0, 8));
                }}
                accessibilityLabel={t("add.markEmoji")}
              />
            </View>
          </View>
        </ScrollView>
      </Sheet>
    </>
  );
}
