// The reader lab (dev builds only, behind the debug drawer): the cloud
// reader run by hand on the product's exact path, with what the review
// screen cannot show, the RAW answer the model gave before the parser
// filled anything, plus a fixture set scored in one tap. A prompt or schema
// change is judged here, on evidence, never on review cards.

import { today } from "@keel/core";
import * as Clipboard from "expo-clipboard";
import { Stack } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { Button } from "../src/components/ui/Button";
import { runKeelRead, type KeelReadOptions } from "../src/lib/keel-read-flow";
import { buildYesterdayPrompt } from "../src/lib/reader-lab-prompts";
import { READER_FIXTURES, scoreFixture, type FixtureScore } from "../src/lib/reader-fixtures";
import { useAppData } from "../src/state/app-state";
import { radius, spacing, typography, useStyles, useTheme, type ThemeColors } from "../src/theme";

// The variants: today's prompt and the one of the 11th (before the
// document rules). One variant per tap: the cloud quota is per user and
// a fixture pass is a dozen reads, so a run has to be chosen.
const VARIANTS: { tag: string; options: KeelReadOptions }[] = [
  { tag: "current", options: {} },
  { tag: "yesterday", options: { instructions: (c) => buildYesterdayPrompt(c.today) } },
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
  const [scores, setScores] = useState<(FixtureScore & { raw: string })[]>([]);

  // The product's exact path, sections, condensing and the line reader
  // included: what the review screen would show, plus the raw answers.
  const runOne = async (): Promise<RunResult> => {
    const label = "the product path";
    const started = Date.now();
    const outcome = await runKeelRead(material, {
      displayCurrency,
      items: [],
      accounts,
      categories,
    });
    const ms = Date.now() - started;
    if (!outcome.ok) {
      return { label, meta: `failed after ${ms} ms`, summary: `failed: ${outcome.error}`, raw: "" };
    }
    const lines = outcome.drafts.map((d) => {
      const assumed = d.assumedFields.length ? ` · defaults: ${d.assumedFields.join(", ")}` : "";
      const uncertain = d.uncertainFields.length
        ? ` · uncertain: ${d.uncertainFields.join(", ")}`
        : "";
      const warnings = d.warnings.length
        ? ` · warn: ${d.warnings.map((w) => w.code).join(", ")}`
        : "";
      return `- ${d.input.name}${assumed}${uncertain}${warnings}`;
    });
    const raw = outcome.raw
      .map((json) => {
        try {
          return JSON.stringify(JSON.parse(json), null, 2);
        } catch {
          return json;
        }
      })
      .join("\n");
    return {
      label,
      meta: `${outcome.raw.length} read(s) · ${ms} ms`,
      summary: `${outcome.drafts.length} items, ${outcome.skipped} skipped${outcome.skippedNames.length ? ` (${outcome.skippedNames.join(", ")})` : ""}\n${lines.join("\n")}`,
      raw,
    };
  };

  const runAll = async () => {
    setResults([]);
    setBusy("reading…");
    setResults([await runOne()]);
    setBusy(null);
  };

  // The fixture set through one variant: one tap, one scorecard.
  const runFixtures = async (variant: (typeof VARIANTS)[number]) => {
    setScores([]);
    const collected: (FixtureScore & { raw: string })[] = [];
    for (const fixture of READER_FIXTURES) {
      setBusy(`${variant.tag} · ${fixture.id}…`);
      const id = `${variant.tag} · ${fixture.id}`;
      try {
        // The product's own path, sections and all.
        const outcome = await runKeelRead(
          fixture.material,
          { displayCurrency, items: [], accounts, categories },
          variant.options,
        );
        if (!outcome.ok) throw new Error(outcome.error);
        const score = scoreFixture(fixture, outcome);
        collected.push({ ...score, id, raw: outcome.raw.join("\n") });
      } catch (failure) {
        collected.push({
          id,
          passed: 0,
          landed: 0,
          total: fixture.expect.length,
          lines: [`  failed: ${failure instanceof Error ? failure.message : String(failure)}`],
          raw: "",
        });
      }
      setScores([...collected]);
    }
    setBusy(null);
  };

  const scorecard = () => {
    const tally = (tag: string) => {
      const mine = scores.filter((s) => s.id.startsWith(`${tag} · `));
      const total = mine.reduce((n, s) => n + s.total, 0);
      return `read ${mine.reduce((n, s) => n + s.passed, 0)}/${total}, lands right ${mine.reduce((n, s) => n + s.landed, 0)}/${total}`;
    };
    return [
      `## Reader fixtures · ${today()}`,
      ...VARIANTS.filter((v) => scores.some((s) => s.id.startsWith(`${v.tag} · `))).map(
        (v) => `${v.tag}: ${tally(v.tag)}`,
      ),
      ...scores.flatMap((s) => [
        "",
        `### ${s.id} · read ${s.passed}/${s.total} · lands right ${s.landed}/${s.total}`,
        ...s.lines,
        "",
        "Raw:",
        s.raw,
      ]),
      "",
    ].join("\n");
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
          label={busy ? "Running…" : "Run"}
          onPress={() => void runAll()}
          disabled={busy !== null || material.trim() === ""}
        />
      </View>
      <View style={styles.actions}>
        {VARIANTS.map((variant) => (
          <Button
            key={variant.tag}
            variant="secondary"
            icon="checklist"
            label={busy ? "Running…" : `${READER_FIXTURES.length} fixtures, ${variant.tag}`}
            onPress={() => void runFixtures(variant)}
            disabled={busy !== null}
          />
        ))}
      </View>
      {busy ? <Text style={styles.meta}>{busy}</Text> : null}
      {scores.map((s) => (
        <View key={s.id} style={styles.card}>
          <Text style={styles.cardTitle}>
            {s.id} · read {s.passed}/{s.total} · right {s.landed}/{s.total}
          </Text>
          <Text style={styles.mono} selectable>
            {s.lines.join("\n")}
          </Text>
        </View>
      ))}
      {scores.length === READER_FIXTURES.length && !busy ? (
        <Button
          icon="doc.on.doc"
          label="Copy the scorecard"
          onPress={() => void Clipboard.setStringAsync(scorecard())}
        />
      ) : null}
      {results.map((r) => (
        <View key={r.label} style={styles.card}>
          <Text style={styles.cardTitle}>{r.label}</Text>
          <Text style={styles.meta}>{r.meta}</Text>
          <Text style={styles.mono} selectable>
            {r.summary}
          </Text>
        </View>
      ))}
      {results.length > 0 && !busy ? (
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
