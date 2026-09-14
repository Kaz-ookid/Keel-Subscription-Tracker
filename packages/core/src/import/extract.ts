// Defensive extraction of the import document from whatever the user pasted.
// We cannot constrain a chat AI's output the way an API call can (§6.1 Path A):
// the answer may arrive wrapped in markdown fences, prefixed with "Here's your
// import:", or embedded in prose. This never throws — it either finds a
// parseable JSON value or returns null and lets the UI ask again.

function tryParse(text: string): unknown | undefined {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

// Bounds for the rescue scan: a real model answer sits far below both, and
// without them the scan is quadratic on pathological pastes (a page of "{"
// froze the JS thread — 2026-09-14 security audit).
const MAX_SCAN_LENGTH = 200_000;
const MAX_SCAN_STARTS = 2_000;

/** Scan for balanced `{…}` blocks (string-aware) and return the first one that
 *  parses AND carries the marker key — prose around it is ignored. */
function scanForDocument(fullText: string, markerKey: string): unknown | null {
  const text = fullText.length > MAX_SCAN_LENGTH ? fullText.slice(0, MAX_SCAN_LENGTH) : fullText;
  const looksLikeDocument = (value: unknown): boolean =>
    typeof value === "object" && value !== null && markerKey in value;
  let starts = 0;
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
    if (++starts > MAX_SCAN_STARTS) return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const candidate = tryParse(text.slice(start, i + 1));
          if (candidate !== undefined && looksLikeDocument(candidate)) return candidate;
          break; // balanced but not our document — try the next opening brace
        }
      }
    }
  }
  return null;
}

/**
 * Pull a JSON value out of raw model output. Tries, in order: the whole text
 * as JSON; the contents of each markdown code fence; a balanced-brace scan for
 * an object containing `markerKey`. Returns the parsed value (validated by the
 * caller) or null when nothing parseable is found.
 */
export function extractJsonDocument(raw: string, markerKey: string): unknown | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const direct = tryParse(trimmed);
  if (direct !== undefined) return direct;

  // ```json ... ``` (or bare ```): try each fenced block's contents.
  const fences = trimmed.matchAll(/```[a-zA-Z]*\s*([\s\S]*?)```/g);
  for (const match of fences) {
    const fenced = tryParse(match[1].trim());
    if (fenced !== undefined) return fenced;
  }

  return scanForDocument(trimmed, markerKey);
}

/** The import flavor: an object carrying `"items"`. */
export function extractImportDocument(raw: string): unknown | null {
  return extractJsonDocument(raw, "items");
}
