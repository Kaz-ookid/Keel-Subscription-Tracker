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
import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ActionSheetIOS,
  Alert,
  AppState,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { loadLanguageMode, setLanguageMode, type LanguageMode } from "../../src/i18n";
import { loadHarborEnabled, setHarborEnabled } from "../../src/lib/experiments";
import Animated from "react-native-reanimated";

import { foldIn, foldOut } from "../../src/lib/motion";
import { useTabReset } from "../../src/lib/tabReset";
import {
  authenticate,
  getAuthKind,
  GRACE_OPTIONS,
  loadAppLockConfig,
  setAppLockEnabled as persistLockEnabled,
  setAppLockGrace as persistLockGrace,
  type AuthKind,
} from "../../src/lib/app-lock";
import { reminderPermissionGranted } from "../../src/lib/notifications";
import { resetOnboardingSeen } from "../../src/lib/onboarding";

import { APP_NAME } from "../../src/constants";
import { Card } from "../../src/components/ui/Card";
import { WheelSheet } from "../../src/components/WheelSheet";
import { useAppState } from "../../src/state/app-state";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  dockClearance,
  spacing,
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

// Apple-Settings icon chips (§9d): a saturated rounded square per row, white
// glyph on top — the system's own visual language for settings lists.
const CHIP = {
  accounts: "#007AFF",
  currency: "#34C759",
  appearance: "#5E5CE6",
  language: "#AF52DE",
  reminders: "#FF3B30",
  browse: "#FF9500",
  importAI: "#30B0C7",
  faceid: "#32ADE6",
  grace: "#8E8E93",
  exportBackup: "#0A84FF",
  restoreBackup: "#30D158",
  debug: "#8E8E93",
  sample: "#FF9F0A",
  demo: "#BF5AF2",
  harbor: "#64D2FF",
  danger: "#FF3B30",
} as const;

