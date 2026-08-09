// The one-time "load brand logos?" choice (SEC-1). Shown the first time a
// logo-bearing surface appears (the brand bank, the AI review). It states the
// trade-off plainly — a real logo is a small web request, an initial is drawn
// on-device — without dramatising it, and shows both side by side so the choice
// is visual, not abstract.
//
// The preview fetches Google's own icon to demonstrate the "real logo" look.
// That is the single request this screen makes; it is Google's mark, identical
// for every user, and carries nothing about what the user tracks — so it does
// not undercut the offline promise the OTHER option makes.

import { Image } from "expo-image";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

import { logoUrl } from "../lib/logos";
import { radius, spacing, typography, useTheme, type ThemeColors } from "../theme";
import { InfoPopup } from "./InfoPopup";
import { Button } from "./ui/Button";

// A recognisable brand for the demo only — Google's blue behind the initial so
// the two previews read as the same brand, one real and one drawn.
const SAMPLE_DOMAIN = "google.com";
const SAMPLE_LETTER = "G";
const SAMPLE_COLOR = "#4285F4";

interface Props {
  visible: boolean;
  onChoose: (enabled: boolean) => void;
  /** Dismiss without choosing — stays "unset", so the prompt returns later. */
  onDismiss: () => void;
}

export function LogoConsentSheet({ visible, onChoose, onDismiss }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const badge = 52;

  return (
    <InfoPopup visible={visible} title={t("logos.title")} onClose={onDismiss}>
      <Text style={styles.body}>{t("logos.body")}</Text>

      <View style={styles.previews}>
        <View style={styles.preview}>
          <Image
            // Only fetch once the sheet is actually presented — a hidden Modal
            // must not reach the network before the user has even seen it.
            source={visible ? { uri: logoUrl(SAMPLE_DOMAIN) } : undefined}
            cachePolicy="disk"
            style={{
              width: badge,
              height: badge,
              borderRadius: badge / 2,
              // The plate is genuinely white (logos expect it); the hairline
              // keeps it visible on the light scheme's near-white well.
              backgroundColor: colors.white,
              borderWidth: 1,
              borderColor: colors.hairline,
            }}
            contentFit="cover"
          />
          <Text style={styles.previewLabel}>{t("logos.previewWebLabel")}</Text>
          <Text style={styles.previewCaption}>{t("logos.previewWebCaption")}</Text>
        </View>

        <View style={styles.preview}>
          <View
            style={[
              styles.monogram,
              {
                width: badge,
                height: badge,
                borderRadius: badge / 2,
                backgroundColor: SAMPLE_COLOR,
              },
            ]}
          >
            <Text style={[styles.monogramLetter, { fontSize: Math.round(badge * 0.45) }]}>
              {SAMPLE_LETTER}
            </Text>
          </View>
          <Text style={styles.previewLabel}>{t("logos.previewOfflineLabel")}</Text>
          <Text style={styles.previewCaption}>{t("logos.previewOfflineCaption")}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Button label={t("logos.enable")} onPress={() => onChoose(true)} />
        <Button
          label={t("logos.keepOffline")}
          variant="secondary"
          onPress={() => onChoose(false)}
        />
      </View>
      <Text style={styles.note}>{t("logos.changeLater")}</Text>
    </InfoPopup>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    body: {
      ...typography.body,
      color: colors.text,
      lineHeight: 22,
    },
    previews: {
      flexDirection: "row",
      gap: spacing.md,
    },
    preview: {
      flex: 1,
      alignItems: "center",
      gap: spacing.xs,
      backgroundColor: colors.surface2,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
    },
    monogram: {
      alignItems: "center",
      justifyContent: "center",
    },
    monogramLetter: {
      color: "#FFFFFF",
      fontWeight: "700",
    },
    previewLabel: {
      ...typography.label,
      color: colors.text,
      marginTop: spacing.xs,
    },
    previewCaption: {
      ...typography.caption,
      color: colors.mutedText,
      textAlign: "center",
    },
    actions: {
      gap: spacing.sm,
    },
    note: {
      ...typography.caption,
      color: colors.mutedText,
      textAlign: "center",
    },
  });
}
