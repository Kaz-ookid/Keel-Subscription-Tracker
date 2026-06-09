// The starter set of categories the app seeds on first run. Categories are
// USER-EDITABLE data, not a closed enum — the user can rename, delete, recolour,
// or add their own. This list is only the initial seed, so it's a constant
// here rather than a type. (The `Category` entity itself lives in models/.)

import type { SemanticTone } from "../primitives/descriptor";

export interface SeedCategory {
  /** Stable slug used as the seeded id, so re-seeding is idempotent. */
  readonly id: string;
  readonly name: string;
  /** Semantic icon token the platform maps to its own icon set. */
  readonly icon: string;
  /** Colour role; the platform theme turns it into an actual colour. */
  readonly tone: SemanticTone;
}

export const DEFAULT_CATEGORIES: readonly SeedCategory[] = [
  { id: "streaming", name: "Streaming", icon: "play-circle", tone: "info" },
  { id: "utilities", name: "Utilities", icon: "bolt", tone: "warning" },
  { id: "education", name: "Education", icon: "graduation-cap", tone: "info" },
  { id: "software", name: "Software", icon: "laptop", tone: "neutral" },
  { id: "insurance", name: "Insurance", icon: "shield", tone: "success" },
  { id: "housing", name: "Housing", icon: "home", tone: "neutral" },
  { id: "transport", name: "Transport", icon: "car", tone: "info" },
  { id: "health", name: "Health & Fitness", icon: "heart", tone: "success" },
  { id: "shopping", name: "Shopping", icon: "bag", tone: "warning" },
  { id: "other", name: "Other", icon: "ellipsis", tone: "neutral" },
];
