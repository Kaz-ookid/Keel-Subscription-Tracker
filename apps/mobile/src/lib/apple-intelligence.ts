// The on-device AI surface (PROJECT_BRIEF §6.1 Path C/D), riding Apple
// Intelligence's Foundation Models: the import reader and the assistant.
// The UI links to both (import hub, AI tab); in Expo Go the native module
// doesn't exist, every probe lands on "unavailable", and the screens explain
// themselves until the dev build exists. Wiring steps live in
// modules/apple-intelligence/README.md.
//
// Division of labor, same philosophy as the widgets: Swift runs the model
// with a schema-constrained decode (it physically cannot emit anything but
// import format v1) and hands back raw JSON; @keel/core keeps OWNING the
// prompt (buildImportPrompt) and the validation (parseImportDocument), so
// the external-AI path and the on-device path stay one format, one parser,
// one review screen.

import {
  buildAssistantPrompt,
  buildOnDevicePrompt,
  type AssistantPromptContext,
  type CalendarDate,
  type CurrencyCode,
} from "@keel/core";

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

/** Rough notes in, import-format JSON out. Throws when the model can't run;
 *  feed the result to core's parseImportDocument like any pasted answer. */
export async function parseOnDevice(
  input: string,
  context: { today: CalendarDate; defaultCurrency: CurrencyCode },
): Promise<string> {
  // The compact, example-led prompt tuned for the small on-device model.
  const instructions = buildOnDevicePrompt(context);
  return (await native()).parseSubscriptions(input, instructions);
}

/** A natural-language request in, assistant plan JSON out. Throws when the
 *  model can't run; feed the result to core's parseAssistantPlan — nothing
 *  applies without the review screen. */
export async function assistOnDevice(
  input: string,
  context: AssistantPromptContext,
): Promise<string> {
  const instructions = buildAssistantPrompt(context);
  return (await native()).assist(input, instructions);
}