function IconChip({ icon, color }: { icon: string; color: string }) {
  return (
    <View style={[chipStyles.chip, { backgroundColor: color }]}>
      <SymbolView name={icon as never} size={15} tintColor="#FFFFFF" />
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    width: 29,
    height: 29,
    borderRadius: 6.5,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default function SettingsScreen() {
  const router = useRouter();
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Tab re-tap (§9i): back to the top.
  const scrollRef = useRef<ScrollView>(null);
  const resetSignal = useTabReset("settings");
  useEffect(() => {
    if (resetSignal) scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [resetSignal]);
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
  const [languageMode, setLanguageModeState] = useState<LanguageMode>("system");
  const [remindersOn, setRemindersOn] = useState<boolean | null>(null);
  // App lock: what the device offers (wording + availability) and the config.
  const [authKind, setAuthKind] = useState<AuthKind | null>(null);
  const [lockEnabled, setLockEnabled] = useState(false);
  const [graceSeconds, setGraceSeconds] = useState(0);
  // Experimental Harbor view (DESIGN.md §3.7 B) — a debug-only flag.
  const [harborOn, setHarborOn] = useState(false);

  useEffect(() => {
    void loadLanguageMode().then(setLanguageModeState);
    void getAuthKind().then(setAuthKind);
    void loadAppLockConfig().then((config) => {
      setLockEnabled(config.enabled);
      setGraceSeconds(config.graceSeconds);
    });
    void loadHarborEnabled().then(setHarborOn);
  }, []);

  // Authenticate in BOTH directions: enabling proves the lock can open (no
  // lock-outs); disabling proves it's the owner turning it off (a borrowed
  // unlocked phone can't quietly strip the protection).
  const toggleLock = async (next: boolean) => {
    const ok = await authenticate(t(next ? "applock.confirmPrompt" : "applock.disablePrompt"));
    if (!ok) return;
    setLockEnabled(next);
    await persistLockEnabled(next);
  };

  const graceLabel = (seconds: number) =>
    seconds === 0
      ? t("applock.graceNow")
      : seconds === 60
        ? t("applock.grace1")
        : t("applock.grace5");

  const lockLabel =
    authKind === "faceId"
      ? t("applock.lockFaceId")
      : authKind === "touchId"
        ? t("applock.lockTouchId")
        : t("applock.lockGeneric");

  const changeLanguage = (next: LanguageMode) => {
    setLanguageModeState(next);
    void setLanguageMode(next);
  };

  // Small pickers ride the native action sheet (§9d, the Apple idiom);
  // only the long currency list keeps the wheel.
  const sheetPick = <T,>(
    title: string,
    labels: string[],
    values: T[],
    onPick: (value: T) => void,
  ) => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...labels, t("common.cancel")],
        cancelButtonIndex: labels.length,
        userInterfaceStyle: scheme,
      },
      (index) => {
        if (index < labels.length) onPick(values[index]);
      },
    );
  };
  const pickTheme = () =>
    sheetPick(
      t("settings.appearance"),
      THEME_OPTIONS.map((o) => t(o.labelKey)),
      THEME_OPTIONS.map((o) => o.value),
      setMode,
    );
  const pickLanguage = () =>
    sheetPick(
      t("settings.language"),
      LANGUAGE_OPTIONS.map((o) => languageLabel(o)),
      LANGUAGE_OPTIONS.map((o) => o.value),
      changeLanguage,
    );
  const pickGrace = () =>
    sheetPick(
      t("applock.requireAfter"),
      GRACE_OPTIONS.map((seconds) => graceLabel(seconds)),
      [...GRACE_OPTIONS],
      (seconds) => {
        setGraceSeconds(seconds);
        void persistLockGrace(seconds);
      },
    );

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
    <ScrollView
      ref={scrollRef}
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}
    >
      <Text style={styles.largeTitle}>{t("tabs.settings")}</Text>
      <Text style={styles.groupLabel}>{t("settings.groupGeneral")}</Text>
      <Card>
        <Pressable style={styles.row} onPress={() => router.push("/accounts")}>
          <IconChip icon="building.columns.fill" color={CHIP.accounts} />
          <Text style={styles.rowText}>{t("settings.accounts")}</Text>
          <Text style={styles.rowValue}>{accounts.length || ""}</Text>
          <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
        </Pressable>
        <Pressable style={[styles.row, styles.rowDivider]} onPress={() => setCurrencySheet(true)}>
          <IconChip icon="coloncurrencysign.circle" color={CHIP.currency} />
          <Text style={styles.rowText}>{t("settings.displayCurrency")}</Text>
          <Text style={styles.rowValue}>{currencyLabel(displayCurrency)}</Text>
          <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
        </Pressable>
        <Pressable style={[styles.row, styles.rowDivider]} onPress={pickTheme}>
          <IconChip icon="circle.lefthalf.filled" color={CHIP.appearance} />
          <Text style={styles.rowText}>{t("settings.appearance")}</Text>
          <Text style={styles.rowValue}>
            {t(THEME_OPTIONS.find((o) => o.value === mode)?.labelKey ?? "")}
          </Text>
          <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
        </Pressable>
        <Pressable style={[styles.row, styles.rowDivider]} onPress={pickLanguage}>
          <IconChip icon="globe" color={CHIP.language} />
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
          <IconChip icon="bell.fill" color={CHIP.reminders} />
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
          <IconChip icon="rectangle.stack.fill" color={CHIP.browse} />
          <Text style={styles.rowText}>{t("settings.browseCommon")}</Text>
          <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
        </Pressable>
        {/* The deliberate home of the AI import (§6.1) — the Add flow only hints. */}
        <Pressable
          style={[styles.row, styles.rowDivider]}
          onPress={() => router.push({ pathname: "/add/import", params: { direct: "1" } })}
        >
          <IconChip icon="sparkles" color={CHIP.importAI} />
          <Text style={styles.rowText}>{t("settings.importAI")}</Text>
          <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
        </Pressable>
      </Card>

      {/* Privacy: the app lock. The OS does the locking; we store one flag. */}
      <Text style={styles.groupLabel}>{t("settings.groupPrivacy")}</Text>
      <Card>
        <View style={styles.row}>
          <IconChip icon="faceid" color={authKind === "unavailable" ? CHIP.debug : CHIP.faceid} />
          <Text style={styles.rowText}>{lockLabel}</Text>
          {authKind === "unavailable" ? (
            <Text style={styles.rowValue}>{t("applock.needPasscode")}</Text>
          ) : (
            <Switch
              value={lockEnabled}
              onValueChange={(next) => void toggleLock(next)}
              disabled={authKind === null}
              trackColor={{ true: colors.accent }}
            />
          )}
        </View>
        {lockEnabled && (
          <Animated.View entering={foldIn} exiting={foldOut}>
            <Pressable style={[styles.row, styles.rowDivider]} onPress={pickGrace}>
              <IconChip icon="clock.fill" color={CHIP.grace} />
              <Text style={styles.rowText}>{t("applock.requireAfter")}</Text>
              <Text style={styles.rowValue}>{graceLabel(graceSeconds)}</Text>
              <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
            </Pressable>
          </Animated.View>
        )}
        <Text style={styles.privacyFooter}>{t("applock.footer")}</Text>
      </Card>

      {/* The escape hatch: real finances deserve a way out of one local blob. */}
      <Text style={styles.groupLabel}>{t("settings.groupBackup")}</Text>
      <Card>
        <Pressable style={styles.row} onPress={() => void exportBackup()}>
          <IconChip icon="square.and.arrow.up" color={CHIP.exportBackup} />
          <Text style={styles.rowText}>{t("settings.exportBackup")}</Text>
        </Pressable>
        <Pressable style={[styles.row, styles.rowDivider]} onPress={() => void importBackup()}>
          <IconChip icon="square.and.arrow.down" color={CHIP.restoreBackup} />
          <Text style={styles.rowText}>{t("settings.restoreBackup")}</Text>
        </Pressable>
        <Text style={styles.privacyFooter}>{t("settings.backupFooter")}</Text>
      </Card>

      {/* Debug, for dogfooding: seed a realistic household or start clean —
          bracketed by the snapshot slot so real data survives the play. */}
      <Text style={styles.groupLabel}>{t("settings.groupDebug")}</Text>
      <Card>
        <Pressable style={styles.row} onPress={confirmSnapshotSave}>
          <IconChip icon="tray.and.arrow.down.fill" color={CHIP.debug} />
          <Text style={styles.rowText}>{t("settings.snapshotSave")}</Text>
          <Text style={styles.rowValue}>{snapshotLabel}</Text>
        </Pressable>
        {snapshotSavedAt !== null && (
          <Pressable style={[styles.row, styles.rowDivider]} onPress={confirmSnapshotRestore}>
            <IconChip icon="tray.and.arrow.up.fill" color={CHIP.debug} />
            <Text style={styles.rowText}>{t("settings.snapshotRestore")}</Text>
          </Pressable>
        )}
        <Pressable style={[styles.row, styles.rowDivider]} onPress={confirmSample}>
          <IconChip icon="wand.and.stars" color={CHIP.sample} />
          <Text style={styles.rowText}>{t("settings.loadSample")}</Text>
        </Pressable>
        <Pressable style={[styles.row, styles.rowDivider]} onPress={confirmDemo}>
          <IconChip icon="person.crop.square.filled.and.at.rectangle" color={CHIP.demo} />
          <Text style={styles.rowText}>{t("settings.loadDemo")}</Text>
        </Pressable>
        <View style={[styles.row, styles.rowDivider]}>
          <IconChip icon="sailboat" color={CHIP.harbor} />
          <Text style={styles.rowText}>{t("settings.harborExperiment")}</Text>
          <Switch
            value={harborOn}
            onValueChange={(next) => {
              setHarborOn(next);
              void setHarborEnabled(next);
            }}
            trackColor={{ true: colors.accent }}
          />
        </View>
        <Pressable style={[styles.row, styles.rowDivider]} onPress={confirmOnboarding}>
          <IconChip icon="arrow.counterclockwise" color={CHIP.debug} />
          <Text style={styles.rowText}>{t("settings.testOnboarding")}</Text>
        </Pressable>
        <Pressable style={[styles.row, styles.rowDivider]} onPress={confirmClear}>
          <IconChip icon="trash.fill" color={CHIP.danger} />
          <Text style={[styles.rowText, styles.dangerText]}>{t("settings.clearAll")}</Text>
        </Pressable>
      </Card>

      <Text style={styles.footer}>
        {APP_NAME}
        {rates ? ` · ${t("settings.ratesFooter", { date: rates.date })}` : ""}
        {"\n"}
        {t("settings.trademark")}
      </Text>

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
      backgroundColor: "transparent",
    },
    // flexGrow keeps the footer's "auto" top margin working when the content
    // is shorter than the screen; the list scrolls once it grows past it.
    largeTitle: {
      fontSize: 34,
      fontWeight: "700",
      color: colors.text,
    },
    content: {
      flexGrow: 1,
      padding: spacing.md,
      paddingBottom: dockClearance,
      gap: spacing.md,
    },
    // Micro overline naming each card group; pulled tight to its own card
    // (the screen gap stays between GROUPS, not between label and card).
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
      color: colors.tones.danger,
    },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    privacyFooter: {
      ...typography.caption,
      color: colors.mutedText,
      paddingBottom: spacing.md,
      paddingTop: spacing.xs,
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
