// The in-flight assistant plan, held between the assistant screen and its
// review screen (route params can't carry objects). Like an import session,
// deliberately NOT persisted: a plan is a short-lived review; nothing touches
// real data until the user confirms, and leaving the flow discards it.

import type { AssistantPlan } from "@keel/core";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface AssistantSessionValue {
  plan: AssistantPlan | null;
  /** Ids (operation ids + addition draft ids) the user left out on review. */
  excluded: ReadonlySet<string>;
  startPlan: (plan: AssistantPlan) => void;
  toggleExcluded: (id: string) => void;
  clear: () => void;
}

const AssistantSessionContext = createContext<AssistantSessionValue | null>(null);

export function AssistantSessionProvider({ children }: { children: ReactNode }) {
  const [plan, setPlan] = useState<AssistantPlan | null>(null);
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());

  const value = useMemo<AssistantSessionValue>(
    () => ({
      plan,
      excluded,
      startPlan: (next) => {
        setPlan(next);
        setExcluded(new Set());
      },
      toggleExcluded: (id) => {
        setExcluded((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      },
      clear: () => {
        setPlan(null);
        setExcluded(new Set());
      },
    }),
    [plan, excluded],
  );

  return (
    <AssistantSessionContext.Provider value={value}>{children}</AssistantSessionContext.Provider>
  );
}

export function useAssistantSession(): AssistantSessionValue {
  const ctx = useContext(AssistantSessionContext);
  if (!ctx) throw new Error("useAssistantSession must be used within AssistantSessionProvider");
  return ctx;
}
