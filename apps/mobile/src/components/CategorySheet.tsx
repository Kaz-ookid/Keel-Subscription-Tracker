import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { useAppState } from "../state/app-state";
import { radius, spacing, typography, useTheme, type ThemeColors } from "../theme";
import { Sheet } from "./Sheet";
import { Button } from "./ui/Button";

type SymbolName = SymbolViewProps["name"];

// SF Symbols offered when creating a custom category.
const ICON_CHOICES = [
  "star.fill",
  "tag.fill",
  "creditcard.fill",
  "cart.fill",
  "gift.fill",
  "gamecontroller.fill",
  "music.note",
  "film.fill",
  "book.fill",
  "airplane",
  "fork.knife",
  "dumbbell.fill",
  "pawprint.fill",
  "wrench.and.screwdriver.fill",
  "globe",
];

interface Props {
  visible: boolean;
  onClose: () => void;
  selectedId?: string;
  onSelect: (id: string | undefined) => void;
}

/** Secondary card to pick a category — built-in + custom — or create a new one. */
export function CategorySheet({ visible, onClose, selectedId, onSelect }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { categories, addCategory } = useAppState();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(ICON_CHOICES[0]);

  const pick = (id: string | undefined) => {
    onSelect(id);
    onClose();
  };

  const submitNew = () => {
    if (!name.trim()) return;
    const category = addCategory(name.trim(), icon);
    setName("");
    setAdding(false);
    pick(category.id);
  };

  return (
    <Sheet visible={visible} title={t("categorySheet.title")} onClose={onClose}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable style={styles.row} onPress={() => pick(undefined)}>
          <Text style={styles.rowText}>{t("common.none")}</Text>
          {!selectedId && <SymbolView name="checkmark" size={16} tintColor={colors.accent} />}
        </Pressable>

        {categories.map((c) => (
          <Pressable key={c.id} style={styles.row} onPress={() => pick(c.id)}>
            <View style={styles.left}>
              <SymbolView
                name={(c.icon ?? "tag.fill") as SymbolName}
                size={22}
                tintColor={colors.text}
              />
              <Text style={styles.rowText}>
                {t(`categories.${c.id}`, { defaultValue: c.name })}
              </Text>
            </View>
            {selectedId === c.id && (
              <SymbolView name="checkmark" size={16} tintColor={colors.accent} />
            )}
          </Pressable>
        ))}

        {adding ? (
          <View style={styles.addBox}>
            <TextInput
              style={styles.input}
              placeholder={t("categorySheet.namePlaceholder")}
              placeholderTextColor={colors.mutedText}
              value={name}
              onChangeText={setName}
              autoFocus
            />
            <View style={styles.swatchRow}>
              {ICON_CHOICES.map((choice) => (
                <Pressable
                  key={choice}
                  onPress={() => setIcon(choice)}
                  style={[styles.iconChoice, icon === choice && styles.iconChoiceActive]}
                >
                  <SymbolView
                    name={choice as SymbolName}
                    size={22}
                    tintColor={icon === choice ? colors.white : colors.text}
                  />
                </Pressable>
              ))}
            </View>
            <Button
              label={t("categorySheet.addCategory")}
              onPress={submitNew}
              disabled={!name.trim()}
            />
          </View>
        ) : (
          <Pressable style={styles.row} onPress={() => setAdding(true)}>
            <View style={styles.left}>
              <SymbolView name="plus.circle.fill" size={20} tintColor={colors.accent} />
              <Text style={[styles.rowText, { color: colors.accent }]}>
                {t("categorySheet.addCategory")}
              </Text>
            </View>
          </Pressable>
        )}
      </ScrollView>
    </Sheet>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    content: {
      padding: spacing.md,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    left: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    rowText: {
      ...typography.body,
      color: colors.text,
    },
    addBox: {
      paddingVertical: spacing.md,
      gap: spacing.md,
    },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      ...typography.body,
      color: colors.text,
    },
    swatchRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    iconChoice: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    iconChoiceActive: {
      backgroundColor: colors.action,
      borderColor: colors.action,
    },
  });
}
