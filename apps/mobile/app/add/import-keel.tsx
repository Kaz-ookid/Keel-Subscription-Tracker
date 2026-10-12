// "Keel reads it for you", the typed-text way in (PROJECT_BRIEF §6.1): a
// rough list goes to Apple's Private Cloud Compute model and comes back
// through the exact same parse + review pipeline as the bring-your-own-AI
// path. The hub's panel is the only door here: it has already checked
// availability, connection and consent and carries the one explanation and
// the privacy line, so this screen is just the box. A read that still
// fails (offline, allowance, service) says so in place and points at the
// user's own AI, one step back.

import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Button } from "../../src/components/ui/Button";
import { runKeelRead, type KeelReadOutcome } from "../../src/lib/keel-read-flow";
import { useLockedRedirect } from "../../src/lib/lock-gate";
import { useAppData } from "../../src/state/app-state";
import { useImportSession } from "../../src/state/import-session";
import {
  radius,
  spacing,
  typography,
  useStyles,
  useTheme,
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
  // The typed path never hits it, but the failure union is shared.
  "image-unreadable": "keelReads.errImage",
};

export default function KeelReadsImportScreen() {
  // Write screen: a locked mount bounces to the locked sheet (deep links
  // and stale stacks included).
  const locked = useLockedRedirect();
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const { items, accounts, categories, displayCurrency } = useAppData();
  const { startSession } = useImportSession();

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReadError | null>(null);

  const read = async (material: string) => {
    setBusy(true);
    setError(null);
    const outcome = await runKeelRead(material, { displayCurrency, items, accounts, categories });
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }
    startSession(outcome.drafts, outcome.skipped, "ondevice_import");
    router.push("/add/import-review");
  };

  if (locked) return null;
  return (
    <ScrollView
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Stack.Screen options={{ title: t("keelReads.methodText") }} />

      <View style={styles.card}>
        <Text style={styles.hint}>{t("keelReads.hint")}</Text>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={(next) => {
            setText(next);
            if (error) setError(null);
          }}
          placeholder={t("keelReads.inputPlaceholder")}
          placeholderTextColor={colors.mutedText}
          multiline
          autoCorrect={false}
          autoCapitalize="none"
        />
        {error && <Text style={styles.error}>{t(ERROR_KEYS[error])}</Text>}
        {error && error !== "no-json" && error !== "empty" && error !== "model-failed" && (
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text style={styles.link}>{t("keelReads.ownAi")}</Text>
          </Pressable>
        )}
        {busy ? (
          <View style={styles.busyRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.busyText}>{t("keelReads.reading")}</Text>
          </View>
        ) : (
          <Button
            icon="sparkles"
            label={t("importAI.read")}
            onPress={() => void read(text.trim())}
            disabled={text.trim() === ""}
          />
        )}
      </View>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: "transparent" },
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
    card: {
      backgroundColor: colors.material,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: radius.xl,
      padding: spacing.md,
      gap: spacing.md,
    },
    hint: { ...typography.caption, color: colors.mutedText },
    input: {
      minHeight: 140,
      maxHeight: 280,
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
    link: { ...typography.caption, fontWeight: "600", color: colors.accent },
  });
}
