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

import { requireOptionalNativeModule } from "expo-modules-core";

import { refineBrandColor, usableBrandColor } from "./brand-color";
import { hostOf } from "./logos";

// v3: extraction got a stricter colorless gate (near-black/white/grey
// candidates now read as MONO instead of a muddy tint). Bumping the key
// re-extracts every stored tint under the new rule; orphaned older blobs
// are swept on hydrate.
const KEY = "keel.brandtints.v3";
const OLD_KEYS = ["keel.brandtints.v1", "keel.brandtints.v2"];
/** Mono logos (every candidate near-black/white): which SIDE they fell on,
 *  so the badge can pick a CONTRASTING plate instead of guessing. */
const MONO_KEY = "keel.brandmono.v1";

// Extraction stays SILENT for users by design — but that made "no tint, no
// idea why" undebuggable on a device. In dev, Metro states each verdict.
function trace(message: string): void {
  if (__DEV__) console.warn(`[brand-tints] ${message}`);
}

let tints: Record<string, string> = {};
let monos: Record<string, "dark" | "light"> = {};
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
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => version;

/** Plain subscription (no hook) — for callers that react to a tint landing
 *  with their own state updates (the form's backup-swatch mirror). */
export function subscribeBrandTints(listener: () => void): () => void {
  return subscribe(listener);
}

/** Subscribe a component that paints brand colors: it re-renders when a
 *  freshly extracted tint lands, so rows repaint without a remount. */
export function useBrandTints(): number {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** The remembered tint for a domain, if one was ever extracted. */
export function dominantColor(domain: string): string | undefined {
  return tints[domain];
}

/** For a MONO logo (no usable tint): whether its mark is dark or light —
 *  the badge plate contrasts it (dark mark on white, light mark on navy). */
export function monoPolarity(domain: string): "dark" | "light" | undefined {
  return monos[domain];
}

/** Read the stored map once, at startup (root layout, with the others). */
let hydrating: Promise<void> | null = null;
export function hydrateBrandTints(): Promise<void> {
  if (!hydrating) {
    void AsyncStorage.multiRemove(OLD_KEYS).catch(() => {
      // Best-effort sweep of the older tint blobs.
    });
    hydrating = AsyncStorage.multiGet([KEY, MONO_KEY])
      .then(([tintRow, monoRow]) => {
        if (tintRow[1]) {
          const parsed: unknown = JSON.parse(tintRow[1]);
          if (typeof parsed === "object" && parsed !== null) {
            const clean: Record<string, string> = {};
            for (const [domain, hex] of Object.entries(parsed)) {
              if (typeof hex === "string" && usableBrandColor(hex)) clean[domain] = hex;
            }
            tints = clean;
          }
        }
        if (monoRow[1]) {
          const parsed: unknown = JSON.parse(monoRow[1]);
          if (typeof parsed === "object" && parsed !== null) {
            const clean: Record<string, "dark" | "light"> = {};
            for (const [domain, side] of Object.entries(parsed)) {
              if (side === "dark" || side === "light") clean[domain] = side;
            }
            monos = clean;
          }
        }
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
  // Probe availability FIRST: importing the JS package on a binary without
  // the native module logs a red error even inside try/catch (its module
  // scope calls requireNativeModule). The optional probe stays silent.
  if (!requireOptionalNativeModule("ImageColors")) {
    getColors = null; // Expo Go / an older build: tints simply stay off.
    trace("native module missing on this binary — tints are OFF (Expo Go or an old dev build)");
    return getColors;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-image-colors") as { getColors: GetColors };
    getColors = mod.getColors;
  } catch (error) {
    getColors = null;
    trace(`JS package failed to load (${String(error)})`);
  }
  return getColors;
}

/** Called when a logo has rendered: extract its dominant color once per
 *  domain and remember it. Fire-and-forget; never throws. */
export function noteBrandLogo(domain: string, uri: string): void {
  // The identity sheet renders a badge per KEYSTROKE ("n", "ne", "net"…);
  // only something shaped like a real host (dot + TLD) is worth a fetch.
  if (!/\.[a-z]{2,}$/i.test(hostOf(domain))) return;
  if (attempted.has(domain) || tints[domain]) return;
  attempted.add(domain);
  const extract = loadNativeModule();
  if (!extract) return;
  void extract(uri, { cache: true, key: domain, quality: "low" })
    .then((result) => {
      // iOS shape: { background, primary, secondary, detail }. The plate
      // colors (white/near-black/grey) are filtered out; among what's left
      // the most SATURATED candidate wins and gets un-washed — downscaled
      // favicons hand the histogram a white-blended pastel otherwise.
      const candidates = [result.primary, result.secondary, result.background, result.detail];
      const hex = refineBrandColor(candidates);
      if (!hex) {
        // A MONO logo. Remember which side its ink falls on, so the badge
        // plate can contrast it (a white mark on a white plate is invisible).
        const values = candidates.filter((c): c is string => typeof c === "string");
        const luminances = values
          .filter((c) => /^#[0-9a-fA-F]{6}$/.test(c))
          .map((c) => {
            const n = parseInt(c.slice(1), 16);
            return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
          });
        if (luminances.length > 0) {
          const mean = luminances.reduce((a, b) => a + b, 0) / luminances.length;
          monos = { ...monos, [domain]: mean < 0.5 ? "dark" : "light" };
          emit();
          void AsyncStorage.setItem(MONO_KEY, JSON.stringify(monos)).catch(() => {
            // In-memory already took effect.
          });
        }
        trace(`${domain}: mono logo (${values.join(", ")})`);
        return;
      }
      tints = { ...tints, [domain]: hex };
      emit();
      trace(
        `${domain}: tint ${hex} (from ${candidates
          .filter((c): c is string => typeof c === "string")
          .join(", ")})`,
      );
      void AsyncStorage.setItem(KEY, JSON.stringify(tints)).catch(() => {
        // The in-memory tint already took effect for this session.
      });
    })
    .catch((error: unknown) => {
      // Extraction is a bonus, never a user-facing error surface.
      trace(`${domain}: extraction failed (${String(error)})`);
    });
}
