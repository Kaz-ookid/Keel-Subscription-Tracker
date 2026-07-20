// The Apple Intelligence bridge: availability probing + one job — turn rough
// subscription notes into Keel's import JSON with the ON-DEVICE model
// (Foundation Models framework, iOS 26+). Guided generation constrains the
// output to the ImportSchema mirror of import format v1; the JS side then
// runs it through the SAME parse + review pipeline as the bring-your-own-AI
// path. Compiles on older SDKs too: everything model-related sits behind
// canImport + availability checks and reports "unsupported-os" instead.

import ExpoModulesCore

#if canImport(FoundationModels)
  import FoundationModels
#endif

public class AppleIntelligenceModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppleIntelligence")

    // "available" | "unsupported-os" | "device" | "disabled" | "not-ready"
    Function("availability") { () -> String in
      #if canImport(FoundationModels)
        guard #available(iOS 26.0, *) else { return "unsupported-os" }
        switch SystemLanguageModel.default.availability {
        case .available:
          return "available"
        case .unavailable(.deviceNotEligible):
          return "device"
        case .unavailable(.appleIntelligenceNotEnabled):
          return "disabled"
        case .unavailable(.modelNotReady):
          return "not-ready"
        case .unavailable:
          return "device"
        }
      #else
        return "unsupported-os"
      #endif
    }

    // Returns the import document as a JSON string ({"items":[...]}). The
    // instructions are the SAME prompt the app generates for external AIs
    // (core's buildImportPrompt), so both paths learn from one source.
    AsyncFunction("parseSubscriptions") { (input: String, instructions: String) async throws -> String in
      #if canImport(FoundationModels)
        guard #available(iOS 26.0, *) else {
          throw AppleIntelligenceError.unavailable
        }
        guard case .available = SystemLanguageModel.default.availability else {
          throw AppleIntelligenceError.unavailable
        }
        let session = LanguageModelSession(instructions: instructions)
        // Structured extraction wants determinism, not creativity, so
        // temperature 0 (NOT a high value) is the quality setting here: the
        // same notes must read the same way every time. maximumResponseTokens
        // is set past anything the context can actually produce, so a
        // multi-item answer is never truncated mid-list. Note the model's
        // TOTAL context stays fixed: this widens the OUTPUT budget, never the
        // amount of input it can hold (that ceiling is architectural).
        let response = try await session.respond(
          to: input,
          generating: ImportedDocument.self,
          options: GenerationOptions(temperature: 0, maximumResponseTokens: 4000)
        )
        let encoder = JSONEncoder()
        let data = try encoder.encode(response.content)
        return String(data: data, encoding: .utf8) ?? #"{"items":[]}"#
      #else
        throw AppleIntelligenceError.unavailable
      #endif
    }

    // The assistant: a natural-language request against the grounding
    // snapshot (core's buildAssistantPrompt) comes back as the plan JSON
    // ({"actions":[...],"additions":[...]}). Constrained decode again; core's
    // parseAssistantPlan resolves and validates before anything is shown.
    AsyncFunction("assist") { (input: String, instructions: String) async throws -> String in
      #if canImport(FoundationModels)
        guard #available(iOS 26.0, *) else {
          throw AppleIntelligenceError.unavailable
        }
        guard case .available = SystemLanguageModel.default.availability else {
          throw AppleIntelligenceError.unavailable
        }
        let session = LanguageModelSession(instructions: instructions)
        // Same reasoning as the import: low temperature for consistent,
        // deterministic plans; a headroom of response tokens for multi-action
        // replies.
        let response = try await session.respond(
          to: input,
          generating: AssistantPlanDocument.self,
          options: GenerationOptions(temperature: 0, maximumResponseTokens: 4000)
        )
        let encoder = JSONEncoder()
        let data = try encoder.encode(response.content)
        return String(data: data, encoding: .utf8) ?? #"{"actions":[],"additions":[]}"#
      #else
        throw AppleIntelligenceError.unavailable
      #endif
    }
  }
}

enum AppleIntelligenceError: Error, LocalizedError {
  case unavailable

  var errorDescription: String? {
    switch self {
    case .unavailable:
      return "Apple Intelligence is not available on this device."
    }
  }
}
