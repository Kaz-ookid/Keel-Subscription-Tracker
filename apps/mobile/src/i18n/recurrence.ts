// Localized counterparts of core's describeRecurrence/describeAnchor. Core
// stays locale-free (canonical English for tests and future platforms); the
// app's wording lives here, over i18n keys with real plural handling.

import type { MonthlyAnchor, RecurrenceRule } from "@keel/core";

import i18n from "./index";

/** "1st Thursday" / "dernier vendredi" — the anchored rule's day phrase. */
export function localizedAnchor(anchor: MonthlyAnchor): string {
  return i18n.t("recurrence.anchorPhrase", {
    ord: i18n.t(`recurrence.ord.${anchor.week}`),
    day: i18n.t(`weekdays.long.${anchor.weekday}`),
  });
}

/** "monthly" / "tous les 3 mois" / "chaque 1er jeudi". */
export function localizedRecurrence(rule: RecurrenceRule): string {
  if (rule.unit === "month" && rule.anchor) {
    const anchor = localizedAnchor(rule.anchor);
    return rule.interval === 1
      ? i18n.t("recurrence.anchored", { anchor })
      : i18n.t("recurrence.anchoredEvery", { count: rule.interval, anchor });
  }
  if (rule.interval === 1) {
    return i18n.t(
      rule.unit === "day"
        ? "recurrence.daily"
        : rule.unit === "week"
          ? "recurrence.weekly"
          : rule.unit === "month"
            ? "recurrence.monthly"
            : "recurrence.yearly",
    );
  }
  return i18n.t(`recurrence.every_${rule.unit}`, { count: rule.interval });
}
