// Tab re-tap resets (§9i): tapping the ACTIVE dock tab sends its screen home
// (Payments back to Upcoming at the top; Insights/Settings scroll up) — the
// standard iOS tab-bar behavior. The dock bumps a per-tab counter; screens
// subscribe and react. Module-level, like the experiments flag store.

import { useEffect, useState } from "react";

const counters = new Map<string, number>();
const listeners = new Map<string, Set<(count: number) => void>>();

/** Called by the dock when the already-active tab is tapped again. */
export function bumpTabReset(tab: string): void {
  const next = (counters.get(tab) ?? 0) + 1;
  counters.set(tab, next);
  listeners.get(tab)?.forEach((listener) => listener(next));
}

/** Subscribe a callback to this tab's re-taps; returns the unsubscribe.
 *  For screens that must SET STATE on reset (the lint-clean path). */
export function onTabReset(tab: string, callback: () => void): () => void {
  let set = listeners.get(tab);
  if (!set) {
    set = new Set();
    listeners.set(tab, set);
  }
  const listener = () => callback();
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}

// One-shot handoff into the Payments tab: another screen (e.g. the browse
// picker closing) can ask it to open on a specific view. Consumed once.
let pendingPaymentsView: "upcoming" | "all" | null = null;

export function requestPaymentsView(view: "upcoming" | "all"): void {
  pendingPaymentsView = view;
}

export function consumePaymentsView(): "upcoming" | "all" | null {
  const view = pendingPaymentsView;
  pendingPaymentsView = null;
  return view;
}

/** A counter that increments each time this tab is re-tapped; watch it with
 *  an effect and send the screen home. */
export function useTabReset(tab: string): number {
  const [count, setCount] = useState(() => counters.get(tab) ?? 0);
  useEffect(() => {
    let set = listeners.get(tab);
    if (!set) {
      set = new Set();
      listeners.set(tab, set);
    }
    set.add(setCount);
    return () => {
      set.delete(setCount);
    };
  }, [tab]);
  return count;
}
