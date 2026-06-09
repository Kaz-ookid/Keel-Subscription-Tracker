import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { useSubscriptions } from "../state/subscriptions";
import { colors, radius, spacing, typography } from "../theme";
import { Sheet } from "./Sheet";

const SWATCHES = [
  "#0B1E3F", "#7FB8B0", "#3B82F6", "#22C55E", "#F59E0B",
  "#EF4444", "#8B5CF6", "#EC4899", "#14B8A6", "#6B7280",
];

interface Props {
  visible: boolean;
  onClose: () => void;
  selectedId?: string;
  onSelect: (id: string | undefined) => void;
}

/** Secondary card to pick a category — built-in + custom — or create a new one. */
export function CategorySheet({ visible, onClose, selectedId, onSelect }: Props) {
  const { categories, addCategory } = useSubscriptions();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [swatch, setSwatch] = useState(SWATCHES[0]);

  const pick = (id: string | undefined) => {
    onSelect(id);
    onClose();
  };

  const submitNew = () => {
    if (!name.trim()) return;
    const category = addCategory(name.trim(), swatch);
    setName("");
    setAdding(false);
    pick(category.id);
  };

  return (
    <Sheet visible={visible} title="Category" onClose={onClose}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable style={styles.row} onPress={() => pick(undefined)}>
          <Text style={styles.rowText}>None</Text>
          {!selectedId && <SymbolView name="checkmark" size={16} tintColor={colors.navy} />}
        </Pressable>

        {categories.map((c) => (
          <Pressable key={c.id} style={styles.row} onPress={() => pick(c.id)}>
            <View style={styles.left}>
              <View style={[styles.dot, { backgroundColor: c.color ?? colors.accent }]} />
              <Text style={styles.rowText}>{c.name}</Text>
            </View>
            {selectedId === c.id && (
              <SymbolView name="checkmark" size={16} tintColor={colors.navy} />
            )}
          </Pressable>
        ))}

        {adding ? (
          <View style={styles.addBox}>
            <TextInput
              style={styles.input}
              placeholder="Category name"
              placeholderTextColor={colors.mutedText}
              value={name}
              onChangeText={setName}
              autoFocus
            />
            <View style={styles.swatchRow}>
              {SWATCHES.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setSwatch(s)}
                  style={[styles.swatch, { backgroundColor: s }, swatch === s && styles.swatchActive]}
                />
              ))}
            </View>
            <Pressable style={styles.addBtn} onPress={submitNew}>
              <Text style={styles.addBtnText}>Add category</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.row} onPress={() => setAdding(true)}>
            <View style={styles.left}>
              <SymbolView name="plus.circle.fill" size={20} tintColor={colors.navy} />
              <Text style={[styles.rowText, { color: colors.navy }]}>Add category</Text>
            </View>
          </Pressable>
        )}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
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
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
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
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "transparent",
  },
  swatchActive: {
    borderColor: colors.text,
  },
  addBtn: {
    backgroundColor: colors.navy,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  addBtnText: {
    ...typography.label,
    color: colors.white,
  },
});
