// Settings: the home of rare, one-time configuration — starting with account
// management, which is set up once and then mostly left alone (that's why it
// lives here rather than occupying a whole tab).

import {
  calendarDate,
  CURRENCIES,
  currencyLabel,
  formatCalendarDate,
  today,
  type CurrencyCode,
} from "@keel/core";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import { Picker as RNPicker } from "@react-native-picker/picker";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  AppState,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { loadLanguageMode, setLanguageMode, type LanguageMode } from "../../src/i18n";
import { reminderPermissionGranted } from "../../src/lib/notifications";
import { resetOnboardingSeen } from "../../src/lib/onboarding";

import { APP_NAME } from "../../src/constants";
import { WheelSheet } from "../../src/components/WheelSheet";
import { useAppState } from "../../src/state/app-state";
import {
  radius,
  spacing,
  tones,
  typography,
  useTheme,
  useThemeMode,
  type ThemeColors,
  type ThemeMode,
} from "../../src/theme";

const THEME_OPTIONS: { value: ThemeMode; labelKey: string }[] = [
  { value: "system", labelKey: "settings.matchDevice" },
  { value: "light", labelKey: "settings.light" },
  { value: "dark", labelKey: "settings.dark" },
];

// Language names stay in their own language — the one wheel that must not
// translate, or you can't find the way back out of a language you don't read.
const LANGUAGE_OPTIONS: { value: LanguageMode; label?: string; labelKey?: string }[] = [
  { value: "system", labelKey: "settings.matchDevice" },
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
];

// Same React-19 children alias as the Add form's pickers.
const Picker = RNPicker as unknown as ComponentType<{
  selectedValue: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
}> & { Item: typeof RNPicker.Item };

const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

