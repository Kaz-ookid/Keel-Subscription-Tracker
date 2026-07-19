// Shared display helpers for AI-trace entries (the AI tab's preview and the
// full history screen render the same rows).

import { calendarDate, formatCalendarDate, type AiActivityEntry } from "@keel/core";
import { useTranslation } from "react-i18next";

export function activityDateLabel(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = formatCalendarDate(
    calendarDate(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`),
  );
  return `${day} · ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function toolLabelKey(tool: AiActivityEntry["tool"]): string {
  switch (tool) {
    case "assistant":
      return "aiHistory.toolAssistant";
    case "ondevice_import":
      return "aiHistory.toolOnDevice";
    case "documents":
      return "aiHistory.toolDocuments";
    case "byo_import":
      return "aiHistory.toolImport";
  }
}

/** "2 added · 1 changed · 1 removed" from the entry's summary counts. */
export function useActivitySummary(): (entry: AiActivityEntry) => string {
  const { t } = useTranslation();
  return (entry: AiActivityEntry) => {
    const parts: string[] = [];
    if (entry.summary.added > 0) parts.push(t("aiHistory.added", { count: entry.summary.added }));
    if (entry.summary.updated > 0)
      parts.push(t("aiHistory.changed", { count: entry.summary.updated }));
    if (entry.summary.removed > 0)
      parts.push(t("aiHistory.removed", { count: entry.summary.removed }));
    return parts.join(" · ");
  };
}
