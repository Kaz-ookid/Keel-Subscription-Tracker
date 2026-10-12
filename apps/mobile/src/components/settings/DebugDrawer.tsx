// The debug drawer, for dogfooding and beta testers: collapsed by default
// so it never clutters Settings, one tap away when a tester needs to seed
// data, bend the trial clock or replay onboarding. GATED out of production
// builds (§7.3 launch blocker h): the Full Keel switch inside is a one-tap
// paywall bypass. Dev clients get it via __DEV__; TestFlight builds via the
// `beta` EAS profile's EXPO_PUBLIC_DEBUG_TOOLS=1; the App Store build has
// neither, so the drawer does not exist there.

import { calendarDate, formatCalendarDate } from "@keel/core";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, StyleSheet, Switch, Text } from "react-native";
import Animated from "react-native-reanimated";

import { Card } from "../ui/Card";
import { SettingsRow } from "./SettingsRow";

import { useAiHidden } from "../../lib/ai-visibility";
import { setAppLockEnabled, setAppLockGrace } from "../../lib/app-lock";
import {
  debugResetTrialClock,
  debugSetTrialDaysLeft,
  resetEntitlement,
  setFullKeel,
  useEntitlement,
} from "../../lib/entitlement";
import { resetLogoConsent } from "../../lib/logo-consent";
import { foldIn, foldOut } from "../../lib/motion";
import { resetOnboardingSeen } from "../../lib/onboarding";
import { useAppActions, useAppData } from "../../state/app-state";
import { spacing, typography, useStyles, useTheme, type ThemeColors } from "../../theme";

/** The drawer's existence, decided at BUILD time: dev clients always,
 *  TestFlight via the beta profile's env var, the App Store build never. */
export const DEBUG_TOOLS = __DEV__ || process.env.EXPO_PUBLIC_DEBUG_TOOLS === "1";

const CHIP = { debug: "#8E8E93", sample: "#FF9500", importAI: "#30B0C7" } as const;

export function DebugDrawer() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const [open, setOpen] = useState(false);
  const entitlement = useEntitlement();
  const aiHidden = useAiHidden();
  const { snapshotSavedAt } = useAppData();
  const { clearAllData, loadSampleData, saveSnapshot, restoreSnapshot } = useAppActions();

  // The safety net around the destructive actions below: stash the real
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

  // Relive the first launch: wipe everything, forget the tour was seen, and
  // open onboarding right away, every choice included (logo question, Full
  // Keel switch, the app lock).
  const confirmOnboarding = () =>
    Alert.alert(t("settings.onboardingTitle"), t("settings.onboardingMsg"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("settings.wipeReplay"),
        style: "destructive",
        onPress: () => {
          clearAllData();
          void resetOnboardingSeen();
          resetLogoConsent();
          void resetEntitlement();
          void setAppLockEnabled(false);
          void setAppLockGrace(0);
          router.push("/onboarding");
        },
      },
    ]);

  return (
    <>
      <Pressable style={styles.header} onPress={() => setOpen((o) => !o)}>
        <Text style={styles.label}>{t("settings.groupDebug")}</Text>
        <SymbolView
          name={open ? "chevron.down" : "chevron.right"}
          size={12}
          tintColor={colors.mutedText}
        />
      </Pressable>
      {open && (
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
            {/* The conversational assistant, parked here while its tab is
                not back: reachable for testers, invisible to everyone else. */}
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
            {!aiHidden && (
              <SettingsRow
                icon="flask.fill"
                chipColor={CHIP.importAI}
                label={t("settings.readerLab")}
                chevron
                divider
                onPress={() => router.push("/reader-lab")}
              />
            )}
            <SettingsRow
              icon="checkmark.seal.fill"
              chipColor={CHIP.debug}
              label={t("settings.fullkeelDebug")}
              divider
              right={
                <Switch
                  value={entitlement.owned}
                  onValueChange={(next) => void setFullKeel(next)}
                  trackColor={{ true: colors.accent }}
                />
              }
            />
            {/* Trial QA levers: bend the clock without waiting 45 days.
                Earliest-anchor-wins means these only move the clock FORWARD
                in urgency; the reset row is the rewind. */}
            <SettingsRow
              icon="clock.badge.exclamationmark"
              chipColor={CHIP.debug}
              label={t("settings.debugTrial6")}
              divider
              onPress={() => void debugSetTrialDaysLeft(6)}
            />
            <SettingsRow
              icon="lock.fill"
              chipColor={CHIP.debug}
              label={t("settings.debugTrialExpire")}
              divider
              onPress={() => void debugSetTrialDaysLeft(0)}
            />
            <SettingsRow
              icon="clock.arrow.circlepath"
              chipColor={CHIP.debug}
              label={t("settings.debugTrialReset")}
              divider
              onPress={() => void debugResetTrialClock()}
            />
          </Card>
        </Animated.View>
      )}
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      paddingVertical: spacing.xs,
      marginBottom: -spacing.sm,
    },
    // Settings' group label, without its card tuck (the row carries it).
    label: { ...typography.micro, color: colors.mutedText, paddingHorizontal: spacing.xs },
  });
}
