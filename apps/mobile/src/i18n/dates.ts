// Localized calendar wording — replaces the MONTH/WEEKDAY arrays previously
// duplicated across insights, by-account and the calendar view. Callers
// already re-render on language change via useTranslation, so reading the
// global instance here stays fresh.

import { addRecurrence, type CalendarDate } from "@keel/core";

import i18n from "./index";

/** Full month name from a 0-based month index. */
export function monthFull(index: number): string {
  return i18n.t(`months.full.${index}`);
}

/** Short month name from a 0-based month index. */
export function monthShort(index: number): string {
  return i18n.t(`months.short.${index}`);
}

/** Full month name of a calendar date. */
export function monthNameOf(date: CalendarDate): string {
  return monthFull(Number(date.slice(5, 7)) - 1);
}

/** Short weekday from the JS convention (0 = Sunday). */
export function weekdayShort(day: number): string {
  return i18n.t(`weekdays.short.${day}`);
}

/** "Today" / "Tomorrow" / "Mon 15.06" — short-window day labels. */
export function dayLabel(date: CalendarDate, asOf: CalendarDate): string {
  if (date === asOf) return i18n.t("dates.today");
  if (date === addRecurrence(asOf, { unit: "day", interval: 1 })) return i18n.t("dates.tomorrow");
  const [y, m, d] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${weekdayShort(weekday)} ${date.slice(8, 10)}.${date.slice(5, 7)}`;
}
