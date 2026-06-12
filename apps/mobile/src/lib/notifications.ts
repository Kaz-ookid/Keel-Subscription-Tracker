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
  type PaymentItem,
} from "@keel/core";
import * as Notifications from "expo-notifications";

import i18n from "../i18n";

/** Reminders ring at a civilised hour, not midnight. */
const FIRE_HOUR = 9;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function fireInstant(fireDate: string): Date {
  const [y, m, d] = fireDate.split("-").map(Number);
  return new Date(y, m - 1, d, FIRE_HOUR, 0, 0);
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

/** Re-derive every scheduled reminder from the current items. */
export async function syncReminders(items: readonly PaymentItem[]): Promise<void> {
  try {
    const planned = plannedReminders(items, today());
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
      const date = fireInstant(reminder.fireDate);
      // A fire instant already behind us (e.g. it's past 09:00 on the fire
      // day) would fire immediately — the in-app overdue/due views cover it.
      if (date.getTime() <= cutoff) continue;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: reminder.name,
          body: i18n.t("notifications.body", {
            amount: formatMoney(reminder.amount),
            date: formatCalendarDate(reminder.dueDate),
          }),
          data: { itemId: reminder.paymentItemId },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
      });
    }
  } catch {
    // Notifications are best-effort; the app itself stays the source of truth.
  }
}

/** Current permission state for the Settings row. */
export async function reminderPermissionGranted(): Promise<boolean> {
  try {
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}
