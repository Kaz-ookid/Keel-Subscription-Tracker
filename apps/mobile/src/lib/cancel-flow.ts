// The two sheets that start a cancellation, shared by the item screen and
// the long-press menu of a row: "remind me" or "I've cancelled it", then
// which payment is the last one. Keel never cancels anything itself; the
// sheets say so. One explicit tap per outcome, no wheel to dismiss by
// accident.

import { formatCalendarDate, lastChargeOptions, type PaymentItem } from "@keel/core";
import { useTranslation } from "react-i18next";

import { useAppActions } from "../state/app-state";
import { showNativeActionSheet } from "./native-sheet";

export function useCancelFlow(): {
  askCancel: (item: PaymentItem) => void;
  askLastPayment: (item: PaymentItem) => void;
} {
  const { t } = useTranslation();
  const { planCancel, confirmCancel } = useAppActions();

  const askLastPayment = (item: PaymentItem) => {
    const dates = lastChargeOptions(item);
    showNativeActionSheet(
      {
        title: t("cancel.lastPaymentTitle"),
        message: t("cancel.lastPaymentNote"),
        options: [
          t("cancel.nothingMore"),
          ...dates.map((date) => t("cancel.lastPaymentOn", { date: formatCalendarDate(date) })),
          t("common.close"),
        ],
        cancelButtonIndex: dates.length + 1,
      },
      (index) => {
        if (index === 0) confirmCancel(item.id);
        else if (index <= dates.length) confirmCancel(item.id, dates[index - 1]);
      },
    );
  };

  const askCancel = (item: PaymentItem) =>
    showNativeActionSheet(
      {
        title: item.name,
        message: t("cancel.sheetNote"),
        options: [t("cancel.remindMe"), t("cancel.done"), t("common.close")],
        cancelButtonIndex: 2,
      },
      (index) => {
        if (index === 0) planCancel(item.id);
        else if (index === 1) askLastPayment(item);
      },
    );

  return { askCancel, askLastPayment };
}
