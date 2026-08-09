// Local notification plumbing. The plan of what fires when is pure core
// (plannedReminders); this layer turns it into scheduled OS notifications
// with a brute-force guarantee: cancel everything and reschedule from current
// state on every change, so a paid/paused/edited commitment can never fire a
// stale reminder. Permission is requested only when there is actually
// something to schedule — never on launch.

import {
  formatCalendarDate,
  formatMoney,
  plannedReminders,
  today,
  type CalendarDate,
  type PaymentItem,
} from "@keel/core";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

import i18n from "../i18n";
import { daysUntil } from "../i18n/dates";
import { fromCalendarDate } from "./dates";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// ---------------------------------------------------------------------------
// Settings: the in-app master switch, the default lead for new reminders, and
// the hour reminders ring at. Device-level (like the app lock): they stay out
// of the backup blob so a restore can't silently re-enable notifications.

/** Lead choices for the DEFAULT reminder (no "never": the switch covers off). */
export const DEFAULT_LEAD_OPTIONS = ["0", "1", "2", "7"] as const;

export interface NotificationSettings {
  /** The in-app master switch — instant, independent of the OS permission. */
  enabled: boolean;
  /** Days-before applied to new commitments and quick-added reminders. */
  defaultLeadKey: string;
  /** Local hour (0-23) reminders fire at. */
  fireHour: number;
}

const ENABLED_KEY = "keel.notifications.enabled.v1";
const LEAD_KEY = "keel.notifications.defaultLead.v1";
// v1 could hold a bug-written "0" (Number(null) passed the old parser's 0-23
// check and got persisted by any save on the settings screen) — v2 starts
// clean and the migration below refuses to carry a v1 zero over.
const HOUR_KEY_V1 = "keel.notifications.fireHour.v1";
const HOUR_KEY = "keel.notifications.fireHour.v2";

const DEFAULTS: NotificationSettings = { enabled: true, defaultLeadKey: "1", fireHour: 9 };

export async function loadNotificationSettings(): Promise<NotificationSettings> {
  try {
    const [enabled, lead, hour, hourV1] = await AsyncStorage.multiGet([
      ENABLED_KEY,
      LEAD_KEY,
      HOUR_KEY,
      HOUR_KEY_V1,
    ]);
    // Number(null) is 0, which would pass the 0-23 check and silently turn
    // "never set" into midnight — only parse a value that actually exists,
    // and never a v1 zero (that's the old bug, not a chosen midnight).
    const hourRaw = hour[1] ?? (hourV1[1] === "0" ? null : hourV1[1]);
    const parsedHour = hourRaw === null ? Number.NaN : Number(hourRaw);
    return {
      enabled: enabled[1] === null ? DEFAULTS.enabled : enabled[1] === "true",
      defaultLeadKey: lead[1] ?? DEFAULTS.defaultLeadKey,
      fireHour:
        Number.isInteger(parsedHour) && parsedHour >= 0 && parsedHour <= 23
          ? parsedHour
          : DEFAULTS.fireHour,
    };
  } catch {
    return DEFAULTS;
  }
}

export async function saveNotificationSettings(settings: NotificationSettings): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [ENABLED_KEY, String(settings.enabled)],
      [LEAD_KEY, settings.defaultLeadKey],
      [HOUR_KEY, String(settings.fireHour)],
    ]);
  } catch {
    // Best-effort, like the rest of this layer.
  }
}

// ---------------------------------------------------------------------------

function fireInstant(fireDate: CalendarDate, fireHour: number): Date {
  const instant = fromCalendarDate(fireDate);
  instant.setHours(fireHour, 0, 0, 0);
  return instant;
}

/** True when notifications are allowed (granted; requests if undetermined). */
async function ensurePermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (current.canAskAgain) {
      const requested = await Notifications.requestPermissionsAsync();
      return requested.granted;
    }
    return false;
  } catch {
    return false;
  }
}

/** Re-derive every scheduled reminder from the current items and settings. */
export async function syncReminders(items: readonly PaymentItem[]): Promise<void> {
  try {
    const settings = await loadNotificationSettings();
    const planned = settings.enabled ? plannedReminders(items, today()) : [];
    if (planned.length === 0) {
      await Notifications.cancelAllScheduledNotificationsAsync();
      return;
    }
    if (!(await ensurePermission())) {
      await Notifications.cancelAllScheduledNotificationsAsync();
      return;
    }

    await Notifications.cancelAllScheduledNotificationsAsync();
    const cutoff = Date.now();
    for (const reminder of planned) {
      // A rule's own hour wins; the app-wide default hour covers the rest.
      const date = fireInstant(reminder.fireDate, reminder.hour ?? settings.fireHour);
      // A fire instant already behind us (e.g. it's past the fire hour on the
      // fire day) would fire immediately — the in-app overdue views cover it.
      if (date.getTime() <= cutoff) continue;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: reminder.name,
          body:
            reminder.kind === "trialEnd" || reminder.kind === "priceChange"
              ? i18n.t(
                  reminder.kind === "trialEnd"
                    ? "notifications.trialBody"
                    : "notifications.priceChangeBody",
                  {
                    amount: formatMoney(reminder.amount),
                    date: formatCalendarDate(reminder.dueDate),
                  },
                )
              : dueBody(formatMoney(reminder.amount), reminder.dueDate, reminder.fireDate),
          data: { itemId: reminder.paymentItemId },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
      });
    }
  } catch {
    // Notifications are best-effort; the app itself stays the source of truth.
  }
}

/** "18.90 CHF due in 3 days (25 July)" — the count is computed against the
 *  reminder's FIRE date, so the sentence is true at the moment it appears
 *  on the lock screen, not at the moment it was scheduled. */
function dueBody(amount: string, dueDate: CalendarDate, fireDate: CalendarDate): string {
  const days = daysUntil(dueDate, fireDate);
  if (days <= 0) return i18n.t("notifications.bodyToday", { amount });
  if (days === 1) return i18n.t("notifications.bodyTomorrow", { amount });
  return i18n.t("notifications.bodyInDays", {
    amount,
    count: days,
    date: formatCalendarDate(dueDate),
  });
}

/** Current permission state for the Settings row. */
export async function reminderPermissionGranted(): Promise<boolean> {
  try {
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Ask for the permission; when iOS won't ask again, the caller sends the
 *  user to Settings instead. */
export async function requestReminderPermission(): Promise<"granted" | "denied" | "blocked"> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return "granted";
    if (!current.canAskAgain) return "blocked";
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

/** Fire one notification right now, worded exactly like a real reminder —
 *  the fastest way to see what a Keel reminder looks like. */
export async function previewNotification(
  sample: { name: string; amount: Parameters<typeof formatMoney>[0]; dueDate: string } | null,
): Promise<boolean> {
  try {
    if (!(await ensurePermission())) return false;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: sample?.name ?? i18n.t("notifications.previewName"),
        body: sample
          ? dueBody(formatMoney(sample.amount), sample.dueDate as CalendarDate, today())
          : i18n.t("notifications.previewBody"),
      },
      trigger: null,
    });
    return true;
  } catch {
    return false;
  }
}
