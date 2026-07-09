// The in-flight AI import: drafts parsed from a paste, held here between the
// import hub, the review screen and per-draft edits in the Add form (route
// params can't carry objects). Deliberately NOT persisted — an import is a
// short-lived review session; nothing lands in real data until the user
// confirms on the review screen.

import type { ImportDraft, NewInstallmentInput, NewRecurringInput } from "@keel/core";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type DraftPatch =
  | { kind: "subscription"; input: NewRecurringInput }
  | { kind: "split"; input: NewInstallmentInput };

interface ImportSessionValue {
  drafts: ImportDraft[];
  /** Items in the paste too broken to become drafts — shown on review. */
  skipped: number;
  /** Start a fresh review session (replaces any previous drafts). */
  startSession: (drafts: ImportDraft[], skipped?: number) => void;
  getDraft: (id: string) => ImportDraft | undefined;
  /** Apply an edit made in the Add form. The user has looked the item over,
   *  so parse warnings retire; the unmatched account name survives only while
   *  no account is actually selected. */
  updateDraft: (id: string, patch: DraftPatch) => void;
  removeDraft: (id: string) => void;
  clear: () => void;
}

const ImportSessionContext = createContext<ImportSessionValue | null>(null);

export function ImportSessionProvider({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<ImportDraft[]>([]);
  const [skipped, setSkipped] = useState(0);

  const value = useMemo<ImportSessionValue>(
    () => ({
      drafts,
      skipped,
      startSession: (next, skippedCount = 0) => {
        setDrafts(next);
        setSkipped(skippedCount);
      },
      getDraft: (id) => drafts.find((d) => d.id === id),
      updateDraft: (id, patch) => {
        setDrafts((prev) =>
          prev.map((d) =>
            d.id === id
              ? ({
                  id: d.id,
                  ...patch,
                  accountName: patch.input.accountId ? undefined : d.accountName,
                  warnings: [],
                } as ImportDraft)
              : d,
          ),
        );
      },
      removeDraft: (id) => setDrafts((prev) => prev.filter((d) => d.id !== id)),
      clear: () => {
        setDrafts([]);
        setSkipped(0);
      },
    }),
    [drafts, skipped],
  );

  return <ImportSessionContext.Provider value={value}>{children}</ImportSessionContext.Provider>;
}

export function useImportSession(): ImportSessionValue {
  const ctx = useContext(ImportSessionContext);
  if (!ctx) throw new Error("useImportSession must be used within ImportSessionProvider");
  return ctx;
}
