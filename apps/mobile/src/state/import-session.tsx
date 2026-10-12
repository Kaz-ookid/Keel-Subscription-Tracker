// The in-flight AI import: drafts parsed from a paste, held here between the
// import hub, the review screen and per-draft edits in the Add form (route
// params can't carry objects). Deliberately NOT persisted — an import is a
// short-lived review session; nothing lands in real data until the user
// confirms on the review screen.

import type {
  Account,
  AiTool,
  ImportDraft,
  NewInstallmentInput,
  NewRecurringInput,
} from "@keel/core";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type DraftPatch =
  | { kind: "subscription"; input: NewRecurringInput }
  | { kind: "split"; input: NewInstallmentInput };

interface ImportSessionValue {
  drafts: ImportDraft[];
  /** Items in the paste too broken to become drafts — shown on review. */
  skipped: number;
  /** Their names, when they had one. */
  skippedNames: string[];
  /** Which AI door produced the drafts — recorded in the AI trace when the
   *  review confirms. */
  source: AiTool;
  /** Start a fresh review session (replaces any previous drafts). */
  startSession: (
    drafts: ImportDraft[],
    skipped?: number,
    source?: AiTool,
    skippedNames?: string[],
  ) => void;
  getDraft: (id: string) => ImportDraft | undefined;
  /** Apply an edit made in the Add form. The user has looked the item over,
   *  so parse warnings retire; the unmatched account name survives only while
   *  no account is actually selected. */
  updateDraft: (id: string, patch: DraftPatch) => void;
  /** Put a draft on an existing account straight from the review screen.
   *  The pending "new account" name retires; the account warnings are
   *  recomputed for the chosen account; nothing else changes. */
  assignAccount: (id: string, account: Account) => void;
  removeDraft: (id: string) => void;
  clear: () => void;
}

const ImportSessionContext = createContext<ImportSessionValue | null>(null);

export function ImportSessionProvider({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<ImportDraft[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [skippedNames, setSkippedNames] = useState<string[]>([]);
  const [source, setSource] = useState<AiTool>("byo_import");

  const value = useMemo<ImportSessionValue>(
    () => ({
      drafts,
      skipped,
      skippedNames,
      source,
      startSession: (next, skippedCount = 0, from = "byo_import", names = []) => {
        setDrafts(next);
        setSkipped(skippedCount);
        setSkippedNames(names);
        setSource(from);
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
                  settlePast: d.settlePast,
                  // The user has looked the item over in the full form — the
                  // AI's flags and the parser's warnings are resolved.
                  assumedFields: [],
                  uncertainFields: [],
                  warnings: [],
                } as ImportDraft)
              : d,
          ),
        );
      },
      assignAccount: (id, account) => {
        setDrafts((prev) =>
          prev.map((d) => {
            if (d.id !== id) return d;
            const currency =
              d.kind === "subscription" ? d.input.amount.currency : d.input.totalAmount.currency;
            const warnings = d.warnings.filter(
              (w) => w.code !== "account-unmatched" && w.code !== "currency-mismatch",
            );
            if (account.currency !== currency) {
              warnings.push({ code: "currency-mismatch", detail: account.name });
            }
            return {
              ...d,
              input: { ...d.input, accountId: account.id },
              accountName: undefined,
              assumedFields: d.assumedFields.filter((f) => f !== "account"),
              warnings,
            } as ImportDraft;
          }),
        );
      },
      removeDraft: (id) => setDrafts((prev) => prev.filter((d) => d.id !== id)),
      clear: () => {
        setDrafts([]);
        setSkipped(0);
        setSkippedNames([]);
      },
    }),
    [drafts, skipped, skippedNames, source],
  );

  return <ImportSessionContext.Provider value={value}>{children}</ImportSessionContext.Provider>;
}

export function useImportSession(): ImportSessionValue {
  const ctx = useContext(ImportSessionContext);
  if (!ctx) throw new Error("useImportSession must be used within ImportSessionProvider");
  return ctx;
}
