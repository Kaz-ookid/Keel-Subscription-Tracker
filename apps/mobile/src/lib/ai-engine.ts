// Which model runs Keel's AI. Two engines, one user-facing choice:
//
//   "cloud" (default) — Apple's Private Cloud Compute model: 32K context,
//                       far better on messy real-world input. Needs a network
//                       connection and is metered against the user's own
//                       iCloud allowance (free to us; higher with iCloud+).
//   "local"           — the on-device model: offline, unlimited, nothing
//                       leaves the phone, and noticeably weaker.
//
// Cloud is the default because the on-device model could not carry the
// feature honestly (device QA 2026-07-20). Local stays a first-class opt-in
// for people who want processing to physically never leave the device, and
// it is the automatic fallback when cloud can't run (offline, allowance
// spent) — always announced, never silent.
//
// Device-scoped (its own key, like the app lock and the AI hard switch), so
// restoring a backup never changes which engine a phone uses. Same external
// -store pattern as ai-visibility: one source of truth, live updates.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

const KEY = "keel.ai.engine.v1";

export type AiEngine = "cloud" | "local";

let engine: AiEngine = "cloud";
const listeners = new Set<() => void>();

function emit(next: AiEngine): void {
  engine = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let hydrating: Promise<void> | null = null;
export function hydrateAiEngine(): Promise<void> {
  if (!hydrating) {
    hydrating = AsyncStorage.getItem(KEY)
      .then((raw) => emit(raw === "local" ? "local" : "cloud"))
      .catch(() => emit("cloud"));
  }
  return hydrating;
}

/** Switch engine; persists and updates every AI surface live. */
export function setAiEngine(next: AiEngine): void {
  emit(next);
  void AsyncStorage.setItem(KEY, next).catch(() => {
    // Best-effort: the in-memory choice already took effect this session.
  });
}

/** The engine the user chose (not necessarily the one that ends up running:
 *  cloud falls back to local when offline or out of allowance). */
export function useAiEngine(): AiEngine {
  return useSyncExternalStore(subscribe, () => engine);
}

/** Non-hook read, for call sites that only dispatch. */
export function currentAiEngine(): AiEngine {
  return engine;
}
