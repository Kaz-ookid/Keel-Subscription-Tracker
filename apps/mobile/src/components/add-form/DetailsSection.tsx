import { type SettlementMode } from "@keel/core";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import Animated from "react-native-reanimated";

import { foldIn, foldOut } from "../../lib/motion";

import { radius, spacing, typography, useTheme, type ThemeColors } from "../../theme";
import { BrandBadge } from "../BrandBadge";
import { FieldButton } from "../FieldButton";
import { InfoDot } from "../InfoDot";
import { Segmented, type SegmentedOption } from "../Segmented";
import { Card } from "../ui/Card";
import { useFormStyles } from "./styles";
import type { AddForm } from "./useAddForm";

/** The identity cluster: the commitment's live face (brand logo, or colour
 *  circle with the category icon / name's first letter) next to the name
 *  field and a category chip. Everything that changes the face sits beside
 *  it, so cause and effect stay in the same glance: tap the circle to set a
 *  logo (by website) or a colour, tap the chip and the icon morphs with it. */
export function IdentityHeader({ form }: { form: AddForm }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useFormStyles();
  const header = useMemo(() => createHeaderStyles(colors), [colors]);

  return (
    <View>
      <Card variant="free" style={styles.group}>
        <View style={header.wrap}>
          <Pressable
            onPress={() => form.setSheet("color")}
            accessibilityLabel={t("add.changeIdentityA11y")}
          >
            <BrandBadge
              domain={form.domain}
              icon={form.selectedCategory?.icon}
              fallback={(form.name.trim().charAt(0) || "?").toUpperCase()}
              color={form.color ?? colors.accent}
              size={64}
            />
            <View style={header.pencil}>
              <SymbolView name="pencil" size={12} tintColor={colors.mutedText} />
            </View>
          </Pressable>

          <View style={header.right}>
            <TextInput
              style={[header.nameInput, !form.name.trim() && header.nameInputMissing]}
              value={form.name}
              onChangeText={form.setName}
              placeholder={t("add.namePlaceholder")}
              placeholderTextColor={colors.mutedText}
            />
            <Pressable style={header.categoryChip} onPress={() => form.setSheet("category")}>
              {form.selectedCategory?.icon && (
                <SymbolView
                  name={form.selectedCategory.icon as SymbolViewProps["name"]}
                  size={14}
                  tintColor={colors.mutedText}
                />
              )}
              <Text
                style={[
                  header.categoryText,
                  { color: form.selectedCategory ? colors.text : colors.mutedText },
                ]}
              >
                {form.selectedCategory
                  ? t(`categories.${form.selectedCategory.id}`, {
                      defaultValue: form.selectedCategory.name,
                    })
                  : t("add.chooseCategory")}
              </Text>
              <SymbolView name="chevron.down" size={10} tintColor={colors.mutedText} />
            </Pressable>
          </View>
        </View>
      </Card>

      {/* Typed a name we recognise? Offer the brand bank inline — pick one to
          pull in its logo, category and colour (the upfront chooser, in place). */}
      {form.nameSuggestions.length > 0 && (
        <View style={header.suggestBox}>
          {form.nameSuggestions.map((s, i) => (
            <Pressable
              key={s.id}
              style={[header.suggestRow, i > 0 && header.suggestRowDivider]}
              onPress={() => form.applySuggestion(s)}
            >
              <BrandBadge
                domain={s.domain}
                fallback={s.name.charAt(0).toUpperCase()}
                color={s.color ?? colors.accent}
                size={26}
              />
              <Text style={header.suggestName} numberOfLines={1}>
                {t(`bank.${s.id}`, { defaultValue: s.name })}
              </Text>
              <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function createHeaderStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    right: {
      flex: 1,
      gap: spacing.sm,
    },
    // Inline name field: an underline instead of a box (it lights up warning
    // while the required name is missing).
    nameInput: {
      ...typography.body,
      color: colors.text,
      paddingVertical: spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    nameInputMissing: {
      borderBottomColor: colors.tones.warning,
    },
    pencil: {
      position: "absolute",
      right: -2,
      bottom: -2,
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    // Same metrics as ui/Chip, plus the icon and the fold chevron.
    categoryChip: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: spacing.xs + 2,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.sm + 4,
    },
    categoryText: {
      ...typography.caption,
      fontWeight: "600",
    },
    suggestBox: {
      borderWidth: 1,
      borderColor: colors.hairline,
      backgroundColor: colors.material,
      borderRadius: radius.md,
      overflow: "hidden",
      marginTop: -spacing.sm,
      marginBottom: spacing.md,
    },
    suggestRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    suggestRowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    suggestName: {
      flex: 1,
      ...typography.body,
      color: colors.text,
    },
  });
}

/** The free-text extras (name + category live in the IdentityHeader). */
export function DetailsSection({ form }: { form: AddForm }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useFormStyles();

  return (
    <Card variant="list" style={styles.group}>
      <View style={[styles.rowField, styles.fieldFirst]}>
        <Text style={styles.label}>{t("add.description")}</Text>
        <View style={styles.rowControl}>
          <TextInput
            style={styles.input}
            value={form.notes}
            onChangeText={form.setNotes}
            placeholder={t("add.optional")}
            placeholderTextColor={colors.mutedText}
          />
        </View>
      </View>
    </Card>
  );
}

/** Settlement, account, reminder, category and colour — rendered after the
 *  schedule rows so the form reads: what → how much → when → how → extras. */
export function MetaSection({ form }: { form: AddForm }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useFormStyles();

  const settlementOptions: SegmentedOption<SettlementMode>[] = [
    { value: "automatic", label: t("row.automatic") },
    { value: "manual", label: t("row.manual") },
  ];

  const reminderOn = form.reminderKey !== "never";

  return (
    <>
      <Card variant="list" style={styles.group}>
        <View style={[styles.rowField, styles.fieldFirst]}>
          <View style={styles.labelWithInfo}>
            <Text style={styles.label}>{t("add.settlement")}</Text>
            <InfoDot title={t("add.infoSettlementTitle")} body={t("add.infoSettlementBody")} />
          </View>
          <View style={styles.rowControl}>
            <Segmented
              options={settlementOptions}
              value={form.settlementMode}
              onChange={form.setSettlementMode}
            />
          </View>
        </View>

        {/* A switch, not a picker: ON applies the default from Settings and
            folds in the advanced row for the rare adjustment. */}
        <View style={styles.rowField}>
          <Text style={styles.label}>{t("add.reminder")}</Text>
          <Switch
            value={reminderOn}
            onValueChange={form.setReminderEnabled}
            trackColor={{ true: colors.accent }}
          />
        </View>
        {reminderOn && (
          <Animated.View entering={foldIn} exiting={foldOut}>
            <FieldButton
              label={t("add.reminderWhen")}
              value={form.reminderLabel}
              onPress={() => form.setSheet("reminder")}
            />
            <FieldButton
              label={t("add.reminderTime")}
              value={form.reminderHourLabel}
              onPress={() => form.setSheet("reminderHour")}
            />
          </Animated.View>
        )}
      </Card>
      {reminderOn ? <Text style={styles.preview}>{t("add.reminderDefaultHint")}</Text> : null}
    </>
  );
}
