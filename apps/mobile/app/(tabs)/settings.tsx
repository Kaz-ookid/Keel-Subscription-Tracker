// Settings: the home of rare, one-time configuration — starting with account
// management, which is set up once and then mostly left alone (that's why it
// lives here rather than occupying a whole tab). Rows speak the shared
// SettingsRow grammar (src/components/settings/); this file is the list.

import { CURRENCIES, currencyLabel, type CurrencyCode } from "@keel/core";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import {
  APP_LANGUAGES,
  LANGUAGE_LABELS,
  loadLanguageMode,
  setLanguageMode,
  type LanguageMode,
} from "../../src/i18n";
import Animated from "react-native-reanimated";

import { foldIn, foldOut } from "../../src/lib/motion";
import { useTabReset } from "../../src/lib/tabReset";
import {
  authenticate,
  getAuthKind,
  GRACE_OPTIONS,
  setAppLockEnabled as persistLockEnabled,
  setAppLockGrace as persistLockGrace,
  useAppLockConfig,
  type AuthKind,
} from "../../src/lib/app-lock";
import { useReminderPermission } from "../../src/lib/notifications";
import { setAiHidden, useAiHidden } from "../../src/lib/ai-visibility";
import { setLogoConsent, useLogoConsent } from "../../src/lib/logo-consent";
import { forgetCachedLogoLookups } from "../../src/lib/logos";

import { APP_NAME } from "../../src/constants";
import { DEBUG_TOOLS, DebugDrawer } from "../../src/components/settings/DebugDrawer";
import { SettingsRow } from "../../src/components/settings/SettingsRow";
import { Card } from "../../src/components/ui/Card";
import { OptionWheel } from "../../src/components/ui/OptionWheel";
import { Sheen } from "../../src/components/ui/Sheen";
import { TabFade } from "../../src/components/TabFade";
import { LogoConsentSheet } from "../../src/components/LogoConsentSheet";
import { useEntitlement } from "../../src/lib/entitlement";
import { useFullKeelPrices } from "../../src/lib/purchases";
import { useAppActions, useAppData } from "../../src/state/app-state";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  dockClearance,
  spacing,
  type ThemeColors,
  type ThemeMode,
  typography,
  useStyles,
  useTheme,
  useThemeMode,
  withAlpha,
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
  ...APP_LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_LABELS[l] })),
];

const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

/** Which value wheel is up (§9d: values pick on the bottom wheel). */
type SettingsWheel = "currency" | "theme" | "language" | "grace";

// Apple-Settings icon chips (§9d): a saturated rounded square per row, white
// glyph on top — the system's own visual language for settings lists.
const CHIP = {
  accounts: "#007AFF",
  currency: "#34C759",
  appearance: "#5856D6",
  language: "#AF52DE",
  reminders: "#FF3B30",
  browse: "#FF9500",
  importAI: "#30B0C7",
  guide: "#FFCC00",
  faceid: "#32ADE6",
  logos: "#5AC8FA",
  grace: "#8E8E93",
  exportBackup: "#007AFF",
  restoreBackup: "#34C759",
  debug: "#8E8E93",
  sample: "#FF9500",
  danger: "#FF3B30",
  about: "#FF2D55",
} as const;

