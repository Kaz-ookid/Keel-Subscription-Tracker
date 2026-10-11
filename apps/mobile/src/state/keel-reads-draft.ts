// The hand-off between the Keel-reads input screen and its screenshot
// preview: the text read off the pictures (already scrubbed) and what the
// scrubber removed. A tiny external store, like ai-cloud: the preview is a
// real route (so Back behaves), and route params are no place for a page
// of OCR text.

import { useSyncExternalStore } from "react";

import type { ScrubResult } from "@keel/core";

export interface KeelReadsDraft {
  text: string;
  removed: ScrubResult["removed"];
  count: number;
  screenshots: number;
}

let draft: KeelReadsDraft | null = null;
const listeners = new Set<() => void>();

function emit(next: KeelReadsDraft | null): void {
  draft = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setKeelReadsDraft(next: KeelReadsDraft | null): void {
  emit(next);
}

/** Replace the text while keeping what the scrubber reported. */
export function editKeelReadsDraftText(text: string): void {
  if (draft) emit({ ...draft, text });
}

export function useKeelReadsDraft(): KeelReadsDraft | null {
  return useSyncExternalStore(subscribe, () => draft);
}
