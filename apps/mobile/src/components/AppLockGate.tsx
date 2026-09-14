// The app lock overlay, rendered above the whole navigation tree (which never
// remounts). Three jobs, one calm surface:
//   1. Cold start: cover until the stored config is read, then either reveal
//      (lock off) or show the lock — finances never flash before the lock.
//   2. Privacy cover while backgrounded, so the app-switcher snapshot shows
//      the brand, not amounts.
//   3. The lock screen itself: Face ID fires by itself; the Unlock button is
//      only the retry. The device passcode always works as fallback.

import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppState, Dimensions, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Waterline } from "./Waterline";

import { APP_NAME } from "../constants";
import {
  authenticate,
  getAuthKind,
  loadAppLockConfig,
  onAppLockChange,
  type AppLockConfig,
  type AuthKind,
} from "../lib/app-lock";
import { radius, spacing, typography, useTheme } from "../theme";

// The cover follows the scheme (beta feedback: the navy cover read as
// dark-mode leakage on a light phone): night keeps the brand navy, day gets
// the morning haze with navy ink. Both read as a splash, never a broken
// screen.
const NAVY = "#0B1E3F";
const NAVY_DEEP = "#071429";

export function AppLockGate() {
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();
  const dark = scheme === "dark";
  // The lock's ink set: light ink on navy at night, navy ink on haze by day.
  const coverTop = dark ? NAVY : colors.stage[0];
  const coverBottom = dark ? NAVY_DEEP : colors.stage[2];
  const ink = dark ? "#FFFFFF" : NAVY;
  const inkSoft = dark ? "rgba(255,255,255,0.75)" : "rgba(11,30,63,0.7)";
  const plate = dark ? "#FFFFFF" : NAVY;
  const plateInk = dark ? NAVY : "#FFFFFF";
  // null = config not read yet → keep the cover up (no content flash).
  const [config, setConfig] = useState<AppLockConfig | null>(null);
  const [locked, setLocked] = useState(false);
  const [covered, setCovered] = useState(false);
  const [failed, setFailed] = useState(false);
  // What the unlock actually uses — the button must not promise Face ID on a
  // device (or host app) that will only show the passcode sheet.
  const [authKind, setAuthKind] = useState<AuthKind>("generic");
  const configRef = useRef<AppLockConfig | null>(null);
  // The Face ID sheet itself backgrounds the app on iOS — while a prompt is
  // up, AppState changes must not re-cover or re-lock.
  const authBusy = useRef(false);
  const awaySince = useRef<number | null>(null);

  const tryUnlock = useCallback(async () => {
    if (authBusy.current) return;
    authBusy.current = true;
    setFailed(false);
    const ok = await authenticate(t("applock.prompt"));
    authBusy.current = false;
    awaySince.current = null;
    if (ok) {
      setLocked(false);
      setCovered(false);
    } else {
      setFailed(true);
    }
  }, [t]);

  // Face ID fires by itself wherever the lock engages (cold start, re-lock on
  // return) — most unlocks need no tap at all; a cancel/failure parks on the
  // retry button, no loop. Both subscriptions are mount-only by design: they
  // read live state through refs, and re-running them on language change
  // would re-lock the app.
  useEffect(() => {
    void getAuthKind().then(setAuthKind);
    void loadAppLockConfig().then((loaded) => {
      configRef.current = loaded;
      setConfig(loaded);
      if (loaded.enabled) {
        setLocked(true);
        void tryUnlock();
      }
    });
    // Settings flips the switch → react immediately, without a restart.
    return onAppLockChange((next) => {
      configRef.current = next;
      setConfig(next);
      if (!next.enabled) {
        setLocked(false);
        setCovered(false);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      const current = configRef.current;
      if (authBusy.current) return;
      if (state === "active") {
        setCovered(false);
        if (current?.enabled && awaySince.current !== null) {
          const awaySeconds = (Date.now() - awaySince.current) / 1000;
          awaySince.current = null;
          if (awaySeconds >= current.graceSeconds) {
            setLocked(true);
            void tryUnlock();
          }
        }
      } else {
        // The privacy cover is UNCONDITIONAL (2026-09-14 security audit):
        // the app-switcher snapshot shows the brand, never amounts, whether
        // or not the lock itself is enabled. Only the re-lock logic above
        // depends on the lock setting.
        if (current?.enabled && awaySince.current === null) awaySince.current = Date.now();
        setCovered(true);
      }
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loading = config === null;
  const visible = loading || locked || covered;

  // A real Modal (not an absolute overlay): the app's native sheets (Add,
  // import…) present above the root view, and the lock must sit above them.
  return (
    <Modal visible={visible} transparent={false} animationType="none" onRequestClose={() => {}}>
      {/* The bar follows the cover's ink, not the app behind it. */}
      <StatusBar style={dark ? "light" : "dark"} />
      <View style={[styles.cover, { backgroundColor: coverTop }]}>
        <LinearGradient colors={[coverTop, coverBottom]} style={StyleSheet.absoluteFill} />
        {/* The brand's water, calm at the foot of the lock (§3.7 D). */}
        <Waterline height={36} width={Dimensions.get("window").width} color="#6FA8E8" />
        <View style={[styles.badge, { backgroundColor: plate }]}>
          <SymbolView name={locked ? "lock.fill" : "shield.fill"} size={30} tintColor={plateInk} />
        </View>
        <Text style={[styles.appName, { color: ink }]}>{APP_NAME}</Text>
        {locked && (
          <>
            <Text style={[styles.sub, { color: inkSoft }]}>
              {t(
                failed
                  ? "applock.failedSub"
                  : authKind === "faceId" || authKind === "touchId"
                    ? "applock.lockedSub"
                    : "applock.lockedSubCode",
              )}
            </Text>
            <Pressable
              style={[styles.unlock, { backgroundColor: plate }]}
              onPress={() => void tryUnlock()}
            >
              <SymbolView
                name={
                  authKind === "faceId" ? "faceid" : authKind === "touchId" ? "touchid" : "key.fill"
                }
                size={18}
                tintColor={plateInk}
              />
              <Text style={[styles.unlockText, { color: plateInk }]}>{t("applock.unlock")}</Text>
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  cover: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: NAVY,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  appName: {
    fontSize: 28,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  sub: {
    ...typography.body,
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
    paddingHorizontal: spacing.xl,
  },
  unlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    backgroundColor: "#FFFFFF",
    borderRadius: radius.lg,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xl,
  },
  unlockText: {
    ...typography.label,
    color: NAVY,
  },
});
