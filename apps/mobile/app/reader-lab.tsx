// The reader lab (dev builds only, behind the debug drawer): the cloud
// reader run by hand, with what we cannot see from the review screen, the
// RAW answer the model gave before the parser filled anything. Material in,
// a prompt variant (full or lean) and a schema variant (full or lean
// guides), the raw JSON and the parser's summary out, all copyable, so a
// prompt can be judged on evidence instead of on review cards.

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
import { SegmentedPills } from "../src/components/ui/SegmentedPills";
import { readWithInstructions } from "../src/lib/apple-intelligence";
import { useAppData } from "../src/state/app-state";
import { radius, spacing, typography, useStyles, useTheme, type ThemeColors } from "../src/theme";

type Variant = "full" | "lean";

export default function ReaderLabScreen() {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { accounts, categories, displayCurrency } = useAppData();
  const [material, setMaterial] = useState("");
  const [prompt, setPrompt] = useState<Variant>("full");
  const [schema, setSchema] = useState<Variant>("full");
  const [busy, setBusy] = useState(false);
  const [raw, setRaw] = useState("");
  const [summary, setSummary] = useState("");
  const [meta, setMeta] = useState("");

  const run = async () => {
    const defaultCurrency = detectCurrencyHint(material) ?? displayCurrency;
    const context = { today: today(), defaultCurrency };
    const instructions =
      prompt === "lean" ? buildKeelReadsPromptLean(context) : buildKeelReadsPrompt(context);
    setBusy(true);
    setRaw("");
    setSummary("");
    const started = Date.now();
    try {
      const json = await readWithInstructions(
        material,
        instructions,
        schema === "lean" ? "cloud-lean" : "cloud",
      );
      const ms = Date.now() - started;
      let pretty = json;
      try {
        pretty = JSON.stringify(JSON.parse(json), null, 2);
      } catch {
        // Not JSON: shown as is.
      }
      setRaw(pretty);
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
      setSummary(
        `${result.drafts.length} items, ${result.skipped} skipped${result.error ? `, error ${result.error}` : ""}\n${lines.join("\n")}`,
      );
      setMeta(
        `prompt ${prompt} (${instructions.length} chars) · schema ${schema} · material ${material.length} chars · ${ms} ms`,
      );
    } catch (failure) {
      setSummary(`failed: ${failure instanceof Error ? failure.message : String(failure)}`);
      setMeta(`prompt ${prompt} (${instructions.length} chars) · schema ${schema}`);
    } finally {
      setBusy(false);
    }
  };

  const copyReport = () =>
    void Clipboard.setStringAsync(
      `## Reader lab\n${meta}\n\n### Material\n${material}\n\n### Raw answer\n${raw}\n\n### Parsed\n${summary}\n`,
    );

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
      <View style={styles.row}>
        <Text style={styles.label}>Prompt</Text>
        <SegmentedPills
          options={[
            { value: "full", label: "Full" },
            { value: "lean", label: "Lean" },
          ]}
          value={prompt}
          onChange={setPrompt}
          style={styles.pills}
        />
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Schema</Text>
        <SegmentedPills
          options={[
            { value: "full", label: "Full guides" },
            { value: "lean", label: "Lean guides" },
          ]}
          value={schema}
          onChange={setSchema}
          style={styles.pills}
        />
      </View>
      <View style={styles.actions}>
        <Button
          variant="secondary"
          icon="doc.on.clipboard"
          label="Paste"
          onPress={() => void Clipboard.getStringAsync().then(setMaterial)}
        />
        <Button
          icon="sparkles"
          label={busy ? "Reading…" : "Run"}
          onPress={() => void run()}
          disabled={busy || material.trim() === ""}
        />
      </View>
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      {summary ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Parsed</Text>
          <Text style={styles.mono} selectable>
            {summary}
          </Text>
        </View>
      ) : null}
      {raw ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Raw answer</Text>
          <Text style={styles.mono} selectable>
            {raw}
          </Text>
        </View>
      ) : null}
      {raw || summary ? (
        <Button variant="secondary" icon="doc.on.doc" label="Copy report" onPress={copyReport} />
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
    row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    label: { ...typography.label, color: colors.text, width: 64 },
    pills: { flex: 1 },
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
