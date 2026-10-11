// The Apple Intelligence bridge: every request runs on Apple's Private Cloud
// Compute model (PrivateCloudComputeLanguageModel, iOS 27), opt-in from the
// JS side and gated by the `com.apple.developer.private-cloud-compute`
// entitlement. Guided generation constrains the output to the @Generable
// schemas, so @keel/core always parses one shape. Compiles on older SDKs:
// everything model-related sits behind canImport + availability checks, and
// below iOS 27 every call reports "unsupported-os".
//
// The JS side (src/lib/apple-intelligence.ts) passes an `engine` parameter,
// kept for bridge stability: it reserves room for another engine without
// changing the native API. Today every value resolves to the cloud model.
//
// Failure reporting is a small string contract (see AppleIntelligenceError):
// the JS maps "offline" / "quota" / "service" / "unavailable" to their own
// messages instead of one generic "the model failed".

import ExpoModulesCore

#if canImport(FoundationModels)
  import FoundationModels

  /// The cloud model's standing, in the bridge's string contract. The
  /// unavailability reasons are classified by description rather than by
  /// case so the mapping survives SDK renames; anything unrecognized reads
  /// as "device" (the honest catch-all: it cannot run here).
  @available(iOS 27.0, *)
  private func cloudAvailability() -> String {
    switch PrivateCloudComputeLanguageModel().availability {
    case .available:
      return "available"
    case .unavailable(let reason):
      let why = String(describing: reason).lowercased()
      if why.contains("eligible") { return "device" }
      if why.contains("enabled") { return "disabled" }
      if why.contains("ready") { return "not-ready" }
      return "device"
    @unknown default:
      return "device"
    }
  }

  @available(iOS 27.0, *)
  private func makeSession(engine _: String, instructions: String) -> LanguageModelSession {
    return LanguageModelSession(
      model: PrivateCloudComputeLanguageModel(), instructions: instructions)
  }

  /// Structured extraction wants determinism, not creativity, so temperature 0
  /// is the quality setting: the same notes must read the same way every time.
  /// maximumResponseTokens sits past anything the context can produce, so a
  /// multi-item answer is never truncated mid-list.
  @available(iOS 26.0, *)
  private var extractionOptions: GenerationOptions {
    GenerationOptions(temperature: 0, maximumResponseTokens: 4000)
  }

  /// Turns whatever the framework threw into the bridge's failure contract.
  /// Classified by description so the mapping does not depend on the exact
  /// error case names of a still-young API.
  private func classify(_ error: Error) -> AppleIntelligenceError {
    let text = String(describing: error).lowercased()
    if text.contains("quota") || text.contains("limit") { return .quota }
    if text.contains("network") || text.contains("offline") || text.contains("connection") {
      return .offline
    }
    if text.contains("unavailable") || text.contains("service") { return .service }
    return .modelFailed
  }
#endif

public class AppleIntelligenceModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppleIntelligence")

    // Cloud model standing: "available" | "unsupported-os" | "device" |
    // "disabled" | "not-ready".
    Function("availability") { () -> String in
      #if canImport(FoundationModels)
        guard #available(iOS 27.0, *) else { return "unsupported-os" }
        return cloudAvailability()
      #else
        return "unsupported-os"
      #endif
    }

    // Rough notes in, import-format v2 JSON out. The instructions come from
    // core (buildImportPrompt) so every path shares one format and one parser.
    AsyncFunction("parseSubscriptions") {
      (input: String, instructions: String, engine: String) async throws -> String in
      #if canImport(FoundationModels)
        guard #available(iOS 27.0, *) else {
          throw AppleIntelligenceError.unavailable
        }
        guard cloudAvailability() == "available" else {
          throw AppleIntelligenceError.unavailable
        }
        do {
          let session = makeSession(engine: engine, instructions: instructions)
          let response = try await session.respond(
            to: input,
            generating: ImportedDocument.self,
            options: extractionOptions
          )
          let data = try JSONEncoder().encode(response.content)
          return String(data: data, encoding: .utf8) ?? #"{"items":[]}"#
        } catch let known as AppleIntelligenceError {
          throw known
        } catch {
          throw classify(error)
        }
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
        guard #available(iOS 27.0, *) else {
          throw AppleIntelligenceError.unavailable
        }
        guard cloudAvailability() == "available" else {
          throw AppleIntelligenceError.unavailable
        }
        do {
          let session = makeSession(engine: engine, instructions: instructions)
          let response = try await session.respond(
            to: input,
            generating: AssistantPlanDocument.self,
            options: extractionOptions
          )
          let data = try JSONEncoder().encode(response.content)
          return String(data: data, encoding: .utf8) ?? #"{"actions":[],"additions":[]}"#
        } catch let known as AppleIntelligenceError {
          throw known
        } catch {
          throw classify(error)
        }
      #else
        throw AppleIntelligenceError.unavailable
      #endif
    }
  }
}

/// The failure contract the JS side reads off `error.message`.
enum AppleIntelligenceError: Error, LocalizedError {
  /// Cannot run here: OS, device, Apple Intelligence off, or model not ready.
  case unavailable
  /// No network: the cloud model needs a connection.
  case offline
  /// The user's daily allowance for the cloud model is spent.
  case quota
  /// Apple's service did not answer.
  case service
  /// The model ran but produced nothing usable.
  case modelFailed

  var errorDescription: String? {
    switch self {
    case .unavailable: return "unavailable"
    case .offline: return "offline"
    case .quota: return "quota"
    case .service: return "service"
    case .modelFailed: return "model-failed"
    }
  }
}
