// The AI surface (PROJECT_BRIEF §6.1), riding Apple's Foundation Models with
// TWO engines: Private Cloud Compute (default, 32K context, needs network,
// metered against the user's iCloud allowance) and the on-device model
// (offline, unlimited, weaker). Which one the user prefers lives in
// ai-engine.ts; which one actually RAN is reported back on every call, so the
// UI can say so instead of degrading silently.
//
// In Expo Go the native module doesn't exist, every probe lands on
// "unavailable", and the screens explain themselves. Wiring steps live in
// modules/apple-intelligence/README.md.

import {
  buildAssistantPrompt,
  buildImportPrompt,
  buildOnDevicePrompt,
  type AssistantPromptContext,
  type CalendarDate,
  type CurrencyCode,
} from "@keel/core";

import { currentAiEngine, type AiEngine } from "./ai-engine";

export type OnDeviceAvailability =
  /** Ready to parse. */
  | "available"
  /** iOS below 26 (or a build without the framework). */
  | "unsupported-os"
  /** Hardware can't run Apple Intelligence. */
  | "device"
  /** Supported, but Apple Intelligence is turned off in iOS Settings. */
  | "disabled"
  /** Enabled, model still downloading; retry later. */
  | "not-ready"
  /** Native module missing (Expo Go) or probe failed. */
  | "unavailable";

/** What the cloud engine can do right now. */
export interface CloudStanding {
  /** PCC exists on this OS/build. */
  supported: boolean;
  /** The user's daily allowance is spent; cloud calls will fall back. */
  limitReached: boolean;
}

/** Every AI call reports which engine actually produced the answer, so the
 *  UI can badge it and never imply cloud quality from a local result. */
export interface EngineResult {
  json: string;
  ranOn: AiEngine;
  /** True when the user wanted cloud but we had to use the on-device model. */
  fellBack: boolean;
}

async function native() {
  const binding = await import("../../modules/apple-intelligence");
  return binding.default;
}

export async function onDeviceAvailability(): Promise<OnDeviceAvailability> {
  try {
    const result = (await native()).availability();
    return ["available", "unsupported-os", "device", "disabled", "not-ready"].includes(result)
      ? (result as OnDeviceAvailability)
      : "unavailable";
  } catch {
    return "unavailable";
  }
}

/** Cloud standing, including whether today's allowance is used up. Safe
 *  everywhere: an unsupported build reports `supported: false`. */
export async function cloudStanding(): Promise<CloudStanding> {
  try {
    const quota = (await native()).cloudQuota();
    return {
      supported: Boolean(quota?.supported),
      limitReached: Boolean(quota?.limitReached),
    };
  } catch {
    return { supported: false, limitReached: false };
  }
}

/** Decide the engine for THIS call. Cloud is used when the user wants it and
 *  it can actually run; otherwise we fall back to the on-device model and say
 *  so. Callers warn the user before a fallback answer is produced. */
export async function resolveEngine(): Promise<{ engine: AiEngine; fellBack: boolean }> {
  const wanted = currentAiEngine();
  if (wanted === "local") return { engine: "local", fellBack: false };
  const standing = await cloudStanding();
  const usable = standing.supported && !standing.limitReached;
  return usable ? { engine: "cloud", fellBack: false } : { engine: "local", fellBack: true };
}

/** Rough notes in, import-format JSON out. Throws when no engine can run;
 *  feed `json` to core's parseImportDocument like any pasted answer. */
export async function parseOnDevice(
  input: string,
  context: { today: CalendarDate; defaultCurrency: CurrencyCode },
  /** Pass the engine the screen already resolved (so it could warn about a
   *  fallback first); omit to resolve here. */
  chosen?: { engine: AiEngine; fellBack: boolean },
): Promise<EngineResult> {
  const { engine, fellBack } = chosen ?? (await resolveEngine());
  // The cloud model handles the full instructions; the small on-device model
  // needs the compact, example-led variant.
  const instructions =
    engine === "cloud" ? buildImportPrompt(context) : buildOnDevicePrompt(context);
  const json = await (await native()).parseSubscriptions(input, instructions, engine);
  return { json, ranOn: engine, fellBack };
}

/** A natural-language request in, assistant plan JSON out. Nothing applies
 *  without the review screen. */
export async function assistOnDevice(
  input: string,
  context: AssistantPromptContext,
  chosen?: { engine: AiEngine; fellBack: boolean },
): Promise<EngineResult> {
  const { engine, fellBack } = chosen ?? (await resolveEngine());
  const instructions = buildAssistantPrompt(context);
  const json = await (await native()).assist(input, instructions, engine);
  return { json, ranOn: engine, fellBack };
}
