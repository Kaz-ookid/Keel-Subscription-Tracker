// "Keel reads it for you", as a page of the import hub: not a form, a LIST
// of ways in. Each way is its own one-shot flow (screenshots → preview,
// documents → preview, typed text → its screen); nothing stacks. Before
// anything can be sent the page asks for consent in place (ai-cloud.ts),
// and where the cloud model cannot run it says which wall and offers the
// bring-your-own page instead.

import { useNetworkState } from "expo-network";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { type ComponentProps, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { AiHero } from "../ai/AiHero";
import { AiNotice, AiNoticeLink } from "../ai/AiNotice";
import { AiPrivacyLine } from "../ai/AiPrivacyLine";
import { AiUnavailableNotice } from "../ai/AiUnavailableNotice";
import { Button } from "../ui/Button";

import { setAiCloudConsent, useAiCloudConsent } from "../../lib/ai-cloud";
import { keelReadsAvailability, type KeelReadsAvailability } from "../../lib/apple-intelligence";
import { stageDocuments, stageScreenshots } from "../../lib/keel-material";
import {
  radius,
  spacing,
  typography,
  useStyles,
  useTheme,
  withAlpha,
  type ThemeColors,
} from "../../theme";

type Busy = "screenshots" | "documents" | null;

export function KeelReadsPanel({ onUseOwnAi }: { onUseOwnAi: () => void }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const consented = useAiCloudConsent();
  // No connection, no door: better a plain word here than a timeout later.
  // Only an explicit "no" counts; an unknown state must not block anyone.
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;

  const [availability, setAvailability] = useState<KeelReadsAvailability | "checking">("checking");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<"screenshots" | "documents" | null>(null);

  useEffect(() => {
    void keelReadsAvailability().then(setAvailability);
  }, []);

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

  if (availability === "checking") return <AiNotice busy />;

  if (availability !== "available") {
    return <AiUnavailableNotice availability={availability} onUseOwnAi={onUseOwnAi} />;
  }

  if (offline) {
    return (
      <AiNotice
        icon="wifi.slash"
        tint={colors.mutedText}
        title={t("keelReads.offlineTitle")}
        body={t("keelReads.offlineBody")}
      >
        <AiNoticeLink label={t("keelReads.ownAi")} onPress={onUseOwnAi} />
      </AiNotice>
    );
  }

  if (!consented) {
    return (
      <AiNotice
        icon="cloud.fill"
        title={t("keelReads.consentTitle")}
        body={t("keelReads.consentBody")}
      >
        <Button
          icon="checkmark"
          label={t("keelReads.consentGo")}
          onPress={() => setAiCloudConsent(true)}
          style={styles.consentButton}
        />
        <AiNoticeLink label={t("keelReads.consentAlt")} onPress={onUseOwnAi} />
      </AiNotice>
    );
  }

  return (
    <View style={styles.stack}>
      <AiHero text={t("keelReads.hero")} />

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

      <AiPrivacyLine text={t("keelReads.privacy")} />
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
    consentButton: { alignSelf: "stretch", marginTop: spacing.sm },
  });
}
