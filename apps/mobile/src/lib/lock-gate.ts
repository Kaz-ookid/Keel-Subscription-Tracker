// The write gates (PROJECT_BRIEF §7.3): once the trial has expired without
// a purchase, the app is READ-ONLY. Locked blocks adding/editing/deleting,
// every import and AI surface, reminders and widgets. It deliberately does
// NOT block viewing anything, insights, mark-paid/skip/undo, or export —
// "you keep your data, the tool stops working for you", never "we hid your
// numbers".
//
// Two shapes cover every surface:
//   - useLockGuard() wraps an in-place write action's onPress: it runs while
//     unlocked and presents the locked sheet instead once locked.
//   - useLockedRedirect() sits at the top of a write SCREEN (add flow,
//     AI, notifications): locked mounts bounce to the locked sheet, which
//     also covers deep links and stale navigation stacks.

import { useRouter } from "expo-router";
import { useEffect } from "react";

import { useEntitlement } from "./entitlement";

/** True once the trial has expired without a purchase. */
export function useLocked(): boolean {
  return useEntitlement().locked;
}

/** Wrap a write action: `onPress={guard(() => …)}` runs it while unlocked,
 *  or opens the locked sheet instead. */
export function useLockGuard(): (action: () => void) => () => void {
  const router = useRouter();
  const locked = useLocked();
  return (action) => () => {
    if (locked) router.push("/locked");
    else action();
  };
}

/** For write screens: replace a locked mount with the locked sheet. Returns
 *  `locked` so the caller can render nothing while the redirect lands. */
export function useLockedRedirect(): boolean {
  const router = useRouter();
  const locked = useLocked();
  useEffect(() => {
    if (locked) router.replace("/locked");
  }, [locked, router]);
  return locked;
}
