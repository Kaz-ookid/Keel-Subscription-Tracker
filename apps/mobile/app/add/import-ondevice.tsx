// "Keel reads it for you" (PROJECT_BRIEF §6.1 Path C/D): the AI import run by
// the ON-DEVICE Apple Intelligence model. Free, private, offline; the answer
// goes through the exact same parse + review pipeline as the
// bring-your-own-AI path. Linked from the import hub and the AI tab; in Expo
// Go the availability probe reports unavailable and this screen explains
// itself instead of working (the native module needs the dev build).
// Wiring steps: modules/apple-intelligence/README.md.

import { parseImportDocument, today, type ImportParseError } from "@keel/core";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
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

import { ModalClose } from "../../src/components/ModalClose";
import { Button } from "../../src/components/ui/Button";
import {
  onDeviceAvailability,
  parseOnDevice,
  resolveEngine,
  type OnDeviceAvailability,
} from "../../src/lib/apple-intelligence";
import { confirmLocalFallback } from "../../src/lib/ai-fallback";
import { consumeAiRead, useEntitlement } from "../../src/lib/entitlement";
import { useAppData } from "../../src/state/app-state";
import { useImportSession } from "../../src/state/import-session";
import {
  radius,
  spacing,
  typography,
  useTheme,
  withAlpha,
  type ThemeColors,
} from "../../src/theme";

type ReadError = ImportParseError | "model-failed";

export default function OnDeviceImportScreen() {
  const router = useRouter();
  // The AI tab opens this directly (?direct=1): it is then the sheet's first
  // screen and needs its own leave affordance, like the import hub.
  const { direct } = useLocalSearchParams<{ direct?: string }>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items, accounts, categories, displayCurrency } = useAppData();
  const { startSession } = useImportSession();

  const [availability, setAvailability] = useState<OnDeviceAvailability | "checking">("checking");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReadError | null>(null);
  // Same meter as the bring-your-own-AI path: two free reads, success-only.
  const { loaded, full, readsLeft } = useEntitlement();

  useEffect(() => {
    void onDeviceAvailability().then(setAvailability);
  }, []);

  const read = async () => {
    // Out of free reads: the button becomes the door to Full Keel.
    if (loaded && !full && readsLeft <= 0) {
      router.push("/fullkeel");
      return;
    }
    // Which engine can actually run, and does the user accept a weaker
    // answer? Asked BEFORE anything is generated, never after.
    const chosen = await resolveEngine();
    if (chosen.fellBack && !(await confirmLocalFallback())) return;
    setBusy(true);
    setError(null);
    try {
      const { json, ranOn } = await parseOnDevice(
        text.trim(),
        { today: today(), defaultCurrency: displayCurrency },
        chosen,
      );
      const result = parseImportDocument(json, {
        defaultCurrency: displayCurrency,
        today: today(),
        accounts,
        categories,
        takenNames: items.map((i) => i.name),
      });
      if (result.drafts.length === 0) {
        setError(result.error ?? "empty");
        return;
      }
      // Only the cloud engine spends a read: the on-device model is free and
      // unlimited, so a weaker answer never costs the user anything.
      if (ranOn === "cloud") void consumeAiRead();
      startSession(result.drafts, result.skipped, "ondevice_import");
      router.push("/add/import-review");
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
    >
      <Stack.Screen
        options={{
          title: t("importAI.methodKeel"),
          ...(direct ? { headerLeft: () => <ModalClose /> } : null),
        }}
      />

      {availability === "checking" && (
        <View style={styles.centerCard}>
          <ActivityIndicator color={colors.accent} />
        </View>
      )}

      {availability === "available" && (
        <>
          {/* The whole pitch in one quiet line: no accounts, no upload. */}
          <View style={styles.heroCard}>
            <SymbolView name="sparkles" size={22} tintColor={colors.accent} />
            <Text style={styles.heroText}>{t("onDevice.hero")}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.hint}>{t("onDevice.hint")}</Text>
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
              placeholder={t("onDevice.inputPlaceholder")}
              placeholderTextColor={colors.mutedText}
              multiline
              autoCorrect={false}
              autoCapitalize="none"
            />
            {error && (
              <Text style={styles.error}>
                {t(
                  error === "model-failed"
                    ? "onDevice.errModel"
                    : error === "no-json"
                      ? "importAI.errNoJson"
                      : "importAI.errEmpty",
                )}
              </Text>
            )}
            {busy ? (
              <View style={styles.busyRow}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.busyText}>{t("onDevice.reading")}</Text>
              </View>
            ) : (
              <Button
                icon="sparkles"
                label={t("importAI.read")}
                onPress={() => void read()}
                disabled={text.trim() === ""}
              />
            )}
          </View>

          <View style={styles.privacyRow}>
            <SymbolView name="lock.shield" size={14} tintColor={colors.mutedText} />
            <Text style={styles.privacyText}>{t("onDevice.privacy")}</Text>
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
    screen: { flex: 1, backgroundColor: colors.background },
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
