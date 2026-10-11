// Turning what the user picked into material for "Keel reads it for you":
// screenshots through Vision, PDFs through PDFKit, text-like files read as
// they are. All of it on the phone; the result goes through the privacy
// scrubber and into the preview draft, never straight to the model.

import { File } from "expo-file-system";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";

import { scrubPersonalData, type ScrubResult } from "@keel/core";

import { extractPdfText, recognizeScreenshot } from "./apple-intelligence";
import { setKeelReadsDraft } from "../state/keel-reads-draft";

/** What the document picker accepts: PDFs and anything text-like (CSV and
 *  plain text are what bank and tracker exports usually are). Spreadsheets
 *  are not read yet; a CSV export of the same sheet is. */
export const DOCUMENT_TYPES = [
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/comma-separated-values",
  "text/markdown",
  "text/tab-separated-values",
  "application/json",
  "public.plain-text",
  "public.comma-separated-values-text",
];

export type MaterialOutcome =
  | { ok: true; count: number }
  | { ok: false; error: "cancelled" | "unreadable" };

function stageDraft(chunks: string[], count: number): MaterialOutcome {
  if (chunks.length === 0) return { ok: false, error: "unreadable" };
  const scrubbed: ScrubResult = scrubPersonalData(chunks.join("\n\n"));
  setKeelReadsDraft({
    text: scrubbed.text,
    removed: scrubbed.removed,
    count: scrubbed.count,
    screenshots: count,
  });
  return { ok: true, count };
}

/** Pick screenshots from the library and stage their text as the draft. */
export async function stageScreenshots(): Promise<MaterialOutcome> {
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    selectionLimit: 6,
    quality: 1,
  });
  if (picked.canceled || picked.assets.length === 0) return { ok: false, error: "cancelled" };
  const chunks: string[] = [];
  for (const asset of picked.assets) {
    try {
      const read = (await recognizeScreenshot(asset.uri)).trim();
      if (read) chunks.push(read);
    } catch {
      // One unreadable picture must not sink the others.
    }
  }
  return stageDraft(chunks, picked.assets.length);
}

/** Pick documents (PDF, text, CSV, JSON...) and stage their text as the draft. */
export async function stageDocuments(): Promise<MaterialOutcome> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: DOCUMENT_TYPES,
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (picked.canceled || picked.assets.length === 0) return { ok: false, error: "cancelled" };
  const chunks: string[] = [];
  for (const asset of picked.assets) {
    try {
      const isPdf =
        asset.mimeType === "application/pdf" || asset.name.toLowerCase().endsWith(".pdf");
      const read = isPdf ? await extractPdfText(asset.uri) : await new File(asset.uri).text();
      if (read.trim()) chunks.push(read.trim());
    } catch {
      // Same rule as screenshots: skip the unreadable one, keep the rest.
    } finally {
      // The picker's cache copy is a plain financial document: not kept.
      try {
        const file = new File(asset.uri);
        if (file.exists) file.delete();
      } catch {
        // Best-effort cleanup.
      }
    }
  }
  return stageDraft(chunks, picked.assets.length);
}
