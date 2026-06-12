// The brand-bank list, used by onboarding (checklist mode) and the Add flow
// (single-select mode). One big alphabetical list — predictable to scan — with
// a chip row to narrow to a category (the chips double as memory prompts:
// "Transport… right, my transit pass"). Search covers ALL regions and ignores
// the chip; the browsed list shows only region-free entries plus the device's
// own region.

import {
  DEFAULT_CATEGORIES,
  SUGGESTION_CATEGORY_ORDER,
  type SuggestedCommitment,
} from "@keel/core";
import { getLocales } from "expo-localization";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { radius, spacing, typography, useTheme, type ThemeColors } from "../theme";
import { BrandBadge } from "./BrandBadge";

interface Props {
  suggestions: readonly SuggestedCommitment[];
  /** Ids already tracked or pending — shown greyed with an "added" mark
   *  rather than hidden, so the bank never LOOKS incomplete. */
  addedIds?: ReadonlySet<string>;
  /** Checklist mode: fired with everything checked when the user confirms. */
  onAdd?: (selected: SuggestedCommitment[]) => void;
  /** Single-select mode (the Add flow): a row tap picks immediately —
   *  no checkmarks, no confirm button. Takes precedence over onAdd. */
  onPick?: (suggestion: SuggestedCommitment) => void;
}

const CATEGORY_NAMES = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c.name]));
const CATEGORY_ICONS = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c.icon]));

function matches(s: SuggestedCommitment, query: string): boolean {
  const q = query.toLowerCase();
  return (
    s.name.toLowerCase().includes(q) || (s.aliases ?? []).some((a) => a.toLowerCase().includes(q))
  );
}

export function SuggestionPicker({ suggestions, addedIds, onAdd, onPick }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const region = useMemo(() => getLocales()[0]?.regionCode ?? undefined, []);

  // What's browsable without searching: region-free + the device's region.
  const browsable = useMemo(
    () => suggestions.filter((s) => !s.regions || (region != null && s.regions.includes(region))),
    [suggestions, region],
  );

  // Chips for every category that actually has browsable entries, in the
  // usual likelihood order, behind a leading "All".
  const chips = useMemo(() => {
    const present = new Set(browsable.map((s) => s.categoryId ?? "other"));
    return SUGGESTION_CATEGORY_ORDER.filter((id) => present.has(id));
  }, [browsable]);

  const visible = useMemo(() => {
    const trimmed = query.trim();
    // Typing searches the whole bank (all regions, all categories) — when you
    // know the name, no filter should hide it.
    const base = trimmed
      ? suggestions.filter((s) => matches(s, trimmed))
      : category
        ? browsable.filter((s) => (s.categoryId ?? "other") === category)
        : browsable;
    return [...base].sort((a, b) => a.name.localeCompare(b.name));
  }, [suggestions, browsable, query, category]);

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const confirm = () => {
    const selected = suggestions.filter((s) => checked.has(s.id));
    if (selected.length > 0) onAdd?.(selected);
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <SymbolView name="magnifyingglass" size={16} tintColor={colors.mutedText} />
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder={t("picker.searchPlaceholder")}
          placeholderTextColor={colors.mutedText}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>

      {/* Hidden while searching — search already spans everything. */}
      {!query.trim() && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsRow}
          contentContainerStyle={styles.chipsContent}
        >
          <Pressable
            onPress={() => setCategory(null)}
            style={[styles.chip, category === null && styles.chipActive]}
          >
            <Text style={[styles.chipText, category === null && styles.chipTextActive]}>
              {t("picker.chipAll")}
            </Text>
          </Pressable>
          {chips.map((id) => {
            const active = category === id;
            return (
              <Pressable
                key={id}
                onPress={() => setCategory(active ? null : id)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {t(`categories.${id}`, { defaultValue: CATEGORY_NAMES.get(id) ?? id })}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <FlatList
        style={styles.list}
        data={visible}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text style={styles.empty}>{query.trim() ? t("picker.noMatch") : ""}</Text>
        }
        renderItem={({ item }) => {
          const isChecked = checked.has(item.id);
          const added = addedIds?.has(item.id) ?? false;
          return (
            <Pressable
              style={[styles.row, added && styles.rowAdded]}
              disabled={added}
              onPress={() => (onPick ? onPick(item) : toggle(item.id))}
            >
              <BrandBadge
                domain={item.domain}
                icon={CATEGORY_ICONS.get(item.categoryId ?? "")}
                fallback={item.name.charAt(0).toUpperCase()}
                color={item.color ?? colors.accent}
                size={36}
              />
              <View style={styles.middle}>
                <Text style={styles.name} numberOfLines={1}>
                  {t(`bank.${item.id}`, { defaultValue: item.name })}
                </Text>
                <Text style={styles.caption}>
                  {/* Without the section headers, each row says its category. */}
                  {t(`categories.${item.categoryId ?? "other"}`, {
                    defaultValue: CATEGORY_NAMES.get(item.categoryId ?? "") ?? "Other",
                  })}{" "}
                  ·{" "}
                  {added
                    ? t("picker.alreadyInList")
                    : item.unit === "month"
                      ? t("picker.usuallyMonthly")
                      : t("picker.usuallyYearly")}
                </Text>
              </View>
              {added ? (
                <SymbolView name="checkmark" size={14} tintColor={colors.mutedText} />
              ) : onPick ? (
                <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
              ) : (
                <SymbolView
                  name={isChecked ? "checkmark.circle.fill" : "circle"}
                  size={24}
                  tintColor={isChecked ? colors.accent : colors.border}
                />
              )}
            </Pressable>
          );
        }}
      />

      {!onPick && (
        <View style={styles.footer}>
          <Pressable
            style={[styles.cta, checked.size === 0 && styles.ctaDisabled]}
            disabled={checked.size === 0}
            onPress={confirm}
          >
            <Text style={styles.ctaText}>
              {checked.size === 0 ? t("picker.tapWhat") : t("picker.addN", { count: checked.size })}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      marginHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    search: {
      flex: 1,
      paddingVertical: spacing.sm + 2,
      ...typography.body,
      color: colors.text,
    },
    chipsRow: {
      flexGrow: 0,
      marginBottom: spacing.sm,
    },
    chipsContent: {
      paddingHorizontal: spacing.md,
      gap: spacing.sm,
    },
    chip: {
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.sm + 4,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipActive: {
      backgroundColor: colors.navy,
      borderColor: colors.navy,
    },
    chipText: {
      ...typography.caption,
      fontWeight: "600",
      color: colors.text,
    },
    chipTextActive: {
      color: colors.white,
    },
    list: {
      flex: 1,
    },
    listContent: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginBottom: 4,
    },
    rowAdded: {
      opacity: 0.45,
    },
    middle: {
      flex: 1,
      gap: 1,
    },
    name: {
      ...typography.body,
      color: colors.text,
    },
    caption: {
      ...typography.caption,
      color: colors.mutedText,
    },
    empty: {
      ...typography.body,
      color: colors.mutedText,
      textAlign: "center",
      paddingTop: spacing.xl,
    },
    footer: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
    },
    cta: {
      backgroundColor: colors.navy,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: "center",
    },
    ctaDisabled: {
      opacity: 0.4,
    },
    ctaText: {
      ...typography.label,
      color: colors.white,
    },
  });
}
