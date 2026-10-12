// The reminder sub-form of the add/edit form: up to three rules as editable
// drafts (lead × unit, fire hour, repeat), the pure helpers that map a lead
// in days to the wheels and back, and the rows the UI prints. Its own hook
// so useAddForm stays about the commitment, not about reminder wheels.

import type { TFunction } from "i18next";
import { useEffect, useState } from "react";

import { reminderRules, type ReminderRule } from "@keel/core";

import { formatHour } from "../../lib/dates";
import { loadNotificationSettings } from "../../lib/notifications";

// The lead wheel. "Never" is not an option here: the switch owns off, and
// an extra rule is removed by its own affordance.
export const REMINDER_OPTIONS: { value: string; labelKey: string; count?: number }[] = [
  { value: "0", labelKey: "add.reminderOnDay" },
  { value: "1", labelKey: "add.reminderDayBefore", count: 1 },
  { value: "2", labelKey: "add.reminderDayBefore", count: 2 },
  { value: "7", labelKey: "add.reminderWeekBefore" },
  { value: "14", labelKey: "add.reminderDayBefore", count: 14 },
  { value: "30", labelKey: "add.reminderMonthBefore" },
];

export type RepeatKey = "off" | "daily" | "weekly";

// The free-range lead: any number of days, weeks or months before. Stored
// flat as daysBefore (a month is 30 days); the wheel shows number × unit.
export type LeadUnit = "day" | "week" | "month";
const LEAD_FACTOR: Record<LeadUnit, number> = { day: 1, week: 7, month: 30 };
export const LEAD_MAX: Record<LeadUnit, number> = { day: 31, week: 12, month: 12 };

/** daysBefore → the wheel's (number, unit): the largest unit that divides
 *  it cleanly ("14" reads as 2 weeks, "30" as 1 month, "10" as 10 days). */
function leadParts(daysBefore: number): { leadN: number; leadUnit: LeadUnit } {
  if (daysBefore > 0 && daysBefore % 30 === 0 && daysBefore / 30 <= LEAD_MAX.month) {
    return { leadN: daysBefore / 30, leadUnit: "month" };
  }
  if (daysBefore > 0 && daysBefore % 7 === 0 && daysBefore / 7 <= LEAD_MAX.week) {
    return { leadN: daysBefore / 7, leadUnit: "week" };
  }
  return { leadN: daysBefore, leadUnit: "day" };
}

/** Which repeats make sense for a lead: a series needs room to repeat in,
 *  weekly wants at least a week of lead, daily at least a day. */
function availableRepeats(daysBefore: number): RepeatKey[] {
  const repeats: RepeatKey[] = ["off"];
  if (daysBefore >= 1) repeats.push("daily");
  if (daysBefore >= 7) repeats.push("weekly");
  return repeats;
}

/** One reminder rule as the form holds it: everything a string key, so the
 *  wheels and the dirty-signature stay trivial. */
export interface ReminderDraft {
  /** daysBefore as a string ("2"). */
  key: string;
  /** "default" = the app-wide fire hour; otherwise the hour ("20"). */
  hourKey: string;
  repeatKey: RepeatKey;
}

const MAX_REMINDER_RULES = 3;

function draftsFromRules(rules: readonly ReminderRule[]): ReminderDraft[] {
  return rules.map((r) => ({
    key: String(r.daysBefore),
    hourKey: r.hour !== undefined ? String(r.hour) : "default",
    repeatKey: r.repeat ?? "off",
  }));
}

function rulesFromDrafts(drafts: readonly ReminderDraft[]): ReminderRule[] {
  return drafts.map((d) => ({
    daysBefore: Number(d.key),
    ...(d.hourKey === "default" ? {} : { hour: Number(d.hourKey) }),
    ...(d.repeatKey === "off" ? {} : { repeat: d.repeatKey }),
  }));
}

