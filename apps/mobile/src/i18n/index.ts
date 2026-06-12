// i18n bootstrap. The app speaks the device language out of the gate (en/fr,
// English fallback) and applies any stored override as soon as it loads —
// the preference is device-level (its own key, like the theme), never part
// of the data blob. Components subscribe via useTranslation; everything
// outside React (notifications) uses the global instance.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { en } from "./en";
import { fr } from "./fr";

/** "system" follows the device; the rest force a language. */
export type LanguageMode = "system" | "en" | "fr";

export const LANGUAGE_KEY = "keel.language.v1";

function deviceLanguage(): "en" | "fr" {
  return getLocales()[0]?.languageCode === "fr" ? "fr" : "en";
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, fr: { translation: fr } },
  lng: deviceLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

// Apply a stored override once it's read — a brief first-frame in the device
// language is acceptable (same trade-off the theme preference makes).
void AsyncStorage.getItem(LANGUAGE_KEY).then((stored) => {
  if (stored === "en" || stored === "fr") void i18n.changeLanguage(stored);
});

export async function loadLanguageMode(): Promise<LanguageMode> {
  try {
    const stored = await AsyncStorage.getItem(LANGUAGE_KEY);
    return stored === "en" || stored === "fr" ? stored : "system";
  } catch {
    return "system";
  }
}

export async function setLanguageMode(mode: LanguageMode): Promise<void> {
  try {
    if (mode === "system") await AsyncStorage.removeItem(LANGUAGE_KEY);
    else await AsyncStorage.setItem(LANGUAGE_KEY, mode);
  } catch {
    // best-effort — the in-session language still switches below
  }
  await i18n.changeLanguage(mode === "system" ? deviceLanguage() : mode);
}

export default i18n;
