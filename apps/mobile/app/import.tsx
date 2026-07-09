// The AI-import hub (PROJECT_BRIEF §6.1, Path A — bring your own AI). Three
// calm steps: copy our generated instructions, hand them to the AI you already
// use together with rough notes or screenshots, paste its answer back. The
// answer is parsed tolerantly and everything lands on the review screen —
// nothing is saved here. The "Keel reads it for you" card previews the
// on-device path (coming later) without pretending it works today.

import { buildImportPrompt, parseImportDocument, today, type ImportParseError } from "@keel/core";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { InfoPopup } from "../src/components/InfoPopup";
import { Sheet } from "../src/components/Sheet";
import { useAppState } from "../src/state/app-state";
import { useImportSession } from "../src/state/import-session";
import { radius, spacing, tones, typography, useTheme, type ThemeColors } from "../src/theme";

type OpenPopup = "instructions" | "where" | "example" | "privacy" | null;
type PasteError = ImportParseError | "clipboard-empty";

export default function ImportScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { accounts, categories, displayCurrency } = useAppState();
  const { startSession } = useImportSession();

  const [pasted, setPasted] = useState("");
  // Pasting is the expected path (a Paste button, no keyboard); typing by
  // hand stays possible behind a quiet toggle so it can never block the UI.
  const [manualEntry, setManualEntry] = useState(false);
  const [error, setError] = useState<PasteError | null>(null);
  const [copied, setCopied] = useState(false);
  const [popup, setPopup] = useState<OpenPopup>(null);

  // Generated fresh on every use — the header encodes our data model and
  // "today", so a stale saved copy must never circulate (§6.1).
  const prompt = () => buildImportPrompt({ today: today(), defaultCurrency: displayCurrency });

  const copyInstructions = async () => {
    await Clipboard.setStringAsync(prompt());
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const keelComingSoon = () =>
    Alert.alert(t("importAI.methodKeel"), t("importAI.methodKeelMsg"), [
      { text: t("common.done") },
    ]);

  const parseAndGo = (text: string) => {
    const result = parseImportDocument(text, {
      defaultCurrency: displayCurrency,
      today: today(),
      accounts,
      categories,
    });
    if (result.drafts.length === 0) {
      setError(result.error ?? "empty");
      return;
    }
    setError(null);
    startSession(result.drafts, result.skipped);
    router.push("/import-review");
  };

  // One tap: read the clipboard and go straight to review. On failure the
  // pasted text stays visible in the preview so it's clear what came in.
  const pasteAnswer = async () => {
    const text = (await Clipboard.getStringAsync()).trim();
    if (!text) {
      setError("clipboard-empty");
      return;
    }
    setPasted(text);
    parseAndGo(text);
  };

  const clearPaste = () => {
    setPasted("");
    setError(null);
    setManualEntry(false);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      {/* The two delivery paths, as they'll eventually look side by side. */}
      <View style={styles.methods}>
        <View style={[styles.methodCard, styles.methodActive]}>
          <SymbolView
            name="person.crop.circle.badge.checkmark"
            size={22}
            tintColor={colors.accent}
          />
          <Text style={styles.methodTitle}>{t("importAI.methodOwn")}</Text>
          <Text style={styles.methodSub}>{t("importAI.methodOwnSub")}</Text>
        </View>
        <Pressable style={[styles.methodCard, styles.methodDisabled]} onPress={keelComingSoon}>
          <SymbolView name="sparkles" size={22} tintColor={colors.mutedText} />
          <Text style={[styles.methodTitle, styles.methodTitleDisabled]}>
            {t("importAI.methodKeel")}
          </Text>
          <View style={styles.soonPill}>
            <Text style={styles.soonText}>{t("importAI.methodKeelSoon")}</Text>
          </View>
        </Pressable>
      </View>

      {/* The three steps — short, numbered, nothing else on the main path. */}
      <View style={styles.card}>
        <StepRow n={1} text={t("importAI.step1")} styles={styles} />
        <View style={styles.stepActions}>
          <Pressable style={styles.copyButton} onPress={() => void copyInstructions()}>
            <SymbolView
              name={copied ? "checkmark" : "doc.on.doc"}
              size={15}
              tintColor={colors.white}
            />
            <Text style={styles.copyText}>
              {copied ? t("importAI.copied") : t("importAI.copy")}
            </Text>
          </Pressable>
          <Pressable onPress={() => setPopup("instructions")} hitSlop={8}>
            <Text style={styles.quietLink}>{t("importAI.viewInstructions")}</Text>
          </Pressable>
        </View>
        <StepRow n={2} text={t("importAI.step2")} styles={styles} divider />
        <View style={styles.linkRow}>
          <Pressable onPress={() => setPopup("where")} hitSlop={8}>
            <Text style={styles.quietLink}>{t("importAI.whereLink")}</Text>
          </Pressable>
          <Pressable onPress={() => setPopup("example")} hitSlop={8}>
            <Text style={styles.quietLink}>{t("importAI.exampleLink")}</Text>
          </Pressable>
        </View>
        <StepRow n={3} text={t("importAI.step3")} styles={styles} divider />
      </View>

      {/* The paste-back area: a Paste button first (no keyboard in the way);
          typing by hand stays available behind the quiet toggle. */}
      <View style={[styles.card, styles.pasteCard]}>
        {manualEntry && (
          <TextInput
            style={styles.paste}
            value={pasted}
            onChangeText={(text) => {
              setPasted(text);
              if (error) setError(null);
            }}
            placeholder={t("importAI.pastePlaceholder")}
            placeholderTextColor={colors.mutedText}
            multiline
            autoCorrect={false}
            autoCapitalize="none"
            autoFocus
          />
        )}
        {!manualEntry && pasted !== "" && (
          <Text style={styles.preview} numberOfLines={5}>
            {pasted}
          </Text>
        )}
        {error && (
          <Text style={styles.error}>
            {t(
              error === "clipboard-empty"
                ? "importAI.errClipboardEmpty"
                : error === "no-json"
                  ? "importAI.errNoJson"
                  : "importAI.errEmpty",
            )}
          </Text>
        )}
        {manualEntry ? (
          <Pressable
            style={[styles.readButton, pasted.trim() === "" && styles.readButtonDisabled]}
            disabled={pasted.trim() === ""}
            onPress={() => parseAndGo(pasted)}
          >
            <Text style={styles.readText}>{t("importAI.read")}</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.readButton} onPress={() => void pasteAnswer()}>
            <SymbolView name="doc.on.clipboard" size={16} tintColor={colors.white} />
            <Text style={styles.readText}>{t("importAI.pasteButton")}</Text>
          </Pressable>
        )}
        <View style={styles.pasteLinks}>
          {!manualEntry && (
            <Pressable onPress={() => setManualEntry(true)} hitSlop={8}>
              <Text style={styles.quietLink}>{t("importAI.typeManually")}</Text>
            </Pressable>
          )}
          {(pasted !== "" || manualEntry) && (
            <Pressable onPress={clearPaste} hitSlop={8}>
              <Text style={styles.quietLink}>{t("importAI.clear")}</Text>
            </Pressable>
          )}
        </View>
      </View>

      <Pressable onPress={() => setPopup("privacy")} hitSlop={8} style={styles.privacyLink}>
        <SymbolView name="lock.shield" size={14} tintColor={colors.mutedText} />
        <Text style={styles.quietLink}>{t("importAI.privacyLink")}</Text>
      </Pressable>

      <Sheet
        visible={popup === "instructions"}
        title={t("importAI.viewInstructionsTitle")}
        onClose={() => setPopup(null)}
      >
        <ScrollView contentContainerStyle={styles.sheetBody}>
          <Text style={styles.promptText}>{prompt()}</Text>
        </ScrollView>
      </Sheet>

      <InfoPopup
        visible={popup === "where"}
        title={t("importAI.whereTitle")}
        onClose={() => setPopup(null)}
      >
        <Text style={styles.sheetText}>{t("importAI.whereBody")}</Text>
      </InfoPopup>

      {/* Before/after: how rough the input can be, and what comes out. */}
      <InfoPopup
        visible={popup === "example"}
        title={t("importAI.exampleTitle")}
        onClose={() => setPopup(null)}
      >
        <Text style={styles.exampleLabel}>{t("importAI.exampleYouWrite")}</Text>
        <View style={styles.exampleBox}>
          <Text style={styles.exampleRough}>{t("importAI.exampleRough")}</Text>
        </View>
        <View style={styles.exampleArrow}>
          <SymbolView name="arrow.down" size={16} tintColor={colors.mutedText} />
        </View>
        <Text style={styles.exampleLabel}>{t("importAI.exampleYouGet")}</Text>
        <View style={styles.exampleResults}>
          {([1, 2, 3, 4] as const).map((n) => (
            <View key={n} style={styles.exampleRow}>
              <Text style={styles.exampleName}>{t(`importAI.example${n}Name`)}</Text>
              <Text style={styles.exampleSub}>{t(`importAI.example${n}Sub`)}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.exampleNote}>{t("importAI.exampleNote")}</Text>
      </InfoPopup>

      <InfoPopup
        visible={popup === "privacy"}
        title={t("importAI.privacyTitle")}
        onClose={() => setPopup(null)}
      >
        <Text style={styles.sheetText}>{t("importAI.privacyBody")}</Text>
      </InfoPopup>
    </ScrollView>
  );
}

function StepRow({
  n,
  text,
  styles,
  divider,
}: {
  n: number;
  text: string;
  styles: ReturnType<typeof createStyles>;
  divider?: boolean;
}) {
  return (
    <View style={[styles.step, divider && styles.stepDivider]}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepBadgeText}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
    methods: { flexDirection: "row", gap: spacing.sm },
    methodCard: {
      flex: 1,
      gap: spacing.xs,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
    },
    methodActive: { borderColor: colors.accent, borderWidth: 2 },
    methodDisabled: { opacity: 0.65 },
    methodTitle: { ...typography.label, color: colors.text },
    methodTitleDisabled: { color: colors.mutedText },
    methodSub: { ...typography.caption, color: colors.mutedText },
    soonPill: {
      alignSelf: "flex-start",
      backgroundColor: colors.background,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    soonText: { ...typography.caption, fontWeight: "600", color: colors.mutedText },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
    },
    step: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
      paddingTop: spacing.md,
    },
    stepDivider: {
      marginTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    stepBadge: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.navy,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 1,
    },
    stepBadgeText: { ...typography.caption, fontWeight: "700", color: colors.white },
    stepText: { ...typography.body, color: colors.text, flex: 1 },
    stepActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingTop: spacing.sm,
      paddingLeft: 22 + spacing.sm,
    },
    copyButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs + 2,
      backgroundColor: colors.navy,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    copyText: { ...typography.label, color: colors.white },
    quietLink: { ...typography.caption, color: colors.accent, fontWeight: "600" },
    linkRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.md,
      paddingTop: spacing.sm,
      paddingLeft: 22 + spacing.sm,
    },
    pasteCard: { paddingTop: spacing.md, gap: spacing.md },
    preview: {
      ...typography.caption,
      color: colors.mutedText,
      fontFamily: "Menlo",
      lineHeight: 16,
      padding: spacing.sm,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    pasteLinks: {
      flexDirection: "row",
      justifyContent: "center",
      gap: spacing.lg,
    },
    paste: {
      minHeight: 120,
      maxHeight: 240,
      padding: spacing.sm,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      ...typography.body,
      color: colors.text,
      textAlignVertical: "top",
    },
    error: { ...typography.caption, color: tones.danger },
    readButton: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.navy,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
    },
    readButtonDisabled: { opacity: 0.4 },
    readText: { ...typography.label, color: colors.white },
    privacyLink: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs + 2,
      paddingVertical: spacing.sm,
    },
    sheetBody: { padding: spacing.lg },
    sheetText: { ...typography.body, color: colors.text, lineHeight: 23 },
    promptText: { ...typography.caption, color: colors.text, fontFamily: "Menlo", lineHeight: 18 },
    exampleLabel: { ...typography.caption, fontWeight: "700", color: colors.mutedText },
    exampleBox: {
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      padding: spacing.md,
    },
    exampleRough: {
      ...typography.caption,
      color: colors.text,
      fontFamily: "Menlo",
      lineHeight: 18,
    },
    exampleArrow: { alignItems: "center" },
    exampleResults: { gap: spacing.sm },
    exampleRow: {
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      gap: 1,
    },
    exampleName: { ...typography.label, color: colors.text },
    exampleSub: { ...typography.caption, color: colors.mutedText },
    exampleNote: { ...typography.caption, color: colors.mutedText, lineHeight: 18 },
  });
}
