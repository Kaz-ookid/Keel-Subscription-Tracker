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
import PDFKit
import UIKit
import Vision

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

/// Screenshot text, read on the phone by Vision (nothing leaves the device
/// for this step). Lines come back top to bottom so a list reads as a list.
private func recognizeText(in image: UIImage) async throws -> String {
  guard let cgImage = image.cgImage else { throw AppleIntelligenceError.imageUnreadable }
  let orientation = CGImagePropertyOrientation(image.imageOrientation)
  return try await withCheckedThrowingContinuation { continuation in
    let request = VNRecognizeTextRequest { request, error in
      if let error = error {
        continuation.resume(throwing: error)
        return
      }
      let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
      let lines = observations
        .sorted { a, b in
          // Vision's origin is bottom-left: higher minY = higher on screen.
          if abs(a.boundingBox.minY - b.boundingBox.minY) > 0.01 {
            return a.boundingBox.minY > b.boundingBox.minY
          }
          return a.boundingBox.minX < b.boundingBox.minX
        }
        .compactMap { $0.topCandidates(1).first?.string }
      continuation.resume(returning: lines.joined(separator: "\n"))
    }
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.recognitionLanguages = ["en-US", "fr-FR", "de-DE", "it-IT", "pl-PL"]
    let handler = VNImageRequestHandler(cgImage: cgImage, orientation: orientation, options: [:])
    do {
      try handler.perform([request])
    } catch {
      continuation.resume(throwing: error)
    }
  }
}

extension CGImagePropertyOrientation {
  init(_ orientation: UIImage.Orientation) {
    switch orientation {
    case .up: self = .up
    case .upMirrored: self = .upMirrored
    case .down: self = .down
    case .downMirrored: self = .downMirrored
    case .left: self = .left
    case .leftMirrored: self = .leftMirrored
    case .right: self = .right
    case .rightMirrored: self = .rightMirrored
    @unknown default: self = .up
    }
  }
}

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

    // A screenshot (file URI from the picker) in, its text out, read on the
    // phone by Vision. Feeds the same text path as typed notes.
    AsyncFunction("recognizeText") { (uri: String) async throws -> String in
      guard let url = URL(string: uri), let data = try? Data(contentsOf: url),
        let image = UIImage(data: data)
      else {
        throw AppleIntelligenceError.imageUnreadable
      }
      do {
        return try await recognizeText(in: image)
      } catch let known as AppleIntelligenceError {
        throw known
      } catch {
        throw AppleIntelligenceError.imageUnreadable
      }
    }

    // The cloud model's allowance, for the curious: the framework's quota
    // object is read by REFLECTION (every stored property, stringified), so
    // the bridge never names a field it cannot be sure of on a young API.
    // Below iOS 27 (or without the framework) an empty dictionary.
    Function("cloudQuota") { () -> [String: String] in
      #if canImport(FoundationModels)
        guard #available(iOS 27.0, *) else { return [:] }
        var out: [String: String] = [:]
        let usage = PrivateCloudComputeLanguageModel().quotaUsage
        for child in Mirror(reflecting: usage).children {
          if let label = child.label { out[label] = String(describing: child.value) }
        }
        out["description"] = String(describing: usage)
        return out
      #else
        return [:]
      #endif
    }

    // A PDF (file URI from the document picker) in, its text out, read on
    // the phone by PDFKit. Feeds the same text path as screenshots.
    AsyncFunction("extractPdfText") { (uri: String) async throws -> String in
      guard let url = URL(string: uri), let document = PDFDocument(url: url) else {
        throw AppleIntelligenceError.imageUnreadable
      }
      var pages: [String] = []
      for index in 0..<document.pageCount {
        if let text = document.page(at: index)?.string, !text.isEmpty { pages.append(text) }
      }
      guard !pages.isEmpty else { throw AppleIntelligenceError.imageUnreadable }
      return pages.joined(separator: "\n\n")
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
  /// The picked image could not be decoded or read.
  case imageUnreadable

  var errorDescription: String? {
    switch self {
    case .unavailable: return "unavailable"
    case .offline: return "offline"
    case .quota: return "quota"
    case .service: return "service"
    case .modelFailed: return "model-failed"
    case .imageUnreadable: return "image-unreadable"
    }
  }
}
