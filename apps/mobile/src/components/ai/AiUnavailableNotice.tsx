// "Apple's cloud model isn't available here", with the one reason that
// applies and the way out: iOS Settings when Apple Intelligence is off, the
// bring-your-own path where the caller offers one.

import { useTranslation } from "react-i18next";
import { Linking } from "react-native";

import { AiNotice, AiNoticeLink } from "./AiNotice";

import { REASON_KEYS, type KeelReadsAvailability } from "../../lib/apple-intelligence";
import { useTheme } from "../../theme";

export function AiUnavailableNotice({
  availability,
  onUseOwnAi,
}: {
  availability: Exclude<KeelReadsAvailability, "available">;
  onUseOwnAi?: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <AiNotice
      icon="sparkles"
      tint={colors.mutedText}
      title={t("keelReads.unavailableTitle")}
      body={t(REASON_KEYS[availability])}
    >
      {availability === "disabled" && (
        <AiNoticeLink
          label={t("keelReads.openSettings")}
          onPress={() => void Linking.openSettings()}
        />
      )}
      {onUseOwnAi && <AiNoticeLink label={t("keelReads.ownAi")} onPress={onUseOwnAi} />}
    </AiNotice>
  );
}
