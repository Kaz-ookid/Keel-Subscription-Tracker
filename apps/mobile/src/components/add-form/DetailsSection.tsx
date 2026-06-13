import { type SettlementMode } from "@keel/core";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { radius, spacing, useTheme } from "../../theme";
import { BrandBadge } from "../BrandBadge";
import { FieldButton } from "../FieldButton";
import { Segmented, type SegmentedOption } from "../Segmented";
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

  return (
    <View>
      <View style={headerStyles.wrap}>
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
          <View style={[headerStyles.pencil, { backgroundColor: colors.surface }]}>
            <SymbolView name="pencil" size={12} tintColor={colors.mutedText} />
          </View>
        </Pressable>

        <View style={headerStyles.right}>
          <TextInput
            style={[styles.input, !form.name.trim() && styles.requiredMissing]}
            value={form.name}
            onChangeText={form.setName}
            placeholder={t("add.namePlaceholder")}
            placeholderTextColor={colors.mutedText}
          />
          <Pressable
            style={[headerStyles.categoryChip, { borderColor: colors.border }]}
            onPress={() => form.setSheet("category")}
          >
            {form.selectedCategory?.icon && (
              <SymbolView
                name={form.selectedCategory.icon as SymbolViewProps["name"]}
                size={14}
                tintColor={colors.mutedText}
              />
            )}
            <Text
              style={[
                headerStyles.categoryText,
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

      {/* Typed a name we recognise? Offer the brand bank inline — pick one to
          pull in its logo, category and colour (the upfront chooser, in place). */}
      {form.nameSuggestions.length > 0 && (
        <View
          style={[
            headerStyles.suggestBox,
            { borderColor: colors.border, backgroundColor: colors.surface },
          ]}
        >
          {form.nameSuggestions.map((s, i) => (
            <Pressable
              key={s.id}
              style={[
                headerStyles.suggestRow,
                i > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: colors.border,
                },
              ]}
              onPress={() => form.applySuggestion(s)}
            >
              <BrandBadge
                domain={s.domain}
                fallback={s.name.charAt(0).toUpperCase()}
                color={s.color ?? colors.accent}
                size={26}
              />
              <Text style={[headerStyles.suggestName, { color: colors.text }]} numberOfLines={1}>
                {t(`bank.${s.id}`, { defaultValue: s.name })}
              </Text>
              <SymbolView name="chevron.right" size={12} tintColor={colors.mutedText} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const headerStyles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  right: {
    flex: 1,
    gap: spacing.sm,
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
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  categoryText: {
    fontSize: 13,
    fontWeight: "600",
  },
  suggestBox: {
    borderWidth: 1,
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
  suggestName: {
    flex: 1,
    fontSize: 15,
  },
});

/** The free-text extras (name + category live in the IdentityHeader). */
export function DetailsSection({ form }: { form: AddForm }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useFormStyles();

  return (
    <View style={styles.rowField}>
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
  );
}

/** Settlement, account, reminder, category and colour — rendered after the
 *  schedule rows so the form reads: what → how much → when → how → extras. */
export function MetaSection({ form }: { form: AddForm }) {
  const { t } = useTranslation();
  const styles = useFormStyles();

  const settlementOptions: SegmentedOption<SettlementMode>[] = [
    { value: "automatic", label: t("row.automatic") },
    { value: "manual", label: t("row.manual") },
  ];

  return (
    <>
      <View style={styles.rowField}>
        <Text style={styles.label}>{t("add.settlement")}</Text>
        <View style={styles.rowControl}>
          <Segmented
            options={settlementOptions}
            value={form.settlementMode}
            onChange={form.setSettlementMode}
          />
        </View>
      </View>

      <FieldButton
        label={t("add.reminder")}
        value={form.reminderLabel}
        onPress={() => form.setSheet("reminder")}
      />
    </>
  );
}
