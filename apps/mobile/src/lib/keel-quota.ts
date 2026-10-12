// Where the cloud allowance stands, as Apple reports it. Apple rations
// Private Cloud Compute per user and the framework exposes the standing
// (below, approaching, reached, with a reset instant once reached). The
// probe is asked whenever a reading door opens or a read fails on the
// quota, and the doors say "used up" only on its word: a build without
// the probe, or a probe that answers nothing, never closes a door, since
// the app cannot know when the allowance actually comes back. Nothing is
// persisted; the probe is the memory. Same external-store pattern as
// ai-cloud, in memory only.

import { useSyncExternalStore } from "react";

import { cloudQuotaInfo } from "./apple-intelligence";

/** ISO instant until which Apple says the allowance is out, or null. */
let outUntil: string | null = null;
const listeners = new Set<() => void>();

function emit(next: string | null): void {
  outUntil = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Ask the framework where the allowance stands. "reached" without a
 *  reset instant closes the doors only until the next probe; anything
 *  unknown leaves them open. */
export async function refreshQuota(): Promise<void> {
  const info = await cloudQuotaInfo();
  if (info.state === "reached") emit(info.resetDate ?? "reached");
  else emit(null);
}

function quotaOutNow(): boolean {
  if (outUntil === null) return false;
  if (outUntil === "reached") return true;
  return Date.parse(outUntil) > Date.now();
}

/** True while Apple says the allowance is used up. */
export function useQuotaOut(): boolean {
  return useSyncExternalStore(subscribe, quotaOutNow);
}
