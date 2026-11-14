// The user's data as files, shared by iCloud & data and the locked screen:
// the backup (JSON, restores everything) and the spreadsheet (CSV, written
// for a person and readable back as items to review). The CSV's words come
// from the `csv` section of the locale files; the format itself is the
// core's (export/csv.ts).

import {
  csvToImportDocument,
  DEFAULT_CATEGORIES,
  itemsToCsv,
  today,
  type Category,
  type CsvLabels,
  type ImportDocument,
} from "@keel/core";
import { File, Paths } from "expo-file-system";
import { getLocales } from "expo-localization";
import * as Sharing from "expo-sharing";
import { Alert } from "react-native";

import i18n, { APP_LANGUAGES } from "../i18n";
import { showNativeActionSheet } from "./native-sheet";
import type { PersistedState } from "./storage";

/** What the import picker accepts: a backup (JSON) or a Keel spreadsheet. */
export const DATA_FILE_TYPES = [
  "application/json",
  "text/csv",
  "text/comma-separated-values",
  "public.comma-separated-values-text",
];

/** One language's spreadsheet words; the current language when none is given. */
const csvLabels = (lng?: string) =>
  i18n.t("csv", { returnObjects: true, lng }) as unknown as CsvLabels;

async function shareFile(
  name: string,
  content: string,
  options: Sharing.SharingOptions,
): Promise<void> {
  try {
    const file = new File(Paths.cache, name);
    if (file.exists) file.delete();
    file.create();
    file.write(content);
    try {
      await Sharing.shareAsync(file.uri, options);
    } finally {
      // The share sheet is done with the file: a full financial dump must
      // not linger in the cache (2026-09-14 security audit).
      if (file.exists) file.delete();
    }
  } catch {
    Alert.alert(i18n.t("settings.exportFailTitle"), i18n.t("settings.exportFailMsg"));
  }
}

function shareBackup(state: PersistedState): Promise<void> {
  return shareFile(`keel-backup-${today()}.json`, JSON.stringify(state, null, 2), {
    mimeType: "application/json",
  });
}

function shareCsv(state: PersistedState): Promise<void> {
  const categories: Category[] = [...DEFAULT_CATEGORIES, ...state.categories];
  const csv = itemsToCsv(state.items, {
    asOf: today(),
    labels: csvLabels(),
    decimalComma: getLocales()[0]?.decimalSeparator === ",",
    accounts: state.accounts,
    categoryName: (id) => {
      const category = categories.find((c) => c.id === id);
      return category && i18n.t(`categories.${id}`, { defaultValue: category.name });
    },
  });
  return shareFile(`keel-${today()}.csv`, csv, {
    mimeType: "text/csv",
    UTI: "public.comma-separated-values-text",
  });
}

/** The export row's sheet: backup or spreadsheet, then the share sheet. */
export function showExportChoices(exportData: () => PersistedState, scheme: "light" | "dark") {
  showNativeActionSheet(
    {
      options: [
        i18n.t("settings.exportChoiceBackup"),
        i18n.t("settings.exportChoiceCsv"),
        i18n.t("common.close"),
      ],
      cancelButtonIndex: 2,
      userInterfaceStyle: scheme,
    },
    (index) => {
      if (index === 0) void shareBackup(exportData());
      else if (index === 1) void shareCsv(exportData());
    },
  );
}

/** A Keel spreadsheet as an import document, whichever of the app's
 *  languages it was exported in; null when the text is not one. */
export function readKeelCsv(text: string, categories: readonly Category[]): ImportDocument | null {
  const norm = (value: string) => value.trim().toLowerCase();
  // A category is found by its own name or its built-in name in any language.
  const ids = new Map<string, string>();
  for (const category of categories) {
    ids.set(norm(category.name), category.id);
    for (const lng of APP_LANGUAGES) {
      const name = i18n.t(`categories.${category.id}`, { lng, defaultValue: category.name });
      ids.set(norm(name), category.id);
    }
  }
  return csvToImportDocument(text, {
    labelSets: APP_LANGUAGES.map(csvLabels),
    categoryId: (name) => ids.get(norm(name)),
  });
}
