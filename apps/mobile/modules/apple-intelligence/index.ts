// Direct binding to the AppleIntelligence native module. Import this ONLY
// through src/lib/apple-intelligence.ts: requireNativeModule throws where the
// native half doesn't exist (Expo Go), and that lib catches it and reports
// "unavailable" instead.

import { requireNativeModule } from "expo-modules-core";

export interface AppleIntelligenceNative {
  /** Cloud model (Private Cloud Compute) standing:
   *  "available" | "unsupported-os" | "device" | "disabled" | "not-ready" */
  availability(): string;
  /** Rough notes in, import-format v2 JSON out (guided generation). Rejects
   *  with "offline" | "quota" | "service" | "unavailable" | "model-failed".
   *  `engine` is reserved for a future second engine; pass "cloud". */
  parseSubscriptions(input: string, instructions: string, engine: string): Promise<string>;
  /** A natural-language request in, assistant plan JSON out
   *  ({"actions":[...],"additions":[...]}, guided generation). */
  assist(input: string, instructions: string, engine: string): Promise<string>;
}

export default requireNativeModule<AppleIntelligenceNative>("AppleIntelligence");
