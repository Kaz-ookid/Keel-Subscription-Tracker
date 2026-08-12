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
  projectCharges,
  today,
  type CalendarDate,
  type PaymentItem,
} from "@keel/core";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

import i18n from "../i18n";
import { daysUntil } from "../i18n/dates";
import { fromCalendarDate, toCalendarDate } from "./dates";
import { entitlementSnapshot } from "./entitlement";

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

/** The recurring overdue summary: off, or a weekly/monthly rhythm the user
 *  picks. Weekday follows the JS convention (0 = Sunday); the monthly day is
 *  capped at 28 so every month has it. */
export type DigestRule =
  | { mode: "off" }
  | { mode: "weekly"; weekday: number }
  | { mode: "monthly"; day: number };

export interface NotificationSettings {
  /** The in-app master switch — instant, independent of the OS permission. */
  enabled: boolean;
  /** Days-before applied to new commitments and quick-added reminders. */
  defaultLeadKey: string;
  /** Local hour (0-23) reminders fire at. */
  fireHour: number;
  /** The overdue digest rhythm. */
  digest: DigestRule;
}

const ENABLED_KEY = "keel.notifications.enabled.v1";
const LEAD_KEY = "keel.notifications.defaultLead.v1";
const DIGEST_KEY = "keel.notifications.digest.v1";
// v1 could hold a bug-written "0" (Number(null) passed the old parser's 0-23
// check and got persisted by any save on the settings screen) — v2 starts
// clean and the migration below refuses to carry a v1 zero over.
const HOUR_KEY_V1 = "keel.notifications.fireHour.v1";
const HOUR_KEY = "keel.notifications.fireHour.v2";

const DEFAULTS: NotificationSettings = {
  enabled: true,
  defaultLeadKey: "1",
  fireHour: 9,
  digest: { mode: "off" },
};

/** Only a stored shape that fully makes sense is honored; anything else is
 *  "off" (never a guessed weekday). */
function parseDigestRule(raw: string | null): DigestRule {
  if (raw === null) return DEFAULTS.digest;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULTS.digest;
    const rule = parsed as { mode?: unknown; weekday?: unknown; day?: unknown };
    if (
      rule.mode === "weekly" &&
      typeof rule.weekday === "number" &&
      Number.isInteger(rule.weekday) &&
      rule.weekday >= 0 &&
      rule.weekday <= 6
    ) {
      return { mode: "weekly", weekday: rule.weekday };
    }
    if (
      rule.mode === "monthly" &&
      typeof rule.day === "number" &&
      Number.isInteger(rule.day) &&
      rule.day >= 1 &&
      rule.day <= 28
    ) {
      return { mode: "monthly", day: rule.day };
    }
    return DEFAULTS.digest;
  } catch {
    return DEFAULTS.digest;
  }
}

export async function loadNotificationSettings(): Promise<NotificationSettings> {
  try {
    const [enabled, lead, hour, hourV1, digest] = await AsyncStorage.multiGet([
      ENABLED_KEY,
      LEAD_KEY,
      HOUR_KEY,
      HOUR_KEY_V1,
      DIGEST_KEY,
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
      digest: parseDigestRule(digest[1]),
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
      [DIGEST_KEY, JSON.stringify(settings.digest)],
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

// ---------------------------------------------------------------------------
// The overdue digest: a recurring "you have things waiting" summary. Each
// occurrence is scheduled as its own one-shot from CURRENT state — the set of
// manual charges that will be past due by that morning is knowable now, and
// every change that could alter it (marking paid, editing) re-runs
// syncReminders anyway, so the snapshot stays truthful.

/** How many upcoming digest occurrences to keep scheduled. */
const DIGEST_HORIZON = 4;

/** The next `count` calendar dates matching the rule, starting after
 *  (or on) `asOf` — the past-instant guard at schedule time drops a same-day
 *  date whose hour already rang. */
export function nextDigestDates(
  rule: DigestRule,
  asOf: CalendarDate,
  count: number,
): CalendarDate[] {
  if (rule.mode === "off") return [];
  const dates: CalendarDate[] = [];
  if (rule.mode === "weekly") {
    const cursor = fromCalendarDate(asOf);
    while (cursor.getDay() !== rule.weekday) cursor.setDate(cursor.getDate() + 1);
    for (let i = 0; i < count; i++) {
      dates.push(toCalendarDate(cursor));
      cursor.setDate(cursor.getDate() + 7);
    }
    return dates;
  }
  // Monthly: day is 1..28, so every month has it — no clamping needed.
  let year = Number(asOf.slice(0, 4));
  let month = Number(asOf.slice(5, 7));
  const bump = () => {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  };
  if (Number(asOf.slice(8, 10)) > rule.day) bump();
  for (let i = 0; i < count; i++) {
    dates.push(toCalendarDate(new Date(year, month - 1, rule.day)));
    bump();
  }
  return dates;
}

interface DigestOccurrence {
  fireDate: CalendarDate;
  count: number;
  names: string[];
}

/** One entry per upcoming digest date that will actually have something to
 *  say — a digest that would announce nothing is not scheduled at all. */
function buildDigests(items: readonly PaymentItem[], rule: DigestRule): DigestOccurrence[] {
  const dates = nextDigestDates(rule, today(), DIGEST_HORIZON);
  if (dates.length === 0) return [];
  // Automatic items settle themselves — only manual charges can be late.
  const charges = projectCharges(items, dates[dates.length - 1]).filter(
    (c) => c.settlementMode === "manual",
  );
  return dates
    .map((fireDate) => {
      const late = charges.filter((c) => c.dueDate < fireDate);
      const names = Array.from(new Set(late.map((c) => c.name)));
      return { fireDate, count: late.length, names };
    })
    .filter((d) => d.count > 0);
}

function digestBody(digest: DigestOccurrence): string {
  const shown = digest.names.slice(0, 3).join(", ");
  const extra = digest.count - Math.min(digest.names.length, 3);
  return extra > 0
    ? i18n.t("notifications.digestBodyMore", { names: shown, count: extra })
    : i18n.t("notifications.digestBody", { names: shown });
}

/** Re-derive every scheduled reminder from the current items and settings. */
export async function syncReminders(items: readonly PaymentItem[]): Promise<void> {
  try {
    // Reminders are a paid surface (§7.3): a locked app cancels everything
    // scheduled instead of letting notifications fire from a frozen state.
    if (entitlementSnapshot().locked) {
      await Notifications.cancelAllScheduledNotificationsAsync();
      return;
    }
    const settings = await loadNotificationSettings();
    const planned = settings.enabled ? plannedReminders(items, today()) : [];
    const digests = settings.enabled ? buildDigests(items, settings.digest) : [];
    if (planned.length === 0 && digests.length === 0) {
      await Notifications.cancelAllScheduledNotificationsAsync();
      return;
    }
    if (!(await ensurePermission())) {
      await Notifications.cancelAllScheduledNotificationsAsync();
      return;
    }

    await Notifications.cancelAllScheduledNotificationsAsync();
    for (const digest of digests) {
      const date = fireInstant(digest.fireDate, settings.fireHour);
      if (date.getTime() <= Date.now()) continue;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: i18n.t("notifications.digestTitle", { count: digest.count }),
          body: digestBody(digest),
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
      });
    }
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
