// Direct binding to the AppleIntelligence native module. Import this ONLY
// through src/lib/apple-intelligence.ts: requireNativeModule throws where the
// native half doesn't exist (Expo Go), and that lib catches it and reports
// "unavailable" instead.

import { requireNativeModule } from "expo-modules-core";

export interface AppleIntelligenceNative {
  /** ON-DEVICE model standing:
   *  "available" | "unsupported-os" | "device" | "disabled" | "not-ready" */
  availability(): string;
  /** Cloud (Private Cloud Compute) standing: whether it is supported at all,
   *  and whether the user's daily allowance is spent. */
  cloudQuota(): { supported: boolean; limitReached: boolean };
  /** Rough notes in, import-format-v1 JSON out (guided generation).
   *  `engine` is "cloud" (PCC) or "local" (on-device). */
  parseSubscriptions(input: string, instructions: string, engine: string): Promise<string>;
  /** A natural-language request in, assistant plan JSON out
   *  ({"actions":[...],"additions":[...]}, guided generation). */
  assist(input: string, instructions: string, engine: string): Promise<string>;
}

export default requireNativeModule<AppleIntelligenceNative>("AppleIntelligence");
