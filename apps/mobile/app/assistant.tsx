// The assistant: describe what changed in plain words and the on-device model
// turns it into a typed plan — pause this, move that, add the new one. The
// model NEVER touches data: core resolves and validates its reply, and every
// operation goes through the review screen before anything is applied.
// Availability follows the same probe as the on-device import; in Expo Go the
// screen explains itself instead of working.

import { parseAssistantPlan, today } from "@keel/core";
import { Stack, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Button } from "../src/components/ui/Button";
import {
  assistOnDevice,
  onDeviceAvailability,
  resolveEngine,
  type OnDeviceAvailability,
} from "../src/lib/apple-intelligence";
import { confirmLocalFallback } from "../src/lib/ai-fallback";
import { consumeAiRead, useEntitlement } from "../src/lib/entitlement";
import { useAppData } from "../src/state/app-state";
import { useAssistantSession } from "../src/state/assistant-session";
import { radius, spacing, typography, useTheme, withAlpha, type ThemeColors } from "../src/theme";

type AssistError = "model-failed" | "no-json" | "empty";

export default function AssistantScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items, accounts, categories, displayCurrency } = useAppData();
  const { startPlan } = useAssistantSession();

  const [availability, setAvailability] = useState<OnDeviceAvailability | "checking">("checking");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AssistError | null>(null);
  // Same meter as the AI imports: two free reads, success-only.
  const { loaded, full, readsLeft } = useEntitlement();

  useEffect(() => {
    void onDeviceAvailability().then(setAvailability);
  }, []);

  const run = async () => {
    if (loaded && !full && readsLeft <= 0) {
      router.push("/fullkeel");
      return;
    }
    // Same contract as the import: warn before a weaker engine answers.
    const chosen = await resolveEngine();
    if (chosen.fellBack && !(await confirmLocalFallback())) return;
    setBusy(true);
    setError(null);
    try {
      const { json: raw, ranOn } = await assistOnDevice(
        text.trim(),
        { items, accounts, today: today(), defaultCurrency: displayCurrency },
        chosen,
      );
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
      // Only the cloud engine spends a read; the on-device model is free.
      if (ranOn === "cloud") void consumeAiRead();
      startPlan(plan);
      router.push("/assistant-review");
    } catch {
      setError("model-failed");
    } finally {
      setBusy(false);
    }
  };

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

      {availability === "checking" && (
        <View style={styles.centerCard}>
          <ActivityIndicator color={colors.accent} />
        </View>
      )}

      {availability === "available" && (
        <>
          <View style={styles.heroCard}>
            <SymbolView name="sparkles" size={22} tintColor={colors.accent} />
            <Text style={styles.heroText}>{t("assistant.hero")}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.hint}>{t("assistant.hint")}</Text>
            {loaded && !full && (
              <Text style={styles.hint}>
                {readsLeft > 0
                  ? `${t("importAI.readsLeft", { count: readsLeft })} · ${t("importAI.readsHint")}`
                  : t("importAI.readsOut")}
              </Text>
            )}
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

          <View style={styles.privacyRow}>
            <SymbolView name="lock.shield" size={14} tintColor={colors.mutedText} />
            <Text style={styles.privacyText}>{t("assistant.safety")}</Text>
          </View>
        </>
      )}

      {availability !== "checking" && availability !== "available" && (
        <View style={styles.centerCard}>
          <SymbolView name="sparkles" size={28} tintColor={colors.mutedText} />
          <Text style={styles.unavailableTitle}>{t("onDevice.unavailableTitle")}</Text>
          <Text style={styles.unavailableBody}>
            {t(
              availability === "unsupported-os"
                ? "onDevice.reasonOs"
                : availability === "device"
                  ? "onDevice.reasonDevice"
                  : availability === "disabled"
                    ? "onDevice.reasonDisabled"
                    : availability === "not-ready"
                      ? "onDevice.reasonNotReady"
                      : "onDevice.reasonBuild",
            )}
          </Text>
          {availability === "disabled" && (
            <Pressable onPress={() => void Linking.openSettings()} hitSlop={8}>
              <Text style={styles.settingsLink}>{t("onDevice.openSettings")}</Text>
            </Pressable>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: "transparent" },
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
    largeTitle: { fontSize: 34, fontWeight: "700", color: colors.text },
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
    privacyRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs + 2,
    },
    privacyText: { ...typography.caption, color: colors.mutedText },
    centerCard: {
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.material,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: radius.xl,
      padding: spacing.xl,
      marginTop: spacing.xl,
    },
    unavailableTitle: { ...typography.label, color: colors.text, textAlign: "center" },
    unavailableBody: {
      ...typography.caption,
      color: colors.mutedText,
      textAlign: "center",
      lineHeight: 18,
    },
    settingsLink: { ...typography.caption, fontWeight: "600", color: colors.accent },
  });
}
