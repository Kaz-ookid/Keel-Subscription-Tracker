// "Keel reads it for you" (PROJECT_BRIEF §6.1): the AI import run by Apple's
// Private Cloud Compute model. The answer goes through the exact same parse
// + review pipeline as the bring-your-own-AI path. Sending anything is
// opt-in: the first visit asks in place (ai-cloud.ts keeps the choice,
// Settings keeps the switch). When the model cannot run, the screen says
// which wall it hit and points at the user's own AI; it never degrades to a
// weaker engine. Linked from the import hub; in Expo Go the availability
// probe reports unavailable and this screen explains itself.

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
import { setAiCloudConsent, useAiCloudConsent } from "../../src/lib/ai-cloud";
import {
  KeelReadsError,
  keelReadsAvailability,
  readWithKeel,
  type KeelReadsAvailability,
  type KeelReadsFailure,
} from "../../src/lib/apple-intelligence";
import { useLockedRedirect } from "../../src/lib/lock-gate";
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

type ReadError = ImportParseError | KeelReadsFailure;

const FAILURE_KEYS: Record<KeelReadsFailure, string> = {
  offline: "keelReads.errOffline",
  quota: "keelReads.errQuota",
  service: "keelReads.errService",
  unavailable: "keelReads.errService",
  "model-failed": "keelReads.errModel",
};

export default function KeelReadsImportScreen() {
  // Write screen: a locked mount bounces to the locked sheet (deep links
  // and stale stacks included).
  const locked = useLockedRedirect();
  const router = useRouter();
  // Opened directly (?direct=1), this is the sheet's first screen and needs
  // its own leave affordance, like the import hub.
  const { direct } = useLocalSearchParams<{ direct?: string }>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items, accounts, categories, displayCurrency } = useAppData();
  const { startSession } = useImportSession();
  const consented = useAiCloudConsent();

  const [availability, setAvailability] = useState<KeelReadsAvailability | "checking">("checking");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReadError | null>(null);

  useEffect(() => {
    void keelReadsAvailability().then(setAvailability);
  }, []);

  const read = async () => {
    setBusy(true);
    setError(null);
    try {
      const json = await readWithKeel(text.trim(), {
        today: today(),
        defaultCurrency: displayCurrency,
      });
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
      startSession(result.drafts, result.skipped, "ondevice_import");
      router.push("/add/import-review");
    } catch (failure) {
      setError(failure instanceof KeelReadsError ? failure.reason : "model-failed");
    } finally {
      setBusy(false);
    }
  };

  // The hub is one step back; from a direct open, it is a sibling push.
  const useOwnAi = () => (direct ? router.push("/add/import") : router.back());

  const errorKey = (which: ReadError): string =>
    which === "no-json"
      ? "importAI.errNoJson"
      : which === "empty"
        ? "importAI.errEmpty"
        : FAILURE_KEYS[which];

  if (locked) return null;
  return (
    <ScrollView
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
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

      {/* First visit: what leaves the phone, in Apple's terms, before any
          byte does. The choice is remembered (Settings keeps the switch). */}
      {availability === "available" && !consented && (
        <View style={styles.centerCard}>
          <SymbolView name="cloud.fill" size={28} tintColor={colors.accent} />
          <Text style={styles.consentTitle}>{t("keelReads.consentTitle")}</Text>
          <Text style={styles.consentBody}>{t("keelReads.consentBody")}</Text>
          <Button
            icon="checkmark"
            label={t("keelReads.consentGo")}
            onPress={() => setAiCloudConsent(true)}
            style={styles.consentButton}
          />
          <Pressable onPress={useOwnAi} hitSlop={8}>
            <Text style={styles.settingsLink}>{t("keelReads.consentAlt")}</Text>
          </Pressable>
        </View>
      )}

      {availability === "available" && consented && (
        <>
          <View style={styles.heroCard}>
            <SymbolView name="sparkles" size={22} tintColor={colors.accent} />
            <Text style={styles.heroText}>{t("keelReads.hero")}</Text>
          </View>

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
            {error && <Text style={styles.error}>{t(errorKey(error))}</Text>}
            {error && error !== "no-json" && error !== "empty" && error !== "model-failed" && (
              <Pressable onPress={useOwnAi} hitSlop={8}>
                <Text style={styles.settingsLink}>{t("keelReads.ownAi")}</Text>
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
                onPress={() => void read()}
                disabled={text.trim() === ""}
              />
            )}
          </View>

          <View style={styles.privacyRow}>
            <SymbolView name="lock.shield" size={14} tintColor={colors.mutedText} />
            <Text style={styles.privacyText}>{t("keelReads.privacy")}</Text>
          </View>
        </>
      )}

      {availability !== "checking" && availability !== "available" && (
        <View style={styles.centerCard}>
          <SymbolView name="sparkles" size={28} tintColor={colors.mutedText} />
          <Text style={styles.unavailableTitle}>{t("keelReads.unavailableTitle")}</Text>
          <Text style={styles.unavailableBody}>
            {t(
              availability === "unsupported-os"
                ? "keelReads.reasonOs"
                : availability === "device"
                  ? "keelReads.reasonDevice"
                  : availability === "disabled"
                    ? "keelReads.reasonDisabled"
                    : availability === "not-ready"
                      ? "keelReads.reasonNotReady"
                      : "keelReads.reasonBuild",
            )}
          </Text>
          {availability === "disabled" && (
            <Pressable onPress={() => void Linking.openSettings()} hitSlop={8}>
              <Text style={styles.settingsLink}>{t("keelReads.openSettings")}</Text>
            </Pressable>
          )}
          <Pressable onPress={useOwnAi} hitSlop={8}>
            <Text style={styles.settingsLink}>{t("keelReads.ownAi")}</Text>
          </Pressable>
        </View>
      )}
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
    privacyText: { ...typography.caption, color: colors.mutedText, flex: 1 },
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
    consentTitle: { ...typography.label, color: colors.text, textAlign: "center" },
    consentBody: {
      ...typography.caption,
      color: colors.mutedText,
      textAlign: "center",
      lineHeight: 18,
    },
    consentButton: { alignSelf: "stretch", marginTop: spacing.sm },
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
