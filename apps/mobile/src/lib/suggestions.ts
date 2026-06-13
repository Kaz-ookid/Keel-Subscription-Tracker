// Brand-bank text matching, shared by the upfront picker (SuggestionPicker)
// and the Add form's inline name suggestions — so both match and rank a typed
// query the same way.

import { SUGGESTED_COMMITMENTS, type SuggestedCommitment } from "@keel/core";

/** Does a brand-bank entry match a free-text query (its name or any alias)? */
export function suggestionMatches(s: SuggestedCommitment, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return (
    s.name.toLowerCase().includes(q) || (s.aliases ?? []).some((a) => a.toLowerCase().includes(q))
  );
}

/** Top brand-bank matches for a typed query — name-start matches first, then
 *  alphabetical. Empty for very short queries, so a dropdown doesn't flash on
 *  the first keystroke. */
export function matchSuggestions(query: string, limit = 5): SuggestedCommitment[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return SUGGESTED_COMMITMENTS.filter((s) => suggestionMatches(s, q))
    .sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      return aStarts - bStarts || a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}
