// The screenshot preview of "Keel reads it for you": what the phone read off
// the pictures, with the patterned personal details already removed and
// named (card numbers, emails, references...), editable so the user can
// strike anything else before a byte leaves the phone. The read itself is
// the shared pipeline; the review screen follows.

import { Stack, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { Button } from "../../src/components/ui/Button";
import { runKeelRead, type KeelReadOutcome } from "../../src/lib/keel-read-flow";
import { useLockedRedirect } from "../../src/lib/lock-gate";
import { useAppData } from "../../src/state/app-state";
import { useImportSession } from "../../src/state/import-session";
import { editKeelReadsDraftText, useKeelReadsDraft } from "../../src/state/keel-reads-draft";
import {
  radius,
  spacing,
  typography,
  useTheme,
  withAlpha,
  type ThemeColors,
} from "../../src/theme";

type ReadError = Extract<KeelReadOutcome, { ok: false }>["error"];

const ERROR_KEYS: Record<ReadError, string> = {
  "no-json": "importAI.errNoJson",
  empty: "importAI.errEmpty",
  offline: "keelReads.errOffline",
  quota: "keelReads.errQuota",
  service: "keelReads.errService",
  unavailable: "keelReads.errService",
  "model-failed": "keelReads.errModel",
  "image-unreadable": "keelReads.errImage",
};

const KIND_KEYS = {
  card: "keelReads.kindCard",
  email: "keelReads.kindEmail",
  iban: "keelReads.kindIban",
  phone: "keelReads.kindPhone",
  reference: "keelReads.kindReference",
  taxId: "keelReads.kindTaxId",
} as const;

export default function KeelReadsPreviewScreen() {
  const locked = useLockedRedirect();
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items, accounts, categories, displayCurrency } = useAppData();
  const { startSession } = useImportSession();
  const draft = useKeelReadsDraft();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReadError | null>(null);

  // Opened without a draft (a stale stack): nothing to preview, step back.
  useEffect(() => {
    if (!draft) router.back();
  }, [draft, router]);

  const read = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    const outcome = await runKeelRead(draft.text.trim(), {
      displayCurrency,
      items,
      accounts,
      categories,
    });
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }
    startSession(outcome.drafts, outcome.skipped, "ondevice_import");
    router.push("/add/import-review");
  };

  if (locked || !draft) return null;

  const removedKinds = (Object.keys(draft.removed) as (keyof typeof KIND_KEYS)[])
    .filter((kind) => (draft.removed[kind] ?? 0) > 0)
    .map((kind) => t(KIND_KEYS[kind]));

  return (
    <ScrollView
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Stack.Screen options={{ title: t("keelReads.previewTitle") }} />

      <View style={styles.heroCard}>
        <SymbolView name="eye" size={22} tintColor={colors.accent} />
        <Text style={styles.heroText}>
          {t("keelReads.previewHint", { count: draft.screenshots })}
        </Text>
      </View>

      {/* What the scrubber took out, by kind: the user knows what is
          already gone and what remains their call (names, addresses). */}
      <View style={styles.scrubCard}>
        <SymbolView name="lock.shield" size={16} tintColor={colors.tones.success} />
        <Text style={styles.scrubText}>
          {draft.count > 0
            ? t("keelReads.scrubbed", { count: draft.count, kinds: removedKinds.join(", ") })
            : t("keelReads.scrubbedNone")}
        </Text>
      </View>

      <View style={styles.card}>
        <TextInput
          style={styles.input}
          value={draft.text}
          onChangeText={(next) => {
            editKeelReadsDraftText(next);
            if (error) setError(null);
          }}
          multiline
          autoCorrect={false}
          autoCapitalize="none"
        />
        {error && <Text style={styles.error}>{t(ERROR_KEYS[error])}</Text>}
        {busy ? (
          <View style={styles.busyRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.busyText}>{t("keelReads.reading")}</Text>
          </View>
        ) : (
          <Button
            icon="sparkles"
            label={t("keelReads.readPreview")}
            onPress={() => void read()}
            disabled={draft.text.trim() === ""}
          />
        )}
      </View>

      <View style={styles.privacyRow}>
        <SymbolView name="lock.shield" size={14} tintColor={colors.mutedText} />
        <Text style={styles.privacyText}>{t("keelReads.privacy")}</Text>
      </View>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: "transparent" },
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
    heroCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: withAlpha(colors.accent, 0.12),
      borderWidth: 1,
      borderColor: withAlpha(colors.accent, 0.45),
      borderRadius: radius.xl,
      padding: spacing.md,
    },
    heroText: { ...typography.body, color: colors.text, flex: 1 },
    scrubCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
      backgroundColor: withAlpha(colors.tones.success, 0.1),
      borderWidth: 1,
      borderColor: withAlpha(colors.tones.success, 0.35),
      borderRadius: radius.xl,
      padding: spacing.md,
    },
    scrubText: { ...typography.caption, color: colors.text, flex: 1, lineHeight: 18 },
    card: {
      backgroundColor: colors.material,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: radius.xl,
      padding: spacing.md,
      gap: spacing.md,
    },
    input: {
      minHeight: 220,
      maxHeight: 420,
      padding: spacing.sm,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.hairline,
      ...typography.body,
      color: colors.text,
      textAlignVertical: "top",
    },
    error: { ...typography.caption, color: colors.tones.danger },
    busyRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      paddingVertical: spacing.sm,
    },
    busyText: { ...typography.label, color: colors.mutedText },
    privacyRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs + 2,
    },
    privacyText: { ...typography.caption, color: colors.mutedText, flex: 1 },
  });
}
