// The Apple Intelligence bridge: every request runs on the on-device model
// (SystemLanguageModel.default) — offline, unmetered, and nothing leaves the
// phone. Guided generation constrains the output to the @Generable schemas,
// so @keel/core always parses one shape. Compiles on older SDKs: everything
// model-related sits behind canImport + availability checks.
//
// The JS side (src/lib/apple-intelligence.ts) passes an `engine` parameter,
// kept for bridge stability: it reserves room for a future server-backed
// engine without changing the native API. Today every engine value resolves
// to the on-device model, and `cloudQuota()` reports unsupported so the UI
// never offers an engine that cannot run.

import ExpoModulesCore

#if canImport(FoundationModels)
  import FoundationModels

  @available(iOS 26.0, *)
  private func makeSession(engine _: String, instructions: String) -> LanguageModelSession {
    return LanguageModelSession(instructions: instructions)
  }

  /// Structured extraction wants determinism, not creativity, so temperature 0
  /// is the quality setting: the same notes must read the same way every time.
  /// maximumResponseTokens sits past anything the context can produce, so a
  /// multi-item answer is never truncated mid-list.
  @available(iOS 26.0, *)
  private let extractionOptions = GenerationOptions(temperature: 0, maximumResponseTokens: 4000)
#endif

public class AppleIntelligenceModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppleIntelligence")

    // On-device availability. "available" | "unsupported-os" | "device" |
    // "disabled" | "not-ready". The local engine only.
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

    // Whether a server-backed engine exists and has allowance left. Always
    // "unsupported": there is no server-backed engine (see the header), and
    // the JS side reads this so the UI never offers one.
    Function("cloudQuota") { () -> [String: Any] in
      return ["supported": false, "limitReached": false]
    }

    // Rough notes in, import-format v2 JSON out. The instructions come from
    // core (buildOnDevicePrompt / buildImportPrompt) so every path shares one
    // format and one parser.
    AsyncFunction("parseSubscriptions") {
      (input: String, instructions: String, engine: String) async throws -> String in
      #if canImport(FoundationModels)
        guard #available(iOS 26.0, *) else {
          throw AppleIntelligenceError.unavailable
        }
        // Every request runs on-device, so the on-device model must be ready.
        guard case .available = SystemLanguageModel.default.availability else {
          throw AppleIntelligenceError.unavailable
        }
        let session = makeSession(engine: engine, instructions: instructions)
        let response = try await session.respond(
          to: input,
          generating: ImportedDocument.self,
          options: extractionOptions
        )
        let data = try JSONEncoder().encode(response.content)
        return String(data: data, encoding: .utf8) ?? #"{"items":[]}"#
      #else
        throw AppleIntelligenceError.unavailable
      #endif
    }

    // The assistant: a natural-language request against core's grounding
    // snapshot comes back as plan JSON. Constrained decode again; core's
    // parseAssistantPlan resolves and validates before anything is shown.
    AsyncFunction("assist") {
      (input: String, instructions: String, engine: String) async throws -> String in
      #if canImport(FoundationModels)
        guard #available(iOS 26.0, *) else {
          throw AppleIntelligenceError.unavailable
        }
        // Every request runs on-device, so the on-device model must be ready.
        guard case .available = SystemLanguageModel.default.availability else {
          throw AppleIntelligenceError.unavailable
        }
        let session = makeSession(engine: engine, instructions: instructions)
        let response = try await session.respond(
          to: input,
          generating: AssistantPlanDocument.self,
          options: extractionOptions
        )
        let data = try JSONEncoder().encode(response.content)
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
