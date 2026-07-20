// The Apple Intelligence bridge. TWO engines behind one API, chosen per
// request by the JS side (src/lib/apple-intelligence.ts):
//
//   "cloud" — PrivateCloudComputeLanguageModel: Apple's server model, 32K
//             context, far better on messy multi-item input. Needs a network
//             connection and is metered against the USER's iCloud account
//             (free to us under the Small Business Program). The default.
//   "local" — SystemLanguageModel.default: the on-device model. Offline,
//             unlimited, private, and markedly weaker. The opt-in fallback.
//
// Guided generation constrains BOTH engines to the same @Generable schemas,
// so whichever runs, @keel/core parses one shape. Compiles on older SDKs:
// everything model-related sits behind canImport + availability checks.

import ExpoModulesCore

#if canImport(FoundationModels)
  import FoundationModels

  /// One session builder for both engines: the only difference is which model
  /// backs it (Apple's LanguageModel protocol makes this a one-line swap).
  @available(iOS 26.0, *)
  private func makeSession(engine: String, instructions: String) -> LanguageModelSession {
    if engine == "cloud" {
      return LanguageModelSession(
        model: PrivateCloudComputeLanguageModel(),
        instructions: instructions
      )
    }
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

    // The cloud engine's standing: whether PCC can run at all, and whether the
    // user's daily allowance is spent. The JS side uses this to show the
    // remaining-allowance hint and to warn BEFORE quietly dropping to the
    // weaker local model.
    Function("cloudQuota") { () -> [String: Any] in
      #if canImport(FoundationModels)
        guard #available(iOS 26.0, *) else {
          return ["supported": false, "limitReached": false]
        }
        let usage = PrivateCloudComputeLanguageModel().quotaUsage
        return ["supported": true, "limitReached": usage.isLimitReached]
      #else
        return ["supported": false, "limitReached": false]
      #endif
    }

    // Rough notes in, import-format-v1 JSON out. The instructions come from
    // core (buildOnDevicePrompt / buildImportPrompt) so every path shares one
    // format and one parser.
    AsyncFunction("parseSubscriptions") {
      (input: String, instructions: String, engine: String) async throws -> String in
      #if canImport(FoundationModels)
        guard #available(iOS 26.0, *) else {
          throw AppleIntelligenceError.unavailable
        }
        // Only the local engine depends on the on-device model being ready;
        // the cloud engine has its own availability and quota.
        if engine != "cloud" {
          guard case .available = SystemLanguageModel.default.availability else {
            throw AppleIntelligenceError.unavailable
          }
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
        // Only the local engine depends on the on-device model being ready;
        // the cloud engine has its own availability and quota.
        if engine != "cloud" {
          guard case .available = SystemLanguageModel.default.availability else {
            throw AppleIntelligenceError.unavailable
          }
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
