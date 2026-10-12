// "Keel reads it for you" (PROJECT_BRIEF §6.1): the AI import and the
// assistant, run by Apple's Private Cloud Compute model through the native
// bridge in modules/apple-intelligence. Cloud-or-nothing by decision
// (2026-10-11): the on-device model could not carry the feature, so when the
// cloud model cannot run (OS, device, offline, allowance spent) the screens
// say so and point at bring-your-own AI; nothing degrades silently.
//
// Sending anything is OPT-IN (ai-cloud.ts): the screens check consent before
// the first byte leaves the phone. In Expo Go the native module doesn't
// exist, every probe lands on "unavailable", and the screens explain
// themselves.

import {
  buildAssistantPrompt,
  buildKeelReadsPrompt,
  type AssistantPromptContext,
  type CalendarDate,
  type CurrencyCode,
} from "@keel/core";

export type KeelReadsAvailability =
  /** Ready to read. */
  | "available"
  /** iOS below 27 (or a build without the framework). */
  | "unsupported-os"
  /** This iPhone cannot use the cloud model. */
  | "device"
  /** Supported, but Apple Intelligence is turned off in iOS Settings. */
  | "disabled"
  /** Apple's side isn't ready; retry later. */
  | "not-ready"
  /** Native module missing (Expo Go) or probe failed. */
  | "unavailable";

/** The one sentence per wall, for every screen that explains it. */
export const REASON_KEYS: Record<Exclude<KeelReadsAvailability, "available">, string> = {
  "unsupported-os": "keelReads.reasonOs",
  device: "keelReads.reasonDevice",
  disabled: "keelReads.reasonDisabled",
  "not-ready": "keelReads.reasonNotReady",
  unavailable: "keelReads.reasonBuild",
};

/** Why a read failed, in the bridge's contract (see AppleIntelligenceError
 *  in the native module). The screens have a message for each. */
export type KeelReadsFailure =
  | "offline"
  | "quota"
  | "service"
  | "unavailable"
  | "model-failed"
  | "image-unreadable";

export class KeelReadsError extends Error {
  constructor(public readonly reason: KeelReadsFailure) {
    super(reason);
  }
}

async function native() {
  const binding = await import("../../modules/apple-intelligence");
  return binding.default;
}

export async function keelReadsAvailability(): Promise<KeelReadsAvailability> {
  try {
    const result = (await native()).availability();
    return ["available", "unsupported-os", "device", "disabled", "not-ready"].includes(result)
      ? (result as KeelReadsAvailability)
      : "unavailable";
  } catch {
    return "unavailable";
  }
}

/** True when the cloud model exists on this OS and build, whatever its
 *  momentary state: the surfaces that OFFER it (hub card, Settings switch)
 *  key on this; the screen itself explains the finer states. */
export function isKeelReadsOffered(availability: KeelReadsAvailability): boolean {
  return availability !== "unsupported-os" && availability !== "unavailable";
}

function toFailure(error: unknown): KeelReadsError {
  const message = error instanceof Error ? error.message : String(error);
  const reasons: KeelReadsFailure[] = [
    "offline",
    "quota",
    "service",
    "unavailable",
    "image-unreadable",
  ];
  const hit = reasons.find((reason) => message.includes(reason));
  return new KeelReadsError(hit ?? "model-failed");
}

/** Rough notes in, import-format JSON out; feed it to core's
 *  parseImportDocument like any pasted answer. Throws KeelReadsError. */
export async function readWithKeel(
  input: string,
  context: { today: CalendarDate; defaultCurrency: CurrencyCode },
): Promise<string> {
  try {
    return await (await native()).parseSubscriptions(input, buildKeelReadsPrompt(context), "cloud");
  } catch (error) {
    throw toFailure(error);
  }
}

/** A natural-language request in, assistant plan JSON out. Nothing applies
 *  without the review screen. Throws KeelReadsError. */
export async function assistWithKeel(
  input: string,
  context: AssistantPromptContext,
): Promise<string> {
  try {
    return await (await native()).assist(input, buildAssistantPrompt(context), "cloud");
  } catch (error) {
    throw toFailure(error);
  }
}

/** A picked screenshot's text, read on the phone by Vision (nothing leaves
 *  the device for this step); the caller shows it before anything is sent.
 *  Throws KeelReadsError("image-unreadable"). */
export async function recognizeScreenshot(uri: string): Promise<string> {
  try {
    return await (await native()).recognizeText(uri);
  } catch (error) {
    throw toFailure(error);
  }
}

/** A PDF's text, read on the phone by PDFKit (nothing leaves the device for
 *  this step). Throws KeelReadsError("image-unreadable") when the file has
 *  no readable text (a scan without a text layer, for instance). */
export async function extractPdfText(uri: string): Promise<string> {
  try {
    return await (await native()).extractPdfText(uri);
  } catch (error) {
    throw toFailure(error);
  }
}
