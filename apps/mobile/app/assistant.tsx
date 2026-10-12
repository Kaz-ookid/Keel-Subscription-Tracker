// The assistant: describe what changed in plain words and the on-device model
// turns it into a typed plan — pause this, move that, add the new one. The
// model NEVER touches data: core resolves and validates its reply, and every
// operation goes through the review screen before anything is applied.
// Availability follows the same probe as the on-device import; in Expo Go the
// screen explains itself instead of working.

import { parseAssistantPlan, today } from "@keel/core";
import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AiHero } from "../src/components/ai/AiHero";
import { AiNotice } from "../src/components/ai/AiNotice";
import { AiPrivacyLine } from "../src/components/ai/AiPrivacyLine";
import { AiUnavailableNotice } from "../src/components/ai/AiUnavailableNotice";
import { Button } from "../src/components/ui/Button";
import {
  assistWithKeel,
  keelReadsAvailability,
  type KeelReadsAvailability,
} from "../src/lib/apple-intelligence";
import { useAppData } from "../src/state/app-state";
import { useAssistantSession } from "../src/state/assistant-session";
import { radius, spacing, type ThemeColors, typography, useStyles, useTheme } from "../src/theme";

import { useLockedRedirect } from "../src/lib/lock-gate";
type AssistError = "model-failed" | "no-json" | "empty";

export default function AssistantScreen() {
  // Write screen: a locked mount bounces to the locked sheet (deep links
  // and stale stacks included).
  const locked = useLockedRedirect();
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const { items, accounts, categories, displayCurrency } = useAppData();
  const { startPlan } = useAssistantSession();

  const [availability, setAvailability] = useState<KeelReadsAvailability | "checking">("checking");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AssistError | null>(null);

  useEffect(() => {
    void keelReadsAvailability().then(setAvailability);
  }, []);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const raw = await assistWithKeel(text.trim(), {
        items,
        accounts,
        today: today(),
        defaultCurrency: displayCurrency,
      });
      const plan = parseAssistantPlan(raw, {
        items,
        accounts,
        categories,
        defaultCurrency: displayCurrency,
        today: today(),
        takenNames: items.map((i) => i.name),
      });
      if (plan.error) {
        setError(plan.error);
        return;
      }
      startPlan(plan);
      router.push("/assistant-review");
    } catch {
      setError("model-failed");
    } finally {
      setBusy(false);
    }
  };

  if (locked) return null;
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      contentInsetAdjustmentBehavior="automatic"
    >
      <Stack.Screen options={{ title: "" }} />
      <Text style={styles.largeTitle}>{t("assistant.title")}</Text>

      {availability === "checking" && <AiNotice busy />}

      {availability === "available" && (
        <>
          <AiHero text={t("assistant.hero")} />

          <View style={styles.card}>
            <Text style={styles.hint}>{t("assistant.hint")}</Text>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={(next) => {
                setText(next);
                if (error) setError(null);
              }}
              placeholder={t("assistant.placeholder")}
              placeholderTextColor={colors.mutedText}
              multiline
            />
            {error && (
              <Text style={styles.error}>
                {t(error === "model-failed" ? "assistant.errModel" : "assistant.errEmpty")}
              </Text>
            )}
            {busy ? (
              <View style={styles.busyRow}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.busyText}>{t("assistant.thinking")}</Text>
              </View>
            ) : (
              <Button
                icon="sparkles"
                label={t("assistant.go")}
                onPress={() => void run()}
                disabled={text.trim() === ""}
              />
            )}
          </View>

          <AiPrivacyLine text={t("assistant.safety")} />
        </>
      )}

      {availability !== "checking" && availability !== "available" && (
        <AiUnavailableNotice availability={availability} />
      )}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: "transparent" },
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
    largeTitle: { fontSize: 34, fontWeight: "700", color: colors.text },
    card: {
      backgroundColor: colors.material,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: radius.xl,
      padding: spacing.md,
      gap: spacing.md,
    },
    hint: { ...typography.caption, color: colors.mutedText, lineHeight: 18 },
    input: {
      minHeight: 120,
      maxHeight: 260,
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
  });
}
