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

function looksLikeDocument(value: unknown): boolean {
  return typeof value === "object" && value !== null && "items" in value;
}

/** Scan for balanced `{…}` blocks (string-aware) and return the first one that
 *  parses AND carries an `items` key — prose around it is ignored. */
function scanForDocument(text: string): unknown | null {
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
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
 * Pull the JSON value out of a raw paste. Tries, in order: the whole text as
 * JSON; the contents of each markdown code fence; a balanced-brace scan for an
 * object containing `"items"`. Returns the parsed value (validated later by
 * `parseImportDocument`) or null when nothing parseable is found.
 */
export function extractImportDocument(raw: string): unknown | null {
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

  return scanForDocument(trimmed);
}
