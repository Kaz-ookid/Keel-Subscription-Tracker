// The one place that warns before a weaker answer is produced. When the user
// wants the cloud model but it can't run (offline, or today's allowance is
// spent), Keel drops to the on-device model — but never silently: this asks
// first, in plain words, so nobody mistakes a simpler result for the real
// thing. Cancelling leaves their data untouched and costs nothing.

import { Alert } from "react-native";
import i18n from "i18next";

/** Resolves true when the user accepts running on the weaker on-device model. */
export function confirmLocalFallback(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(i18n.t("aiEngine.fallbackTitle"), i18n.t("aiEngine.fallbackBody"), [
      { text: i18n.t("common.cancel"), style: "cancel", onPress: () => resolve(false) },
      { text: i18n.t("aiEngine.fallbackGo"), onPress: () => resolve(true) },
    ]);
  });
}
