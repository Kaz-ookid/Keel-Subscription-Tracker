// The reader lab (dev builds only, behind the debug drawer): the cloud
// reader run by hand, with what we cannot see from the review screen, the
// RAW answer the model gave before the parser filled anything. One tap runs
// the same material through all four combinations (full or lean prompt,
// full or lean-guide schema) and builds one report to copy, so a prompt is
// judged on evidence across the matrix instead of on review cards.

import {
  buildKeelReadsPrompt,
  buildKeelReadsPromptLean,
  detectCurrencyHint,
  parseImportDocument,
  today,
} from "@keel/core";
import * as Clipboard from "expo-clipboard";
import { Stack } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { Button } from "../src/components/ui/Button";
import { readWithInstructions } from "../src/lib/apple-intelligence";
import { useAppData } from "../src/state/app-state";
import { radius, spacing, typography, useStyles, useTheme, type ThemeColors } from "../src/theme";

type Variant = "full" | "lean";
const MATRIX: { prompt: Variant; schema: Variant }[] = [
  { prompt: "full", schema: "full" },
  { prompt: "full", schema: "lean" },
  { prompt: "lean", schema: "full" },
  { prompt: "lean", schema: "lean" },
];

interface RunResult {
  label: string;
  meta: string;
  summary: string;
  raw: string;
}

export default function ReaderLabScreen() {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { accounts, categories, displayCurrency } = useAppData();
  const [material, setMaterial] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<RunResult[]>([]);

  const runOne = async (prompt: Variant, schema: Variant): Promise<RunResult> => {
    const label = `prompt ${prompt} · schema ${schema}`;
    const defaultCurrency = detectCurrencyHint(material) ?? displayCurrency;
    const context = { today: today(), defaultCurrency };
    const instructions =
      prompt === "lean" ? buildKeelReadsPromptLean(context) : buildKeelReadsPrompt(context);
    const started = Date.now();
    try {
      const json = await readWithInstructions(
        material,
        instructions,
        schema === "lean" ? "cloud-lean" : "cloud",
      );
      const ms = Date.now() - started;
      let raw = json;
      try {
        raw = JSON.stringify(JSON.parse(json), null, 2);
      } catch {
        // Not JSON: shown as is.
      }
      const result = parseImportDocument(json, {
        defaultCurrency,
        today: today(),
        accounts,
        categories,
        takenNames: [],
      });
      const lines = result.drafts.map((d) => {
        const assumed = d.assumedFields.length ? ` · defaults: ${d.assumedFields.join(", ")}` : "";
        const uncertain = d.uncertainFields.length
          ? ` · uncertain: ${d.uncertainFields.join(", ")}`
          : "";
        const warnings = d.warnings.length
          ? ` · warn: ${d.warnings.map((w) => w.code).join(", ")}`
          : "";
        return `- ${d.input.name}${assumed}${uncertain}${warnings}`;
      });
      return {
        label,
        meta: `${instructions.length} prompt chars · ${ms} ms`,
        summary: `${result.drafts.length} items, ${result.skipped} skipped${result.error ? `, error ${result.error}` : ""}\n${lines.join("\n")}`,
        raw,
      };
    } catch (failure) {
      return {
        label,
        meta: `${instructions.length} prompt chars · failed after ${Date.now() - started} ms`,
        summary: `failed: ${failure instanceof Error ? failure.message : String(failure)}`,
        raw: "",
      };
    }
  };

  const runAll = async () => {
    setResults([]);
    const collected: RunResult[] = [];
    for (const combo of MATRIX) {
      setBusy(`${combo.prompt} prompt, ${combo.schema} schema…`);
      const result = await runOne(combo.prompt, combo.schema);
      collected.push(result);
      setResults([...collected]);
    }
    setBusy(null);
  };

  const report = () =>
    [
      `## Reader lab · ${today()} · ${material.length} material chars`,
      "",
      "### Material",
      material,
      ...results.flatMap((r) => [
        "",
        `### ${r.label}`,
        r.meta,
        "",
        "Parsed:",
        r.summary,
        "",
        "Raw:",
        r.raw,
      ]),
      "",
    ].join("\n");

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Stack.Screen options={{ title: "Reader lab" }} />
      <TextInput
        style={styles.input}
        value={material}
        onChangeText={setMaterial}
        placeholder="Material: typed notes, or paste what a screenshot read"
        placeholderTextColor={colors.mutedText}
        multiline
        autoCorrect={false}
        autoCapitalize="none"
      />
      <View style={styles.actions}>
        <Button
          variant="secondary"
          icon="doc.on.clipboard"
          label="Paste"
          onPress={() => void Clipboard.getStringAsync().then(setMaterial)}
        />
        <Button
          icon="sparkles"
          label={busy ? "Running…" : "Run all four"}
          onPress={() => void runAll()}
          disabled={busy !== null || material.trim() === ""}
        />
      </View>
      {busy ? <Text style={styles.meta}>{busy}</Text> : null}
      {results.map((r) => (
        <View key={r.label} style={styles.card}>
          <Text style={styles.cardTitle}>{r.label}</Text>
          <Text style={styles.meta}>{r.meta}</Text>
          <Text style={styles.mono} selectable>
            {r.summary}
          </Text>
        </View>
      ))}
      {results.length === MATRIX.length && !busy ? (
        <Button
          icon="doc.on.doc"
          label="Copy the full report"
          onPress={() => void Clipboard.setStringAsync(report())}
        />
      ) : null}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: "transparent" },
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
    input: {
      minHeight: 160,
      maxHeight: 320,
      padding: spacing.sm,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.hairline,
      backgroundColor: colors.material,
      ...typography.body,
      color: colors.text,
      textAlignVertical: "top",
    },
    actions: { flexDirection: "row", gap: spacing.sm, justifyContent: "flex-end" },
    meta: { ...typography.caption, color: colors.mutedText },
    card: {
      backgroundColor: colors.material,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.xs,
    },
    cardTitle: { ...typography.label, color: colors.text },
    mono: { ...typography.caption, color: colors.text, fontFamily: "Menlo", lineHeight: 16 },
  });
}
