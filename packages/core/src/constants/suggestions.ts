// The curated catalog behind the onboarding deck: common commitments a user
// likely has but won't all RECALL when staring at an empty list. Swiping
// right files one into the "To complete" list, which pre-fills the Add form.
// No amounts (they vary per person) and no brand logos (category icons
// instead — trademark caution); categoryIds reference DEFAULT_CATEGORIES.

export interface SuggestedCommitment {
  /** Stable slug, also the pending-list id. */
  readonly id: string;
  readonly name: string;
  readonly categoryId?: string;
  /** The cadence this is USUALLY billed on — pre-fills the form. */
  readonly unit: "month" | "year";
}

export const SUGGESTED_COMMITMENTS: readonly SuggestedCommitment[] = [
  // Streaming & entertainment
  { id: "netflix", name: "Netflix", categoryId: "streaming", unit: "month" },
  { id: "spotify", name: "Spotify", categoryId: "streaming", unit: "month" },
  { id: "youtube-premium", name: "YouTube Premium", categoryId: "streaming", unit: "month" },
  { id: "disney-plus", name: "Disney+", categoryId: "streaming", unit: "month" },
  { id: "amazon-prime", name: "Amazon Prime", categoryId: "streaming", unit: "year" },
  { id: "apple-music", name: "Apple Music", categoryId: "streaming", unit: "month" },
  { id: "ps-plus", name: "PlayStation Plus", categoryId: "streaming", unit: "year" },
  { id: "game-pass", name: "Xbox Game Pass", categoryId: "streaming", unit: "month" },
  // Communications
  { id: "mobile-plan", name: "Mobile plan", categoryId: "communications", unit: "month" },
  { id: "internet", name: "Home internet", categoryId: "communications", unit: "month" },
  // Software & cloud
  { id: "icloud", name: "iCloud+", categoryId: "software", unit: "month" },
  { id: "google-one", name: "Google One", categoryId: "software", unit: "month" },
  { id: "adobe", name: "Adobe Creative Cloud", categoryId: "software", unit: "month" },
  { id: "chatgpt", name: "ChatGPT Plus", categoryId: "software", unit: "month" },
  { id: "vpn", name: "VPN", categoryId: "software", unit: "year" },
  { id: "domain-hosting", name: "Domain / hosting", categoryId: "software", unit: "year" },
  { id: "password-manager", name: "Password manager", categoryId: "software", unit: "year" },
  // Housing & utilities
  { id: "rent", name: "Rent", categoryId: "housing", unit: "month" },
  { id: "electricity", name: "Electricity", categoryId: "utilities", unit: "month" },
  { id: "water-heating", name: "Water / heating", categoryId: "utilities", unit: "month" },
  { id: "serafe", name: "TV & radio fee (Serafe)", categoryId: "utilities", unit: "year" },
  // Insurance
  { id: "health-insurance", name: "Health insurance", categoryId: "insurance", unit: "month" },
  { id: "car-insurance", name: "Car insurance", categoryId: "insurance", unit: "year" },
  { id: "home-insurance", name: "Household insurance", categoryId: "insurance", unit: "year" },
  { id: "liability-insurance", name: "Liability insurance", categoryId: "insurance", unit: "year" },
  // Transport
  { id: "transit-pass", name: "Public transport pass", categoryId: "transport", unit: "year" },
  { id: "parking", name: "Parking spot", categoryId: "transport", unit: "month" },
  // Health & education
  { id: "gym", name: "Gym membership", categoryId: "health", unit: "month" },
  { id: "school-fees", name: "School / tuition fees", categoryId: "education", unit: "year" },
  { id: "music-lessons", name: "Music / sports lessons", categoryId: "education", unit: "month" },
  // Other
  { id: "news", name: "News subscription", categoryId: "other", unit: "month" },
  { id: "charity", name: "Charity donation", categoryId: "other", unit: "month" },
  { id: "bank-fees", name: "Bank account fees", categoryId: "other", unit: "month" },
] as const;
