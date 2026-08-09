// Pixel-derived brand tints (DESIGN 9c follow-up, dev-build era): when a
// logo actually RENDERS (BrandBadge onLoad), its dominant color is extracted
// once and remembered per domain. brandBleed then has a real color for items
// the bank doesn't know (custom domains, unmatched AI imports) instead of
// falling to the theme accent.
//
// Same external-store idiom as logo-consent: one module map, a version
// counter components subscribe to, an AsyncStorage mirror hydrated at
// launch. The native module is loaded lazily and guarded — in Expo Go or an
// older dev build this whole file is a quiet no-op.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

import { usableBrandColor } from "./brand";

const KEY = "keel.brandtints.v1";

let tints: Record<string, string> = {};
/** Domains already tried this session (hit or miss) — no retry loops. */
const attempted = new Set<string>();
let version = 0;
const listeners = new Set<() => void>();

function emit(): void {
  version += 1;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getSnapshot = () => version;

/** Subscribe a component that paints brand colors: it re-renders when a
 *  freshly extracted tint lands, so rows repaint without a remount. */
export function useBrandTints(): number {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** The remembered tint for a domain, if one was ever extracted. */
export function dominantColor(domain: string): string | undefined {
  return tints[domain];
}

/** Read the stored map once, at startup (root layout, with the others). */
let hydrating: Promise<void> | null = null;
export function hydrateBrandTints(): Promise<void> {
  if (!hydrating) {
    hydrating = AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null) return;
        const clean: Record<string, string> = {};
        for (const [domain, hex] of Object.entries(parsed)) {
          if (typeof hex === "string" && usableBrandColor(hex)) clean[domain] = hex;
        }
        tints = clean;
        emit();
      })
      .catch(() => {
        // Best-effort cache; extraction just runs again.
      });
  }
  return hydrating;
}

// The native module, if this binary carries it. Resolved once, lazily.
type GetColors = (uri: string, config: Record<string, unknown>) => Promise<Record<string, unknown>>;
let getColors: GetColors | null | undefined;
function loadNativeModule(): GetColors | null {
  if (getColors !== undefined) return getColors;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-image-colors") as { getColors: GetColors };
    getColors = mod.getColors;
  } catch {
    getColors = null; // Expo Go / an older build: tints simply stay off.
  }
  return getColors;
}

/** Called when a logo has rendered: extract its dominant color once per
 *  domain and remember it. Fire-and-forget; never throws. */
export function noteBrandLogo(domain: string, uri: string): void {
  if (attempted.has(domain) || tints[domain]) return;
  attempted.add(domain);
  const extract = loadNativeModule();
  if (!extract) return;
  void extract(uri, { cache: true, key: domain, quality: "low" })
    .then((result) => {
      // iOS shape: { background, primary, secondary, detail }. The order
      // favors the mark over the plate: plates are white/near-black and the
      // near-mono filter rejects them.
      const candidates = [result.primary, result.secondary, result.background, result.detail];
      const hex = candidates.find((c): c is string => typeof c === "string" && usableBrandColor(c));
      if (!hex) return;
      tints = { ...tints, [domain]: hex.toUpperCase() };
      emit();
      void AsyncStorage.setItem(KEY, JSON.stringify(tints)).catch(() => {
        // The in-memory tint already took effect for this session.
      });
    })
    .catch(() => {
      // Extraction is a bonus, never an error surface.
    });
}
