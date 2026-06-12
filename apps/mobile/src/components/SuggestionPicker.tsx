// The onboarding picker: the brand bank as a category-grouped checklist. Tap
// what you pay for, one button files everything checked into the To-complete
// list. Scanning beats swiping at ~200 entries — you only act on what you
// have, and the category headers themselves jog the memory ("Transport…
// right, my transit pass"). Search covers ALL regions; the unsearched list
// shows only region-free entries plus the device's own region.

import {
  DEFAULT_CATEGORIES,
  SUGGESTION_CATEGORY_ORDER,
  type SuggestedCommitment,
} from "@keel/core";
import { getLocales } from "expo-localization";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import { Pressable, SectionList, StyleSheet, Text, TextInput, View } from "react-native";

import { radius, spacing, typography, useTheme, type ThemeColors } from "../theme";
import { BrandBadge } from "./BrandBadge";

interface Props {
  /** Already deduped against tracked items + pending entries by the caller. */
  suggestions: readonly SuggestedCommitment[];
  /** Checklist mode: fired with everything checked when the user confirms. */
  onAdd?: (selected: SuggestedCommitment[]) => void;
  /** Single-select mode (the Add flow): a row tap picks immediately —
   *  no checkmarks, no confirm button. Takes precedence over onAdd. */
  onPick?: (suggestion: SuggestedCommitment) => void;
}

interface Section {
  key: string;
  title: string;
  data: SuggestedCommitment[];
}

const CATEGORY_NAMES = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c.name]));
const CATEGORY_ICONS = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c.icon]));

function matches(s: SuggestedCommitment, query: string): boolean {
  const q = query.toLowerCase();
  return (
    s.name.toLowerCase().includes(q) || (s.aliases ?? []).some((a) => a.toLowerCase().includes(q))
  );
}

export function SuggestionPicker({ suggestions, onAdd, onPick }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const region = useMemo(() => getLocales()[0]?.regionCode ?? undefined, []);

  const sections = useMemo<Section[]>(() => {
    const trimmed = query.trim();
    const visible = suggestions.filter((s) => {
      if (trimmed) return matches(s, trimmed);
      return !s.regions || (region != null && s.regions.includes(region));
    });
    const byCategory = new Map<string, SuggestedCommitment[]>();
    for (const s of visible) {
      const key = s.categoryId ?? "other";
      const list = byCategory.get(key);
      if (list) list.push(s);
      else byCategory.set(key, [s]);
    }
    return SUGGESTION_CATEGORY_ORDER.filter((id) => byCategory.has(id)).map((id) => ({
      key: id,
      title: CATEGORY_NAMES.get(id) ?? id,
      data: byCategory.get(id) ?? [],
    }));
  }, [suggestions, query, region]);

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
          placeholder="Search all brands…"
          placeholderTextColor={colors.mutedText}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>

      <SectionList
        style={styles.list}
        sections={sections}
        keyExtractor={(s) => s.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionTitle}>{section.title}</Text>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {query.trim() ? "No brand matches that — you can still add it by hand later." : ""}
          </Text>
        }
        renderItem={({ item }) => {
          const isChecked = checked.has(item.id);
          return (
            <Pressable style={styles.row} onPress={() => (onPick ? onPick(item) : toggle(item.id))}>
              <BrandBadge
                domain={item.domain}
                icon={item.color ? undefined : CATEGORY_ICONS.get(item.categoryId ?? "")}
                fallback={item.name.charAt(0).toUpperCase()}
                color={item.color ?? colors.accent}
                size={36}
              />
              <View style={styles.middle}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.caption}>
                  usually {item.unit === "month" ? "monthly" : "yearly"}
                </Text>
              </View>
              {onPick ? (
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
              {checked.size === 0 ? "Tap what you pay for" : `Add ${checked.size} to my list`}
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
    list: {
      flex: 1,
    },
    listContent: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
    },
    sectionTitle: {
      ...typography.caption,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.6,
      color: colors.mutedText,
      paddingTop: spacing.md,
      paddingBottom: spacing.xs,
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
