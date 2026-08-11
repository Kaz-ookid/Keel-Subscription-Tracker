// Services the user created themselves join the brand bank: type "Migros
// Fitness" once, and next time it sits in the known-brands list like any
// brand entry (beta lesson: a created service that vanished from the bank
// read as the app forgetting it). Device-persisted, deduped against the
// built-in bank by name, capped so the list stays a bank and not a log.
// Same external-store idiom as the other device-scoped stores.

import { SUGGESTED_COMMITMENTS, type SuggestedCommitment } from "@keel/core";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

const KEY = "keel.custombank.v1";
const CAP = 100;

let entries: SuggestedCommitment[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getSnapshot = () => entries;

/** The user's own bank entries, oldest first. */
export function useCustomBank(): readonly SuggestedCommitment[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}

const builtinNames = new Set(SUGGESTED_COMMITMENTS.map((s) => s.name.toLowerCase()));

function isEntry(value: unknown): value is SuggestedCommitment {
  if (typeof value !== "object" || value === null) return false;
  const e = value as { id?: unknown; name?: unknown; unit?: unknown };
  return (
    typeof e.id === "string" &&
    typeof e.name === "string" &&
    e.name.trim().length > 0 &&
    (e.unit === "month" || e.unit === "year")
  );
}

let hydrating: Promise<void> | null = null;
export function hydrateCustomBank(): Promise<void> {
  if (!hydrating) {
    hydrating = AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return;
        entries = parsed.filter(isEntry);
        emit();
      })
      .catch(() => {
        // Best-effort cache.
      });
  }
  return hydrating;
}

export interface CustomServiceInput {
  name: string;
  categoryId?: string;
  color?: string;
  domain?: string;
  unit: "month" | "year";
}

/** Remember a user-created service. No-op for names the built-in bank (or
 *  this list) already knows — those rows exist already. */
export function noteCustomService(input: CustomServiceInput): void {
  const name = input.name.trim();
  if (!name) return;
  const key = name.toLowerCase();
  if (builtinNames.has(key)) return;
  if (entries.some((e) => e.name.toLowerCase() === key)) return;
  const entry: SuggestedCommitment = {
    id: `custom-${key.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}-${entries.length}`,
    name,
    categoryId: input.categoryId,
    color: input.color,
    domain: input.domain,
    unit: input.unit,
  };
  entries = [...entries, entry].slice(-CAP);
  emit();
  void AsyncStorage.setItem(KEY, JSON.stringify(entries)).catch(() => {
    // The in-memory entry already took effect for this session.
  });
}
