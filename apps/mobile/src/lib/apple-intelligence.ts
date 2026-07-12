// The on-device AI import (PROJECT_BRIEF §6.1 Path C/D), riding Apple
// Intelligence's Foundation Models — DORMANT until the dev-build era: in
// Expo Go the native module doesn't exist, every probe lands on
// "unavailable", and nothing in the app links to the screen yet
// (app/add/import-ondevice.tsx). Wiring steps live in
// modules/apple-intelligence/README.md.
//
// Division of labor, same philosophy as the widgets: Swift runs the model
// with a schema-constrained decode (it physically cannot emit anything but
// import format v1) and hands back raw JSON; @keel/core keeps OWNING the
// prompt (buildImportPrompt) and the validation (parseImportDocument), so
// the external-AI path and the on-device path stay one format, one parser,
// one review screen.

import { buildImportPrompt, type CalendarDate, type CurrencyCode } from "@keel/core";

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
  const instructions = buildImportPrompt(context);
  return (await native()).parseSubscriptions(input, instructions);
}
