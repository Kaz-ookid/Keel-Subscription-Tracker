// The AI trace: one entry per confirmed AI action (an import landing, an
// assistant plan applying), so the user always keeps the full picture of what
// AI touched — especially across many imports, where memory gives out first.
// Entries record OUTCOMES (counts, names, the safety-backup name), never the
// user's raw input or documents: there is nothing sensitive to retain.

/** Which AI surface performed the action. */
export type AiTool =
  /** The natural-language assistant (on-device model, manage + add). */
  | "assistant"
  /** Bring-your-own-AI import (ChatGPT/Claude/Gemini copy-paste). */
  | "byo_import"
  /** The on-device "Keel reads it" import. */
  | "ondevice_import"
  /** Document capture (screenshots, PDFs, statements). */
  | "documents";

export interface AiActivitySummary {
  /** Commitments created. */
  added: number;
  /** Commitments changed (paused, repriced, moved, renamed…). */
  updated: number;
  /** Commitments deleted. */
  removed: number;
}

export interface AiActivityEntry {
  id: string;
  /** ISO timestamp of when the action was applied. */
  at: string;
  tool: AiTool;
  summary: AiActivitySummary;
  /** Names of the commitments touched, capped — the human-readable trace. */
  itemNames: string[];
  /** The safety backup written right before an assistant plan applied — the
   *  handle that makes the action revertible while the backup is kept. */
  backupName?: string;
}

/** History cap: enough to never lose the picture, small enough to never
 *  matter in the persisted blob. */
export const AI_ACTIVITY_CAP = 200;

/** Names shown per entry are capped too — a 60-item import lists the first
 *  few and the count says the rest. */
export const AI_ACTIVITY_NAMES_CAP = 30;

/** Newest first, capped. */
export function appendAiActivity(
  list: AiActivityEntry[],
  entry: AiActivityEntry,
): AiActivityEntry[] {
  return [{ ...entry, itemNames: entry.itemNames.slice(0, AI_ACTIVITY_NAMES_CAP) }, ...list].slice(
    0,
    AI_ACTIVITY_CAP,
  );
}