export default function SettingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    accounts,
    displayCurrency,
    setDisplayCurrency,
    rates,
    clearAllData,
    loadSampleData,
    loadDemoData,
    exportData,
    importData,
    snapshotSavedAt,
    saveSnapshot,
    restoreSnapshot,
  } = useAppState();
  const { mode, setMode } = useThemeMode();
  const { t } = useTranslation();
  const [currencySheet, setCurrencySheet] = useState(false);
  const [themeSheet, setThemeSheet] = useState(false);
  const [languageSheet, setLanguageSheet] = useState(false);
  const [languageMode, setLanguageModeState] = useState<LanguageMode>("system");
  const [remindersOn, setRemindersOn] = useState<boolean | null>(null);

  useEffect(() => {
    void loadLanguageMode().then(setLanguageModeState);
  }, []);

  const changeLanguage = (next: LanguageMode) => {
    setLanguageModeState(next);
    void setLanguageMode(next);
  };

  const languageLabel = (option: (typeof LANGUAGE_OPTIONS)[number]) =>
    option.label ?? t(option.labelKey ?? "");

  // Reflect the OS notification permission (re-check when returning from iOS
  // Settings via the app coming back to the foreground).
  useEffect(() => {
    const check = () => void reminderPermissionGranted().then(setRemindersOn);
    check();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => subscription.remove();
  }, []);

  // The safety net around the destructive debug actions below: stash the real
  // data in an on-device slot, play with demo/empty data, then put it back.
  const snapshotLabel = snapshotSavedAt
    ? formatCalendarDate(calendarDate(snapshotSavedAt.slice(0, 10)))
    : "";

  const confirmSnapshotSave = () => {
    if (!snapshotSavedAt) {
      saveSnapshot();
      return;
    }
    Alert.alert(
      t("settings.snapshotSave"),
      t("settings.snapshotOverwriteMsg", { date: snapshotLabel }),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("settings.replace"), style: "destructive", onPress: saveSnapshot },
      ],
    );
  };

  const confirmSnapshotRestore = () =>
    Alert.alert(
      t("settings.snapshotRestore"),
      t("settings.snapshotRestoreMsg", { date: snapshotLabel }),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("settings.replace"), style: "destructive", onPress: restoreSnapshot },
      ],
    );

  const confirmClear = () =>
    Alert.alert(t("settings.clearAll"), t("settings.clearMsg"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("settings.deleteEverything"), style: "destructive", onPress: clearAllData },
    ]);

  const confirmSample = () =>
    Alert.alert(t("settings.loadSample"), t("settings.sampleMsg"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("settings.replace"), style: "destructive", onPress: loadSampleData },
    ]);

  const confirmDemo = () =>
    Alert.alert(t("settings.loadDemo"), t("settings.demoMsg"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("settings.replace"), style: "destructive", onPress: loadDemoData },
    ]);

  // Debug: relive the first launch — wipe everything, forget the tour was
  // seen, and open onboarding right away.
  const confirmOnboarding = () =>
    Alert.alert(t("settings.onboardingTitle"), t("settings.onboardingMsg"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("settings.wipeReplay"),
        style: "destructive",
        onPress: () => {
          clearAllData();
          void resetOnboardingSeen();
          router.push("/onboarding");
        },
      },
    ]);

  const exportBackup = async () => {
    try {
      const file = new File(Paths.cache, `keel-backup-${today()}.json`);
      if (file.exists) file.delete();
      file.create();
      file.write(JSON.stringify(exportData(), null, 2));
      await Sharing.shareAsync(file.uri, { mimeType: "application/json" });
    } catch {
      Alert.alert(t("settings.exportFailTitle"), t("settings.exportFailMsg"));
    }
  };

  const importBackup = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: "application/json" });
      if (picked.canceled || !picked.assets[0]) return;
      const content = new File(picked.assets[0].uri).textSync();
      Alert.alert(t("settings.restoreTitle"), t("settings.restoreMsg"), [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("settings.replace"),
          style: "destructive",
          onPress: () => {
            if (!importData(content)) {
              Alert.alert(t("settings.importFailTitle"), t("settings.importFailNotBackup"));
            }
          },
        },
      ]);
    } catch {
      Alert.alert(t("settings.importFailTitle"), t("settings.importFailRead"));
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Pressable style={styles.row} onPress={() => router.push("/accounts")}>
          <SymbolView name="building.columns.fill" size={20} tintColor={colors.accent} />
          <Text style={styles.rowText}>{t("settings.accounts")}</Text>
          <Text style={styles.rowValue}>{accounts.length || ""}</Text>
          <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
        </Pressable>
        <Pressable style={[styles.row, styles.rowDivider]} onPress={() => setCurrencySheet(true)}>
          <SymbolView name="coloncurrencysign.circle" size={20} tintColor={colors.accent} />
          <Text style={styles.rowText}>{t("settings.displayCurrency")}</Text>
          <Text style={styles.rowValue}>{currencyLabel(displayCurrency)}</Text>
          <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
        </Pressable>
        <Pressable style={[styles.row, styles.rowDivider]} onPress={() => setThemeSheet(true)}>
          <SymbolView name="circle.lefthalf.filled" size={20} tintColor={colors.accent} />
          <Text style={styles.rowText}>{t("settings.appearance")}</Text>
          <Text style={styles.rowValue}>
            {t(THEME_OPTIONS.find((o) => o.value === mode)?.labelKey ?? "")}
          </Text>
          <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
        </Pressable>
        <Pressable style={[styles.row, styles.rowDivider]} onPress={() => setLanguageSheet(true)}>
          <SymbolView name="globe" size={20} tintColor={colors.accent} />
          <Text style={styles.rowText}>{t("settings.language")}</Text>
          <Text style={styles.rowValue}>
            {languageLabel(
              LANGUAGE_OPTIONS.find((o) => o.value === languageMode) ?? LANGUAGE_OPTIONS[0],
            )}
          </Text>
          <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
        </Pressable>
        {/* Reminders ride the OS permission; when off, the row opens Settings. */}
        <Pressable
          style={[styles.row, styles.rowDivider]}
          onPress={() => {
            if (remindersOn === false) void Linking.openSettings();
          }}
        >
          <SymbolView name="bell.fill" size={20} tintColor={colors.accent} />
          <Text style={styles.rowText}>{t("settings.reminders")}</Text>
          <Text style={styles.rowValue}>
            {remindersOn === null
              ? ""
              : remindersOn
                ? t("settings.remindersOn")
                : t("settings.remindersOff")}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.row, styles.rowDivider]}
          onPress={() => router.push({ pathname: "/onboarding", params: { mode: "browse" } })}
        >
          <SymbolView name="rectangle.stack.fill" size={20} tintColor={colors.accent} />
          <Text style={styles.rowText}>{t("settings.browseCommon")}</Text>
          <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
        </Pressable>
      </View>

      {/* The escape hatch: real finances deserve a way out of one local blob. */}
      <View style={styles.card}>
        <Pressable style={styles.row} onPress={() => void exportBackup()}>
          <SymbolView name="square.and.arrow.up" size={20} tintColor={colors.accent} />
          <Text style={styles.rowText}>{t("settings.exportBackup")}</Text>
        </Pressable>
        <Pressable style={[styles.row, styles.rowDivider]} onPress={() => void importBackup()}>
          <SymbolView name="square.and.arrow.down" size={20} tintColor={colors.accent} />
          <Text style={styles.rowText}>{t("settings.restoreBackup")}</Text>
        </Pressable>
      </View>

      {/* Debug, for dogfooding: seed a realistic household or start clean —
          bracketed by the snapshot slot so real data survives the play. */}
      <View style={styles.card}>
        <Pressable style={styles.row} onPress={confirmSnapshotSave}>
          <SymbolView name="tray.and.arrow.down.fill" size={20} tintColor={colors.accent} />
          <Text style={styles.rowText}>{t("settings.snapshotSave")}</Text>
          <Text style={styles.rowValue}>{snapshotLabel}</Text>
        </Pressable>
        {snapshotSavedAt !== null && (
          <Pressable style={[styles.row, styles.rowDivider]} onPress={confirmSnapshotRestore}>
            <SymbolView name="tray.and.arrow.up.fill" size={20} tintColor={colors.accent} />
            <Text style={styles.rowText}>{t("settings.snapshotRestore")}</Text>
          </Pressable>
        )}
        <Pressable style={[styles.row, styles.rowDivider]} onPress={confirmSample}>
          <SymbolView name="wand.and.stars" size={20} tintColor={colors.accent} />
          <Text style={styles.rowText}>{t("settings.loadSample")}</Text>
        </Pressable>
        <Pressable style={[styles.row, styles.rowDivider]} onPress={confirmDemo}>
          <SymbolView
            name="person.crop.square.filled.and.at.rectangle"
            size={20}
            tintColor={colors.accent}
          />
          <Text style={styles.rowText}>{t("settings.loadDemo")}</Text>
        </Pressable>
        <Pressable style={[styles.row, styles.rowDivider]} onPress={confirmOnboarding}>
          <SymbolView name="arrow.counterclockwise" size={20} tintColor={colors.accent} />
          <Text style={styles.rowText}>{t("settings.testOnboarding")}</Text>
        </Pressable>
        <Pressable style={[styles.row, styles.rowDivider]} onPress={confirmClear}>
          <SymbolView name="trash.fill" size={20} tintColor={tones.danger} />
          <Text style={[styles.rowText, styles.dangerText]}>{t("settings.clearAll")}</Text>
        </Pressable>
      </View>

      <Text style={styles.footer}>
        {APP_NAME}
        {rates ? ` · ${t("settings.ratesFooter", { date: rates.date })}` : ""}
        {"\n"}
        {t("settings.trademark")}
      </Text>

      <WheelSheet
        visible={themeSheet}
        title={t("settings.appearance")}
        onClose={() => setThemeSheet(false)}
      >
        <Picker selectedValue={mode} onValueChange={(v) => setMode(v as ThemeMode)}>
          {THEME_OPTIONS.map((o) => (
            <Picker.Item key={o.value} label={t(o.labelKey)} value={o.value} color={colors.text} />
          ))}
        </Picker>
      </WheelSheet>

      <WheelSheet
        visible={languageSheet}
        title={t("settings.language")}
        onClose={() => setLanguageSheet(false)}
      >
        <Picker
          selectedValue={languageMode}
          onValueChange={(v) => changeLanguage(v as LanguageMode)}
        >
          {LANGUAGE_OPTIONS.map((o) => (
            <Picker.Item
              key={o.value}
              label={languageLabel(o)}
              value={o.value}
              color={colors.text}
            />
          ))}
        </Picker>
      </WheelSheet>

      <WheelSheet
        visible={currencySheet}
        title={t("settings.displayCurrency")}
        onClose={() => setCurrencySheet(false)}
      >
        <Picker
          selectedValue={displayCurrency}
          onValueChange={(v) => setDisplayCurrency(v as CurrencyCode)}
        >
          {CURRENCY_CODES.map((code) => (
            <Picker.Item
              key={code}
              label={`${currencyLabel(code)} — ${t(`currencies.${code}`, { defaultValue: CURRENCIES[code].name })}`}
              value={code}
              color={colors.text}
            />
          ))}
        </Picker>
      </WheelSheet>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    // flexGrow keeps the footer's "auto" top margin working when the content
    // is shorter than the screen; the list scrolls once it grows past it.
    content: {
      flexGrow: 1,
      padding: spacing.md,
      gap: spacing.md,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.md,
    },
    rowText: {
      ...typography.body,
      color: colors.text,
      flex: 1,
    },
    rowValue: {
      ...typography.body,
      color: colors.mutedText,
    },
    dangerText: {
      color: tones.danger,
    },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    footer: {
      ...typography.caption,
      color: colors.mutedText,
      textAlign: "center",
      marginTop: "auto",
      paddingBottom: spacing.md,
    },
  });
}
