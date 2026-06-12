// The starter set of categories the app seeds on first run. Categories are
// USER-EDITABLE data, not a closed enum — the user can rename, delete, or add
// their own. This list is only the initial seed, so it's a constant here rather
// than a type. (The `Category` entity itself lives in models/.)

export interface SeedCategory {
  /** Stable slug used as the seeded id, so re-seeding is idempotent. */
  readonly id: string;
  readonly name: string;
  /** Icon token the platform maps to its own icon set (SF Symbol names here). */
  readonly icon: string;
}

export const DEFAULT_CATEGORIES: readonly SeedCategory[] = [
  { id: "streaming", name: "Streaming", icon: "play.rectangle.fill" },
  { id: "music", name: "Music & audio", icon: "music.note" },
  { id: "gaming", name: "Gaming", icon: "gamecontroller.fill" },
  { id: "communications", name: "Communications", icon: "antenna.radiowaves.left.and.right" },
  { id: "utilities", name: "Utilities", icon: "bolt.fill" },
  { id: "education", name: "Education", icon: "graduationcap.fill" },
  { id: "software", name: "Software", icon: "laptopcomputer" },
  { id: "insurance", name: "Insurance", icon: "shield.fill" },
  { id: "housing", name: "Housing", icon: "house.fill" },
  { id: "transport", name: "Transport", icon: "car.fill" },
  { id: "health", name: "Health & Fitness", icon: "heart.fill" },
  { id: "finance", name: "Finance & banking", icon: "creditcard.fill" },
  { id: "news", name: "News & learning", icon: "newspaper.fill" },
  { id: "food", name: "Food & delivery", icon: "fork.knife" },
  { id: "memberships", name: "Memberships & charity", icon: "person.2.fill" },
  { id: "social", name: "Social & dating", icon: "bubble.left.and.bubble.right.fill" },
  { id: "shopping", name: "Shopping", icon: "bag.fill" },
  { id: "other", name: "Other", icon: "ellipsis.circle.fill" },
];