export function useReminderDrafts(
  seedItem: Parameters<typeof reminderRules>[0] | undefined,
  t: TFunction,
) {
  // The item's reminder rules as editable drafts (empty = never remind).
  // Rule 1 is the simple case; extra rules and repeats are the disclosed depth.
  const [reminderDrafts, setReminderDrafts] = useState<ReminderDraft[]>(() =>
    draftsFromRules(seedItem ? reminderRules(seedItem) : []),
  );
  // Which draft the reminder sheets edit (set when a row opens a sheet).
  const [reminderIndex, setReminderIndex] = useState(0);
  // "default" follows the app-wide fire hour; a number is a rule's own. The
  // UI shows the RESOLVED hour either way (no "default" entry to decode), so
  // the app-wide hour is loaded to fill the label and preselect the wheel.
  const [defaultFireHour, setDefaultFireHour] = useState(9);
  useEffect(() => {
    void loadNotificationSettings().then((s) => setDefaultFireHour(s.fireHour));
  }, []);

  const patchReminderDraft = (index: number, patch: Partial<ReminderDraft>) =>
    setReminderDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  /** The two-part lead wheel writes through here: number × unit → daysBefore,
   *  and a repeat the new lead can't hold heals itself back to "off". */
  const setReminderLead = (index: number, leadN: number, leadUnit: LeadUnit) => {
    const n = Math.min(Math.max(0, Math.floor(leadN)), LEAD_MAX[leadUnit]);
    const daysBefore = n * LEAD_FACTOR[leadUnit];
    setReminderDrafts((prev) =>
      prev.map((d, i) =>
        i === index
          ? {
              ...d,
              key: String(daysBefore),
              repeatKey: availableRepeats(daysBefore).includes(d.repeatKey) ? d.repeatKey : "off",
            }
          : d,
      ),
    );
  };
  const addReminderDraft = () =>
    setReminderDrafts((prev) =>
      prev.length >= MAX_REMINDER_RULES
        ? prev
        : [...prev, { key: "1", hourKey: "default", repeatKey: "off" }],
    );
  const removeReminderDraft = (index: number) =>
    setReminderDrafts((prev) => prev.filter((_, i) => i !== index));
  /** Turning a trial on lights up a heads-up reminder by default: the whole
   *  point is not to be surprised by the conversion. */
  const seedTrialReminder = () => {
    if (reminderDrafts.length === 0) {
      setReminderDrafts([{ key: "2", hourKey: "default", repeatKey: "off" }]);
    }
  };
  // The reminder switch: ON picks up the default lead from the notification
  // settings (the advanced rows below it stay adjustable), OFF clears all.
  const setReminderEnabled = (next: boolean) => {
    if (!next) {
      setReminderDrafts([]);
      return;
    }
    void loadNotificationSettings().then((s) =>
      setReminderDrafts([{ key: s.defaultLeadKey, hourKey: "default", repeatKey: "off" }]),
    );
  };

  // Per-rule display rows: everything the reminder UI prints, precomputed.
  const reminderRows = reminderDrafts.map((d) => {
    const daysBefore = Number(d.key);
    const { leadN, leadUnit } = leadParts(daysBefore);
    const hourValue = d.hourKey === "default" ? String(defaultFireHour) : d.hourKey;
    return {
      ...d,
      leadN,
      leadUnit,
      label:
        daysBefore === 0
          ? t("add.reminderOnDay")
          : leadUnit === "month"
            ? t("add.reminderMonthsBefore", { count: leadN })
            : leadUnit === "week"
              ? t("add.reminderWeeksBefore", { count: leadN })
              : t("add.reminderDayBefore", { count: leadN }),
      hourValue,
      hourLabel: formatHour(Number(hourValue)),
      // The repeats this lead has room for: the wheel offers only these,
      // and setReminderLead resets a repeat that stops fitting.
      repeatOptions: availableRepeats(daysBefore),
      repeatLabel: t(
        d.repeatKey === "off"
          ? "add.repeatOff"
          : d.repeatKey === "daily"
            ? "add.repeatDaily"
            : "add.repeatWeekly",
      ),
    };
  });

  return {
    reminderDrafts,
    /** The drafts as a string, for the form's dirty check. */
    signature: JSON.stringify(reminderDrafts),
    /** The rules to save. */
    rules: rulesFromDrafts(reminderDrafts),
    reminderRows,
    reminderIndex,
    setReminderIndex,
    setReminderEnabled,
    patchReminderDraft,
    setReminderLead,
    addReminderDraft,
    removeReminderDraft,
    seedTrialReminder,
  };
}
