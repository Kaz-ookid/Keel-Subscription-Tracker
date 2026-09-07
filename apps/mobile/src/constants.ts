export const APP_NAME = "Keel";

// The dedicated contact address. A plus-alias per subject
// (…+bug@protonmail.com) also works for triage.
export const SUPPORT_EMAIL = "contactkeel@protonmail.com";

// The marketing site (keel-app.ch); linked from the About screen.
export const WEBSITE_URL = "https://keel-app.ch";

// Filled once the app exists in App Store Connect; while empty, the rate and
// share rows on the About screen stay hidden (no fake links, ever).
export const APP_STORE_ID = "";

// Full Keel (the one-time supporter purchase): everything in the app is free
// The one-time purchase (PROJECT_BRIEF §7.3): 12 CHF while the 45-day trial
// runs, 15 CHF after. FALLBACK display strings only — the paywall shows the
// live localized store price whenever StoreKit can supply one.
export const FULL_KEEL_PRICE = "12 CHF";
export const FULL_KEEL_PRICE_LATER = "15 CHF";

// A curated spectrum for user-picked accents (subscription colour, account
// colour). A fixed palette is reliable and crash-free (the previous
// full-spectrum picker crashed on selection).
export const COLOR_SWATCHES = [
  "#EF4444",
  "#F87171",
  "#EC4899",
  "#F472B6",
  "#F59E0B",
  "#FB923C",
  "#FBBF24",
  "#FACC15",
  "#22C55E",
  "#4ADE80",
  "#16A34A",
  "#10B981",
  "#14B8A6",
  "#06B6D4",
  "#2DD4BF",
  "#3B82F6",
  "#60A5FA",
  "#2563EB",
  "#0EA5E9",
  "#8B5CF6",
  "#A78BFA",
  "#6366F1",
  "#0B1E3F",
  "#7FB8B0",
  "#6B7280",
  "#9CA3AF",
  "#111827",
  "#78350F",
];

// The shared SF Symbol pool for user-picked marks: an item's icon override
// and a custom category's icon draw from the same set. Curated, long-stable
// symbol names only — a name the OS doesn't know renders as a blank.
export const ICON_POOL = [
  "play.rectangle.fill",
  "music.note",
  "gamecontroller.fill",
  "tv.fill",
  "film.fill",
  "headphones",
  "book.fill",
  "newspaper.fill",
  "graduationcap.fill",
  "laptopcomputer",
  "desktopcomputer",
  "iphone",
  "antenna.radiowaves.left.and.right",
  "wifi",
  "cloud.fill",
  "bolt.fill",
  "flame.fill",
  "drop.fill",
  "house.fill",
  "building.2.fill",
  "car.fill",
  "bus.fill",
  "bicycle",
  "airplane",
  "fuelpump.fill",
  "creditcard.fill",
  "banknote.fill",
  "chart.line.uptrend.xyaxis",
  "shield.fill",
  "cross.case.fill",
  "heart.fill",
  "pills.fill",
  "dumbbell.fill",
  "figure.run",
  "fork.knife",
  "cup.and.saucer.fill",
  "cart.fill",
  "bag.fill",
  "gift.fill",
  "tag.fill",
  "star.fill",
  "pawprint.fill",
  "leaf.fill",
  "globe",
  "envelope.fill",
  "phone.fill",
  "camera.fill",
  "paintbrush.fill",
  "wrench.and.screwdriver.fill",
  "scissors",
  "briefcase.fill",
  "person.2.fill",
  "bubble.left.and.bubble.right.fill",
  "lock.fill",
  "key.fill",
  "calendar",
  "umbrella.fill",
] as const;
