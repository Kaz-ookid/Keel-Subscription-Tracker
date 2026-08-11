// About Keel: the whole "maker ↔ user" relationship on ONE screen, instead
// of the four-tab sprawl the category norm is (support / participate /
// roadmap / about, each hiding the same email). Hello from the maker, two
// ways to write in, rate & share (only once the App Store listing exists),
// and the real legal texts. Everything else is deliberately absent: no
// roadmap, no beta, no translation program until they exist.

import Constants from "expo-constants";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text } from "react-native";

import { APP_STORE_ID, SUPPORT_EMAIL, WEBSITE_URL } from "../src/constants";
import { InfoPopup } from "../src/components/InfoPopup";
import { IconChip } from "../src/components/ui/IconChip";
import { Card } from "../src/components/ui/Card";
import { spacing, typography, useTheme, type ThemeColors } from "../src/theme";

const CHIP = {
  bug: "#FF3B30",
  idea: "#FFCC00",
  web: "#007AFF",
  rate: "#FF9500",
  share: "#007AFF",
  privacy: "#8E8E93",
  terms: "#8E8E93",
} as const;

const APP_STORE_URL = APP_STORE_ID ? `https://apps.apple.com/app/id${APP_STORE_ID}` : null;

export default function AboutScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [popup, setPopup] = useState<"privacy" | "terms" | null>(null);

  const version = Constants.expoConfig?.version ?? "";
  // The bare host reads as the link itself, kept in sync with the constant.
  const websiteHost = WEBSITE_URL.replace(/^https?:\/\//, "");

  // Subject + a device line, so bug mails arrive ready to answer.
  const mail = (subject: string, withDetails: boolean) => {
    const body = withDetails
      ? `\n\n\n${t("about.mailDetails", { version, os: `iOS ${Platform.Version}` })}`
      : "";
    void Linking.openURL(
      `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    );
  };

  const shareApp = () => {
    if (!APP_STORE_URL) return;
    void Share.share({ message: `${t("about.shareMessage")} ${APP_STORE_URL}` });
  };

  const rate = () => {
    if (!APP_STORE_ID) return;
    void Linking.openURL(`itms-apps://itunes.apple.com/app/id${APP_STORE_ID}?action=write-review`);
  };

  const openWebsite = () => void Linking.openURL(WEBSITE_URL);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Text style={styles.largeTitle}>{t("about.title")}</Text>

      {/* The maker, in three sentences. */}
      <Card variant="free">
        <Text style={styles.helloTitle}>{t("about.helloTitle")}</Text>
        <Text style={styles.helloBody}>{t("about.helloBody")}</Text>
      </Card>

      {/* The name, as a dictionary entry — same quiet note as the website. */}
      <Card variant="free">
        <Text style={styles.nameDef}>
          <Text style={styles.nameWord}>keel</Text> <Text style={styles.namePron}>/kiːl/</Text>{" "}
          {t("about.nameDef")}
        </Text>
      </Card>

      {/* The public face: the marketing site, always available. */}
      <Text style={styles.groupLabel}>{t("about.groupWeb")}</Text>
      <Card>
        <Pressable style={styles.row} onPress={openWebsite}>
          <IconChip icon="globe" color={CHIP.web} />
          <Text style={styles.rowText}>{websiteHost}</Text>
          <SymbolView name="arrow.up.right" size={13} tintColor={colors.mutedText} />
        </Pressable>
      </Card>

      <Text style={styles.groupLabel}>{t("about.groupWrite")}</Text>
      <Card>
        <Pressable style={styles.row} onPress={() => mail(t("about.bugSubject"), true)}>
          <IconChip icon="ladybug.fill" color={CHIP.bug} />
          <Text style={styles.rowText}>{t("about.bug")}</Text>
          <SymbolView name="arrow.up.right" size={13} tintColor={colors.mutedText} />
        </Pressable>
        <Pressable
          style={[styles.row, styles.rowDivider]}
          onPress={() => mail(t("about.ideaSubject"), false)}
        >
          <IconChip icon="lightbulb.fill" color={CHIP.idea} />
          <Text style={styles.rowText}>{t("about.idea")}</Text>
          <SymbolView name="arrow.up.right" size={13} tintColor={colors.mutedText} />
        </Pressable>
        <Text style={styles.footnote}>{t("about.writeFooter", { email: SUPPORT_EMAIL })}</Text>
      </Card>

      {/* Only once the listing exists: never a dead or fake link. */}
      {APP_STORE_ID !== "" && (
        <>
          <Text style={styles.groupLabel}>{t("about.groupSupport")}</Text>
          <Card>
            <Pressable style={styles.row} onPress={rate}>
              <IconChip icon="star.fill" color={CHIP.rate} />
              <Text style={styles.rowText}>{t("about.rate")}</Text>
              <SymbolView name="arrow.up.right" size={13} tintColor={colors.mutedText} />
            </Pressable>
            <Pressable style={[styles.row, styles.rowDivider]} onPress={shareApp}>
              <IconChip icon="square.and.arrow.up" color={CHIP.share} />
              <Text style={styles.rowText}>{t("about.share")}</Text>
            </Pressable>
            <Text style={styles.footnote}>{t("about.supportFooter")}</Text>
          </Card>
        </>
      )}

      <Text style={styles.groupLabel}>{t("about.groupLegal")}</Text>
      <Card>
        <Pressable style={styles.row} onPress={() => setPopup("privacy")}>
          <IconChip icon="hand.raised.fill" color={CHIP.privacy} />
          <Text style={styles.rowText}>{t("about.privacy")}</Text>
          <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
        </Pressable>
        <Pressable style={[styles.row, styles.rowDivider]} onPress={() => setPopup("terms")}>
          <IconChip icon="doc.text.fill" color={CHIP.terms} />
          <Text style={styles.rowText}>{t("about.terms")}</Text>
          <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
        </Pressable>
      </Card>

      <Text style={styles.trademark}>{t("about.trademark")}</Text>
      <Text style={styles.version}>
        {t("about.thanks")}
        {"\n"}
        {version ? `${t("about.version")} ${version}` : ""}
      </Text>

      <InfoPopup
        visible={popup === "privacy"}
        title={t("about.privacy")}
        onClose={() => setPopup(null)}
        tall
      >
        <Text style={styles.legalText}>{t("about.privacyBody", { email: SUPPORT_EMAIL })}</Text>
      </InfoPopup>
      <InfoPopup
        visible={popup === "terms"}
        title={t("about.terms")}
        onClose={() => setPopup(null)}
        tall
      >
        <Text style={styles.legalText}>{t("about.termsBody", { email: SUPPORT_EMAIL })}</Text>
      </InfoPopup>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: "transparent" },
    content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
    largeTitle: { fontSize: 34, fontWeight: "700", color: colors.text },
    helloTitle: { ...typography.h1, color: colors.text, marginBottom: spacing.sm },
    helloBody: { ...typography.body, color: colors.mutedText, lineHeight: 23 },
    nameDef: { ...typography.body, color: colors.mutedText, lineHeight: 23 },
    nameWord: { fontWeight: "800", color: colors.accent },
    namePron: { fontStyle: "italic" },
    groupLabel: {
      ...typography.micro,
      color: colors.mutedText,
      marginBottom: -spacing.sm,
      paddingHorizontal: spacing.xs,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.md,
    },
    rowText: { ...typography.body, color: colors.text, flex: 1 },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    footnote: {
      ...typography.caption,
      color: colors.mutedText,
      paddingBottom: spacing.md,
      paddingTop: spacing.xs,
    },
    trademark: {
      ...typography.caption,
      color: colors.mutedText,
      textAlign: "center",
      lineHeight: 17,
      paddingHorizontal: spacing.sm,
    },
    version: {
      ...typography.caption,
      color: colors.mutedText,
      textAlign: "center",
      lineHeight: 18,
    },
    legalText: { ...typography.body, color: colors.text, lineHeight: 23 },
  });
}
