// The hard AI lock: one stored flag that removes EVERY AI surface and entry
// point from the app — the AI tab, the import cards, the onboarding door, the
// guide row, the paywall bullet. For users who want zero AI, not as policy
// theater but as an actual absence: nothing in the UI leads there anymore.
// Data is untouched (commitments, backups and the AI trace all stay); flipping
// the switch back restores every surface.
//
// Device-scoped (its own key, like the app lock and logo consent) — kept OUT
// of the backup blob, so restoring a backup never flips this choice.
// Same external-store pattern as logo-consent: one source of truth, every
// surface re-renders live on toggle. The default (visible) renders safely
// before hydration; the flag flips in one frame once read.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

const KEY = "keel.ai.hidden.v1";

let hidden = false;
const listeners = new Set<() => void>();

function emit(next: boolean): void {
  hidden = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Read the stored choice once, at startup. Fire-and-forget.
let hydrating: Promise<void> | null = null;
export function hydrateAiVisibility(): Promise<void> {
  if (!hydrating) {
    hydrating = AsyncStorage.getItem(KEY)
      .then((raw) => emit(raw === "true"))
      .catch(() => emit(false));
  }
  return hydrating;
}

/** Flip the lock; persists and updates every AI surface live. */
export function setAiHidden(next: boolean): void {
  emit(next);
  void AsyncStorage.setItem(KEY, String(next)).catch(() => {
    // Best-effort: the in-memory choice already took effect for this session.
  });
}

/** True when every AI surface must disappear. */
export function useAiHidden(): boolean {
  return useSyncExternalStore(subscribe, () => hidden);
}
