// Settings: the home of rare, one-time configuration — starting with account
// management, which is set up once and then mostly left alone (that's why it
// lives here rather than occupying a whole tab). Rows speak the shared
// SettingsRow grammar (src/components/settings/); this file is the list.

import {
  calendarDate,
  CURRENCIES,
  currencyLabel,
  formatCalendarDate,
  type CurrencyCode,
} from "@keel/core";
import { Picker as RNPicker } from "@react-native-picker/picker";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ActionSheetIOS,
  Alert,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { loadLanguageMode, setLanguageMode, type LanguageMode } from "../../src/i18n";
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
import { setAiEngine, useAiEngine } from "../../src/lib/ai-engine";
import { cloudStanding } from "../../src/lib/apple-intelligence";
import { setAiHidden, useAiHidden } from "../../src/lib/ai-visibility";
import { setLogoConsent, useLogoConsent } from "../../src/lib/logo-consent";
import { forgetCachedLogoLookups } from "../../src/lib/logos";
import { resetOnboardingSeen } from "../../src/lib/onboarding";

import { APP_NAME, FULL_KEEL_PRICE } from "../../src/constants";
import { InfoDot } from "../../src/components/InfoDot";
import { SettingsRow } from "../../src/components/settings/SettingsRow";
import { Card } from "../../src/components/ui/Card";
import { Sheen } from "../../src/components/ui/Sheen";
import { TabFade } from "../../src/components/TabFade";
import { WheelSheet } from "../../src/components/WheelSheet";
import { LogoConsentSheet } from "../../src/components/LogoConsentSheet";
import { setFullKeel, useEntitlement } from "../../src/lib/entitlement";
import { useAppActions, useAppData } from "../../src/state/app-state";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  dockClearance,
  spacing,
  typography,
  useTheme,
  useThemeMode,
  withAlpha,
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
  { value: "de", label: "Deutsch" },
  { value: "it", label: "Italiano" },
  { value: "pl", label: "Polski" },
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
  guide: "#FFCC00",
  faceid: "#32ADE6",
  logos: "#5AC8FA",
  grace: "#8E8E93",
  exportBackup: "#0A84FF",
  restoreBackup: "#30D158",
  debug: "#8E8E93",
  sample: "#FF9F0A",
  danger: "#FF3B30",
  about: "#FF2D55",
} as const;

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
  const { accounts, displayCurrency, rates, snapshotSavedAt } = useAppData();
  const { setDisplayCurrency, clearAllData, loadSampleData, saveSnapshot, restoreSnapshot } =
    useAppActions();
  const { mode, setMode } = useThemeMode();
  const { t } = useTranslation();
  const [currencySheet, setCurrencySheet] = useState(false);
  const [languageMode, setLanguageModeState] = useState<LanguageMode>("system");
  const [remindersOn, setRemindersOn] = useState<boolean | null>(null);
  // App lock: what the device offers (wording + availability) and the config.
  const [authKind, setAuthKind] = useState<AuthKind | null>(null);
  const [lockEnabled, setLockEnabled] = useState(false);
  const [graceSeconds, setGraceSeconds] = useState(0);
  // The debug drawer stays collapsed until a tester opens it.
  const [debugOpen, setDebugOpen] = useState(false);
  // Full Keel: the banner reflects ownership; the debug switch flips it.
  const entitlement = useEntitlement();
  const [bannerWidth, setBannerWidth] = useState(0);
  // Brand-logo opt-in: off until the user chooses (see logo-consent). Turning on
  // re-shows the onboarding explanation as a reminder before it commits.
  const logoConsent = useLogoConsent();
  const [logoSheet, setLogoSheet] = useState(false);
  // The hard AI lock: on = every AI surface and entry point disappears.
  const aiHidden = useAiHidden();
  // Which model answers: Apple's cloud (default, better) or on-device only.
  // The row only appears where cloud can actually run, so we never offer a
  // model this build/OS cannot reach (PCC needs the iOS 27 SDK).
  const aiEngine = useAiEngine();
  const [cloudSupported, setCloudSupported] = useState(false);
  useEffect(() => {
    void cloudStanding().then((standing) => setCloudSupported(standing.supported));
  }, []);

  useEffect(() => {
    void loadLanguageMode().then(setLanguageModeState);
    void getAuthKind().then(setAuthKind);
    void loadAppLockConfig().then((config) => {
      setLockEnabled(config.enabled);
      setGraceSeconds(config.graceSeconds);
    });
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

  // Turning logos ON re-shows the explanation (the onboarding sheet) as a
  // reminder; it commits only if the user confirms there. Turning OFF stops new
  // web fetches but keeps the logos already on the device (local, so still
  // shown); offer to clear the saved ones too for a clean slate.
  const toggleLogos = (next: boolean) => {
    if (next) {
      setLogoSheet(true);
      return;
    }
    Alert.alert(t("logos.offTitle"), t("logos.offBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("logos.offKeep"), onPress: () => setLogoConsent(false) },
      {
        text: t("logos.offClear"),
        style: "destructive",
        onPress: () => {
          setLogoConsent(false);
          void Image.clearDiskCache();
          void Image.clearMemoryCache();
          // The session memo of cached-logo paths now points at deleted files.
          forgetCachedLogoLookups();
        },
      },
    ]);
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

  const confirmSample = () =>
    Alert.alert(t("settings.loadSample"), t("settings.sampleMsg"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("settings.replace"), style: "destructive", onPress: loadSampleData },
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

  return (
    <TabFade style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}
      >
        <Text style={styles.largeTitle}>{t("tabs.settings")}</Text>

        {/* Full Keel: the one purchase, worn like a banner, never a nag. */}
        <Pressable
          style={styles.fullkeelCard}
          onPress={() => router.push("/fullkeel")}
          onLayout={(e) => setBannerWidth(e.nativeEvent.layout.width)}
        >
          {bannerWidth > 0 && (
            <Sheen width={bannerWidth} color={colors.accentStrong} opacity={0.12} />
          )}
          <SymbolView
            name={entitlement.full ? "checkmark.seal.fill" : "sailboat.fill"}
            size={22}
            tintColor={colors.accentStrong}
          />
          <View style={styles.fullkeelTexts}>
            <Text style={styles.fullkeelTitle}>{t("fullkeel.title")}</Text>
            <Text style={styles.fullkeelSub}>
              {entitlement.full
                ? t("fullkeel.bannerOwned")
                : `${t("fullkeel.bannerSub")} · ${FULL_KEEL_PRICE}`}
            </Text>
          </View>
          <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
        </Pressable>

        <Text style={styles.groupLabel}>{t("settings.groupGeneral")}</Text>
        <Card>
          <SettingsRow
            icon="building.columns.fill"
            chipColor={CHIP.accounts}
            label={t("settings.accounts")}
            value={accounts.length ? String(accounts.length) : ""}
            chevron
            onPress={() => router.push("/accounts")}
          />
          <SettingsRow
            icon="coloncurrencysign.circle"
            chipColor={CHIP.currency}
            label={t("settings.displayCurrency")}
            value={currencyLabel(displayCurrency)}
            chevron
            divider
            onPress={() => setCurrencySheet(true)}
          />
          <SettingsRow
            icon="circle.lefthalf.filled"
            chipColor={CHIP.appearance}
            label={t("settings.appearance")}
            value={t(THEME_OPTIONS.find((o) => o.value === mode)?.labelKey ?? "")}
            chevron
            divider
            onPress={pickTheme}
          />
          <SettingsRow
            icon="globe"
            chipColor={CHIP.language}
            label={t("settings.language")}
            value={languageLabel(
              LANGUAGE_OPTIONS.find((o) => o.value === languageMode) ?? LANGUAGE_OPTIONS[0],
            )}
            chevron
            divider
            onPress={pickLanguage}
          />
          {/* The notification center: master switch, defaults, scheduled list. */}
          <SettingsRow
            icon="bell.fill"
            chipColor={CHIP.reminders}
            label={t("notifCenter.title")}
            value={
              remindersOn === null
                ? ""
                : remindersOn
                  ? t("settings.remindersOn")
                  : t("settings.remindersOff")
            }
            chevron
            divider
            onPress={() => router.push("/notifications")}
          />
          <SettingsRow
            icon="rectangle.stack.fill"
            chipColor={CHIP.browse}
            label={t("settings.browseCommon")}
            chevron
            divider
            onPress={() => router.push({ pathname: "/onboarding", params: { mode: "browse" } })}
          />
          {/* The deliberate home of the AI import (§6.1) — the Add flow only
              hints. Gone entirely under the AI lock. */}
          {!aiHidden && (
            <SettingsRow
              icon="sparkles"
              chipColor={CHIP.importAI}
              label={t("settings.importAI")}
              chevron
              divider
              onPress={() => router.push({ pathname: "/add/import", params: { direct: "1" } })}
            />
          )}
          <SettingsRow
            icon="lightbulb.fill"
            chipColor={CHIP.guide}
            label={t("guide.title")}
            chevron
            divider
            onPress={() => router.push("/guide")}
          />
        </Card>

        {/* Privacy: brand-logo loading + the app lock. Both are local flags;
            logos gate the one network call derived from what you track. */}
        <Text style={styles.groupLabel}>{t("settings.groupPrivacy")}</Text>
        <Card>
          <SettingsRow
            icon="photo.circle.fill"
            chipColor={CHIP.logos}
            label={t("logos.settingsRow")}
            right={
              <Switch
                value={logoConsent.status === "on"}
                onValueChange={toggleLogos}
                trackColor={{ true: colors.accent }}
              />
            }
          />
          {/* The hard AI lock: off removes every AI surface and entry point.
              This row is the one AI mention that must survive its own switch. */}
          <SettingsRow
            icon="sparkles"
            chipColor={CHIP.importAI}
            label={t("settings.aiFeatures")}
            divider
            right={
              <Switch
                value={!aiHidden}
                onValueChange={(next) => setAiHidden(!next)}
                trackColor={{ true: colors.accent }}
              />
            }
          />
          {aiHidden && <Text style={styles.privacyFooter}>{t("settings.aiFeaturesFooter")}</Text>}
          {/* Which engine answers. Cloud is the default because the on-device
              model can't carry the feature honestly; the (i) explains the
              trade both ways without talking anyone out of either. */}
          {!aiHidden && cloudSupported && (
            <SettingsRow
              icon="cloud.fill"
              chipColor={CHIP.exportBackup}
              label={t("settings.aiCloud")}
              divider
              right={
                <View style={styles.engineRight}>
                  <InfoDot title={t("settings.aiCloud")} body={t("settings.aiCloudInfo")} />
                  <Switch
                    value={aiEngine === "cloud"}
                    onValueChange={(next) => setAiEngine(next ? "cloud" : "local")}
                    trackColor={{ true: colors.accent }}
                  />
                </View>
              }
            />
          )}
          {!aiHidden && cloudSupported && (
            <Text style={styles.privacyFooter}>
              {t(aiEngine === "cloud" ? "settings.aiCloudOn" : "settings.aiCloudOff")}
            </Text>
          )}
          <SettingsRow
            icon="faceid"
            chipColor={authKind === "unavailable" ? CHIP.debug : CHIP.faceid}
            label={lockLabel}
            value={authKind === "unavailable" ? t("applock.needPasscode") : undefined}
            divider
            right={
              authKind !== "unavailable" ? (
                <Switch
                  value={lockEnabled}
                  onValueChange={(next) => void toggleLock(next)}
                  disabled={authKind === null}
                  trackColor={{ true: colors.accent }}
                />
              ) : undefined
            }
          />
          {lockEnabled && (
            <Animated.View entering={foldIn} exiting={foldOut}>
              <SettingsRow
                icon="clock.fill"
                chipColor={CHIP.grace}
                label={t("applock.requireAfter")}
                value={graceLabel(graceSeconds)}
                chevron
                divider
                onPress={pickGrace}
              />
            </Animated.View>
          )}
          <Text style={styles.privacyFooter}>{t("applock.footer")}</Text>
        </Card>

        {/* Where the data lives: iCloud preference, local backups, export. */}
        <Text style={styles.groupLabel}>{t("settings.groupBackup")}</Text>
        <Card>
          <SettingsRow
            icon="icloud.fill"
            chipColor={CHIP.exportBackup}
            label={t("data.title")}
            chevron
            onPress={() => router.push("/data")}
          />
        </Card>

        {/* The maker, the mailbox, the legal texts: one door for all of it.
            Above the debug drawer, because it is the row people actually
            look for. */}
        <Text style={styles.groupLabel}>{t("settings.groupAbout")}</Text>
        <Card>
          <SettingsRow
            icon="heart.fill"
            chipColor={CHIP.about}
            label={t("about.title")}
            chevron
            onPress={() => router.push("/about")}
          />
        </Card>

        {/* Debug, for dogfooding and beta testers: collapsed by default so it
            never clutters the list, but one tap away when a tester needs to
            seed data or replay onboarding. */}
        <Pressable style={styles.debugHeader} onPress={() => setDebugOpen((open) => !open)}>
          <Text style={styles.groupLabel}>{t("settings.groupDebug")}</Text>
          <SymbolView
            name={debugOpen ? "chevron.down" : "chevron.right"}
            size={12}
            tintColor={colors.mutedText}
          />
        </Pressable>
        {debugOpen && (
          <Animated.View entering={foldIn} exiting={foldOut}>
            <Card>
              <SettingsRow
                icon="tray.and.arrow.down.fill"
                chipColor={CHIP.debug}
                label={t("settings.snapshotSave")}
                value={snapshotLabel}
                onPress={confirmSnapshotSave}
              />
              {snapshotSavedAt !== null && (
                <SettingsRow
                  icon="tray.and.arrow.up.fill"
                  chipColor={CHIP.debug}
                  label={t("settings.snapshotRestore")}
                  divider
                  onPress={confirmSnapshotRestore}
                />
              )}
              <SettingsRow
                icon="wand.and.stars"
                chipColor={CHIP.sample}
                label={t("settings.loadSample")}
                divider
                onPress={confirmSample}
              />
              <SettingsRow
                icon="arrow.counterclockwise"
                chipColor={CHIP.debug}
                label={t("settings.testOnboarding")}
                divider
                onPress={confirmOnboarding}
              />
              {/* The conversational assistant, parked here while it runs on
                  the limited on-device model: reachable for beta testers,
                  invisible to everyone else. Its tab returns when the model
                  is worth headlining. */}
              {!aiHidden && (
                <SettingsRow
                  icon="sparkles"
                  chipColor={CHIP.importAI}
                  label={t("settings.assistantDebug")}
                  chevron
                  divider
                  onPress={() => router.push("/assistant")}
                />
              )}
              <SettingsRow
                icon="checkmark.seal.fill"
                chipColor={CHIP.debug}
                label={t("settings.fullkeelDebug")}
                divider
                right={
                  <Switch
                    value={entitlement.full}
                    onValueChange={(next) => void setFullKeel(next)}
                    trackColor={{ true: colors.accent }}
                  />
                }
              />
            </Card>
          </Animated.View>
        )}

        <Text style={styles.footer}>
          {APP_NAME}
          {rates ? ` · ${t("settings.ratesFooter", { date: rates.date })}` : ""}
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

        {/* Turning brand logos on re-shows the onboarding explanation; it only
            commits when the user confirms in the sheet. */}
        <LogoConsentSheet
          visible={logoSheet}
          onChoose={(enabled) => {
            setLogoSheet(false);
            setLogoConsent(enabled);
          }}
          onDismiss={() => setLogoSheet(false)}
        />
      </ScrollView>
    </TabFade>
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
    // The glass banner (§9f language, one accent contour, clipped sheen).
    fullkeelCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.material,
      borderWidth: 1,
      borderColor: withAlpha(colors.accentStrong, 0.35),
      borderRadius: 24,
      padding: spacing.md,
      overflow: "hidden",
    },
    fullkeelTexts: { flex: 1, gap: 1 },
    fullkeelTitle: { ...typography.label, fontSize: 17, color: colors.text },
    fullkeelSub: { ...typography.caption, color: colors.mutedText },
    privacyFooter: {
      ...typography.caption,
      color: colors.mutedText,
      paddingBottom: spacing.md,
      paddingTop: spacing.xs,
    },
    engineRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    debugHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      paddingVertical: spacing.xs,
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
