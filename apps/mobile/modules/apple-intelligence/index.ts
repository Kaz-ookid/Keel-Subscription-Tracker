// Direct binding to the AppleIntelligence native module. Import this ONLY
// through src/lib/apple-intelligence.ts: requireNativeModule throws where the
// native half doesn't exist (Expo Go), and that lib catches it and reports
// "unavailable" instead.

import { requireNativeModule } from "expo-modules-core";

export interface AppleIntelligenceNative {
  /** "available" | "unsupported-os" | "device" | "disabled" | "not-ready" */
  availability(): string;
  /** Rough notes in, import-format-v1 JSON out (guided generation). */
  parseSubscriptions(input: string, instructions: string): Promise<string>;
}

export default requireNativeModule<AppleIntelligenceNative>("AppleIntelligence");
