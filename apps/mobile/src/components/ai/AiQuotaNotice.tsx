// "Today's allowance is used up", shown in place of a read button or the
// list of ways in once the model has said so today, with the
// bring-your-own path where the caller offers one.

import { useTranslation } from "react-i18next";

import { AiNotice, AiNoticeLink } from "./AiNotice";

import { useTheme } from "../../theme";

export function AiQuotaNotice({ onUseOwnAi }: { onUseOwnAi?: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <AiNotice
      icon="hourglass"
      tint={colors.mutedText}
      title={t("keelReads.unavailableTitle")}
      body={t("keelReads.errQuota")}
    >
      {onUseOwnAi && <AiNoticeLink label={t("keelReads.ownAi")} onPress={onUseOwnAi} />}
    </AiNotice>
  );
}
