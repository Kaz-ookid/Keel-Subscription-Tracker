// The day's cloud allowance, as far as the app can know it. Apple rations
// Private Cloud Compute per user; the framework exposes the standing
// (below, approaching, reached, with a reset instant once reached) and the
// model answers "quota" when a read hits the limit. Two sources, one
// store: the native probe is the truth whenever a build has it, refreshed
// when a reading door opens; a "quota" answer marks the allowance out
// until the reset instant, or until the next local day when no instant
// is known. Every "Keel reads it" door reads this store and says so up
// front instead of letting the user pick screenshots for a read that
// cannot happen. Same external-store pattern as ai-cloud.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

import { cloudQuotaInfo } from "./apple-intelligence";

const KEY = "keel.ai.cloud-quota-out-until.v1";

/** ISO instant until which the allowance is known to be out, or null. */
let outUntil: string | null = null;
const listeners = new Set<() => void>();

function emit(next: string | null): void {
  outUntil = next;
  listeners.forEach((listener) => listener());
  void AsyncStorage.setItem(KEY, next ?? "").catch(() => {
    // Best-effort: the in-memory mark already guards this session.
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Midnight at the start of the next local day. */
function nextLocalMidnight(): string {
  const next = new Date();
  next.setHours(24, 0, 0, 0);
  return next.toISOString();
}

let hydrating: Promise<void> | null = null;
export function hydrateQuota(): Promise<void> {
  if (!hydrating) {
    hydrating = AsyncStorage.getItem(KEY)
      .then((raw) => {
        outUntil = raw || null;
        listeners.forEach((listener) => listener());
      })
      .catch(() => undefined)
      .then(() => refreshQuota());
  }
  return hydrating;
}

/** Ask the framework where the allowance stands; a build without the
 *  probe answers "unknown" and the stored mark stands. */
export async function refreshQuota(): Promise<void> {
  const info = await cloudQuotaInfo();
  if (info.state === "reached") emit(info.resetDate ?? nextLocalMidnight());
  else if (info.state === "below" || info.state === "approaching") emit(null);
}

/** The model just answered "quota": the allowance is out until the next
 *  local day, unless the probe later names a reset instant. */
export function recordQuotaHit(): void {
  emit(nextLocalMidnight());
  void refreshQuota();
}

function quotaOutNow(): boolean {
  return outUntil !== null && Date.parse(outUntil) > Date.now();
}

/** True while the allowance is known to be used up. */
export function useQuotaOut(): boolean {
  return useSyncExternalStore(subscribe, quotaOutNow);
}