export default function SettingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useStyles(createStyles);
  // Tab re-tap (§9i): back to the top.
  const scrollRef = useRef<ScrollView>(null);
  const resetSignal = useTabReset("settings");
  useEffect(() => {
    if (resetSignal) scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [resetSignal]);
  const { accounts, displayCurrency, rates } = useAppData();
  const { setDisplayCurrency } = useAppActions();
  const { mode, setMode } = useThemeMode();
  const { t } = useTranslation();
  const [wheel, setWheel] = useState<SettingsWheel | null>(null);
  const [languageMode, setLanguageModeState] = useState<LanguageMode>("system");
  const { granted: remindersOn } = useReminderPermission();
  // App lock: what the device offers (wording + availability) and the live
  // config from the shared store, so enabling it anywhere (onboarding's nudge
  // included) is reflected here without a reload.
  const [authKind, setAuthKind] = useState<AuthKind | null>(null);
  const { enabled: lockEnabled, graceSeconds } = useAppLockConfig();
  // Full Keel: the banner reflects ownership; the debug switch flips it.
  const entitlement = useEntitlement();
  const prices = useFullKeelPrices();
  const [bannerWidth, setBannerWidth] = useState(0);
  // Brand-logo opt-in: off until the user chooses (see logo-consent). Turning on
  // re-shows the onboarding explanation as a reminder before it commits.
  const logoConsent = useLogoConsent();
  const [logoSheet, setLogoSheet] = useState(false);
  // The hard AI lock: on = every AI surface and entry point disappears.
  const aiHidden = useAiHidden();
  useEffect(() => {
    void loadLanguageMode().then(setLanguageModeState);
    void getAuthKind().then(setAuthKind);
  }, []);

  // Authenticate in BOTH directions: enabling proves the lock can open (no
  // lock-outs); disabling proves it's the owner turning it off (a borrowed
  // unlocked phone can't quietly strip the protection).
  const toggleLock = async (next: boolean) => {
    const ok = await authenticate(t(next ? "applock.confirmPrompt" : "applock.disablePrompt"));
    if (!ok) return;
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

  const languageLabel = (option: (typeof LANGUAGE_OPTIONS)[number]) =>
    option.label ?? t(option.labelKey ?? "");

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
          {bannerWidth > 0 && <Sheen width={bannerWidth} color={colors.accent} opacity={0.12} />}
          <SymbolView
            name={entitlement.owned ? "checkmark.seal.fill" : "sailboat.fill"}
            size={22}
            tintColor={colors.accent}
          />
          <View style={styles.fullkeelTexts}>
            <Text style={styles.fullkeelTitle}>{t("fullkeel.title")}</Text>
            <Text style={styles.fullkeelSub}>
              {entitlement.owned
                ? t("fullkeel.bannerOwned")
                : // The live clock, from day one (user decision 2026-08-12):
                  // the hero card wears the countdown so the trial is never a
                  // surprise, and the deal rides next to it — the store's own
                  // price when it has answered, nothing otherwise.
                  (entitlement.state === "trial"
                    ? t("trial.daysLeft", { count: entitlement.daysLeft })
                    : t("fullkeel.bannerSub")) +
                  (prices.early === null ? "" : ` · ${prices.early}`)}
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
            onPress={() => setWheel("currency")}
          />
          <SettingsRow
            icon="circle.lefthalf.filled"
            chipColor={CHIP.appearance}
            label={t("settings.appearance")}
            value={t(THEME_OPTIONS.find((o) => o.value === mode)?.labelKey ?? "")}
            chevron
            divider
            onPress={() => setWheel("theme")}
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
            onPress={() => setWheel("language")}
          />
          {/* Light and short, right under the choice it describes; the warm
              full version (with the mailbox) lives in About Keel. */}
          <Text style={styles.cardFooter}>{t("settings.translationNote")}</Text>
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
          {aiHidden && <Text style={styles.cardFooter}>{t("settings.aiFeaturesFooter")}</Text>}
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
                onPress={() => setWheel("grace")}
              />
            </Animated.View>
          )}
          <Text style={styles.cardFooter}>{t("applock.footer")}</Text>
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

        {DEBUG_TOOLS && <DebugDrawer />}

        <Text style={styles.footer}>
          {APP_NAME}
          {rates ? ` · ${t("settings.ratesFooter", { date: rates.date })}` : ""}
        </Text>

        {/* Every value picker on this screen is the same bottom wheel (§9d). */}
        <OptionWheel
          visible={wheel === "currency"}
          title={t("settings.displayCurrency")}
          onClose={() => setWheel(null)}
          options={CURRENCY_CODES.map((code) => ({
            value: code,
            label: `${currencyLabel(code)} · ${t(`currencies.${code}`, { defaultValue: CURRENCIES[code].name })}`,
          }))}
          value={displayCurrency}
          onChange={(v) => setDisplayCurrency(v as CurrencyCode)}
        />
        <OptionWheel
          visible={wheel === "theme"}
          title={t("settings.appearance")}
          onClose={() => setWheel(null)}
          options={THEME_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
          value={mode}
          onChange={(v) => setMode(v as ThemeMode)}
        />
        <OptionWheel
          visible={wheel === "language"}
          title={t("settings.language")}
          onClose={() => setWheel(null)}
          options={LANGUAGE_OPTIONS.map((o) => ({ value: o.value, label: languageLabel(o) }))}
          value={languageMode}
          onChange={(v) => changeLanguage(v as LanguageMode)}
        />
        <OptionWheel
          visible={wheel === "grace"}
          title={t("applock.requireAfter")}
          onClose={() => setWheel(null)}
          options={GRACE_OPTIONS.map((seconds) => ({
            value: String(seconds),
            label: graceLabel(seconds),
          }))}
          value={String(graceSeconds)}
          onChange={(v) => void persistLockGrace(Number(v))}
        />

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
      borderColor: withAlpha(colors.accent, 0.35),
      borderRadius: 24,
      padding: spacing.md,
      overflow: "hidden",
    },
    fullkeelTexts: { flex: 1, gap: 1 },
    fullkeelTitle: { ...typography.label, fontSize: 17, color: colors.text },
    fullkeelSub: { ...typography.caption, color: colors.mutedText },
    cardFooter: {
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
