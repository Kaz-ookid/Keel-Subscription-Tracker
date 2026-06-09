// Shared shape for "display metadata attached to a closed set of values."
//
// This is the pattern every enum-like type in the core uses: alongside the
// union type (e.g. AccountType) lives a `Record<Value, EnumDescriptor>` that
// the UI reads instead of hand-writing a `switch`. It stays UI-agnostic on
// purpose — see the field notes below.

/**
 * A semantic colour role, NOT a hex value. The core only knows that (say) a
 * late payment is a `"danger"` situation; each platform's theme decides what
 * `"danger"` actually looks like. This is what keeps brand colours out of
 * `@keel/core` while still letting the core drive status styling.
 */
export type SemanticTone = "neutral" | "info" | "success" | "warning" | "danger";

/** Plain-data presentation hint for one value of a closed set. */
export interface EnumDescriptor {
  /** Human-readable default label. English for now; structured so it can be
   *  swapped for an i18n key later without changing call sites. */
  readonly label: string;
  /** Semantic icon token (e.g. "creditcard", "clock") that the platform maps
   *  to its own icon set — never an image or a component. */
  readonly icon?: string;
  /** Semantic colour role; mapped to an actual colour by the platform theme. */
  readonly tone?: SemanticTone;
}

/** A descriptor map keyed by every value of a string-union `T`. */
export type DescriptorMap<T extends string> = Readonly<Record<T, EnumDescriptor>>;
