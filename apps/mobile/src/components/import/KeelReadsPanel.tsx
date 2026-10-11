// "Keel reads it for you", as a page of the import hub: not a form, a LIST
// of ways in. Each way is its own one-shot flow (screenshots → preview,
// documents → preview, typed text → its screen); nothing stacks. Before
// anything can be sent the page asks for consent in place (ai-cloud.ts),
// and where the cloud model cannot run it says which wall and offers the
// bring-your-own page instead. The allowance line at the bottom is the
// curious person's window: Apple's quota object as Apple describes it.

import { useNetworkState } from "expo-network";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { type ComponentProps, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { InfoDot } from "../InfoDot";
import { Button } from "../ui/Button";

import { setAiCloudConsent, useAiCloudConsent } from "../../lib/ai-cloud";
import {
  cloudQuotaInfo,
  keelReadsAvailability,
  type KeelReadsAvailability,
} from "../../lib/apple-intelligence";
import { stageDocuments, stageScreenshots } from "../../lib/keel-material";
import { radius, spacing, typography, useTheme, withAlpha, type ThemeColors } from "../../theme";

type Busy = "screenshots" | "documents" | null;

export function KeelReadsPanel({ onUseOwnAi }: { onUseOwnAi: () => void }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const consented = useAiCloudConsent();
  // No connection, no door: better a plain word here than a timeout later.
  // Only an explicit "no" counts; an unknown state must not block anyone.
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;

  const [availability, setAvailability] = useState<KeelReadsAvailability | "checking">("checking");
  const [quota, setQuota] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<"screenshots" | "documents" | null>(null);

  useEffect(() => {
    void keelReadsAvailability().then(setAvailability);
  }, []);
  useEffect(() => {
    if (availability === "available" && consented) void cloudQuotaInfo().then(setQuota);
  }, [availability, consented]);

  const run = async (kind: "screenshots" | "documents") => {
    setBusy(kind);
    setError(null);
    try {
      const outcome = kind === "screenshots" ? await stageScreenshots() : await stageDocuments();
      if (outcome.ok) router.push("/add/import-keel-preview");
      else if (outcome.error === "unreadable") setError(kind);
    } finally {
      setBusy(null);
    }
  };

  if (availability === "checking") {
    return (
      <View style={styles.centerCard}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (availability !== "available") {
    return (
      <View style={styles.centerCard}>
        <SymbolView name="sparkles" size={28} tintColor={colors.mutedText} />
        <Text style={styles.centerTitle}>{t("keelReads.unavailableTitle")}</Text>
        <Text style={styles.centerBody}>
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
            <Text style={styles.link}>{t("keelReads.openSettings")}</Text>
          </Pressable>
        )}
        <Pressable onPress={onUseOwnAi} hitSlop={8}>
          <Text style={styles.link}>{t("keelReads.ownAi")}</Text>
        </Pressable>
      </View>
    );
  }

  if (offline) {
    return (
      <View style={styles.centerCard}>
        <SymbolView name="wifi.slash" size={28} tintColor={colors.mutedText} />
        <Text style={styles.centerTitle}>{t("keelReads.offlineTitle")}</Text>
        <Text style={styles.centerBody}>{t("keelReads.offlineBody")}</Text>
        <Pressable onPress={onUseOwnAi} hitSlop={8}>
          <Text style={styles.link}>{t("keelReads.ownAi")}</Text>
        </Pressable>
      </View>
    );
  }

  if (!consented) {
    return (
      <View style={styles.centerCard}>
        <SymbolView name="cloud.fill" size={28} tintColor={colors.accent} />
        <Text style={styles.centerTitle}>{t("keelReads.consentTitle")}</Text>
        <Text style={styles.centerBody}>{t("keelReads.consentBody")}</Text>
        <Button
          icon="checkmark"
          label={t("keelReads.consentGo")}
          onPress={() => setAiCloudConsent(true)}
          style={styles.consentButton}
        />
        <Pressable onPress={onUseOwnAi} hitSlop={8}>
          <Text style={styles.link}>{t("keelReads.consentAlt")}</Text>
        </Pressable>
      </View>
    );
  }

  // Apple's quota object, field by field; failing fields, its description;
  // failing that, the honest "nothing reported". The (i) is always there.
  const quotaLines = Object.entries(quota)
    .filter(([key]) => key !== "description")
    .map(([key, value]) => `${key}: ${value}`);
  const quotaDetail = quotaLines.length > 0 ? quotaLines.join("\n") : quota.description;
  const quotaBody = quotaDetail
    ? `${t("keelReads.quotaInfoBody")}\n\n${quotaDetail}`
    : t("keelReads.quotaInfoNone");

  return (
    <View style={styles.stack}>
      <View style={styles.heroCard}>
        <SymbolView name="sparkles" size={22} tintColor={colors.accent} />
        <Text style={styles.heroText}>{t("keelReads.hero")}</Text>
      </View>

      <View style={styles.list}>
        <MethodRow
          icon="photo.on.rectangle"
          title={t("keelReads.methodScreenshots")}
          sub={t("keelReads.methodScreenshotsSub")}
          busy={busy === "screenshots"}
          disabled={busy !== null}
          onPress={() => void run("screenshots")}
          styles={styles}
          colors={colors}
          divider
        />
        <MethodRow
          icon="doc.text"
          title={t("keelReads.methodDocuments")}
          sub={t("keelReads.methodDocumentsSub")}
          busy={busy === "documents"}
          disabled={busy !== null}
          onPress={() => void run("documents")}
          styles={styles}
          colors={colors}
          divider
        />
        <MethodRow
          icon="text.cursor"
          title={t("keelReads.methodText")}
          sub={t("keelReads.methodTextSub")}
          busy={false}
          disabled={busy !== null}
          onPress={() => router.push("/add/import-keel")}
          styles={styles}
          colors={colors}
        />
      </View>
      {error && (
        <Text style={styles.error}>
          {t(error === "screenshots" ? "keelReads.errImage" : "keelReads.errDocument")}
        </Text>
      )}

      <View style={styles.footRow}>
        <SymbolView name="lock.shield" size={14} tintColor={colors.mutedText} />
        <Text style={styles.footText}>{t("keelReads.privacy")}</Text>
      </View>
      {/* The allowance, for the curious only: a quiet line plus an (i)
          that shows Apple's quota object as Apple describes it. */}
      <View style={styles.footRow}>
        <Text style={styles.footText}>{t("keelReads.quotaLabel")}</Text>
        <InfoDot title={t("keelReads.quotaInfoTitle")} body={quotaBody} />
      </View>
    </View>
  );
}

function MethodRow({
  icon,
  title,
  sub,
  busy,
  disabled,
  onPress,
  styles,
  colors,
  divider,
}: {
  icon: ComponentProps<typeof SymbolView>["name"];
  title: string;
  sub: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  divider?: boolean;
}) {
  return (
    <Pressable
      style={[styles.row, divider && styles.rowDivider, disabled && !busy && styles.rowDim]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
    >
      <View style={styles.rowIcon}>
        <SymbolView name={icon} size={18} tintColor={colors.accent} />
      </View>
      <View style={styles.rowTexts}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{sub}</Text>
      </View>
      {busy ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
      )}
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    stack: { gap: spacing.md },
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
    list: {
      backgroundColor: colors.material,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: radius.xl,
      paddingHorizontal: spacing.md,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.md,
    },
    rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
    rowDim: { opacity: 0.5 },
    rowIcon: {
      width: 36,
      height: 36,
      borderRadius: radius.sm,
      backgroundColor: withAlpha(colors.accent, 0.12),
      alignItems: "center",
      justifyContent: "center",
    },
    rowTexts: { flex: 1, gap: 2 },
    rowTitle: { ...typography.label, color: colors.text },
    rowSub: { ...typography.caption, color: colors.mutedText, lineHeight: 17 },
    error: { ...typography.caption, color: colors.tones.danger, textAlign: "center" },
    footRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs + 2,
    },
    footText: { ...typography.caption, color: colors.mutedText, flexShrink: 1 },
    centerCard: {
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.material,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: radius.xl,
      padding: spacing.xl,
      marginTop: spacing.md,
    },
    centerTitle: { ...typography.label, color: colors.text, textAlign: "center" },
    centerBody: {
      ...typography.caption,
      color: colors.mutedText,
      textAlign: "center",
      lineHeight: 18,
    },
    consentButton: { alignSelf: "stretch", marginTop: spacing.sm },
    link: { ...typography.caption, fontWeight: "600", color: colors.accent },
  });
}
