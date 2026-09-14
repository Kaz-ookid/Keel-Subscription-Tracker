// Shared data layer for the Keel widgets.
//
// The app is the single source of truth: it pre-formats a small JSON snapshot
// (names, amounts, colors, month total, all already localized) into the App
// Group's UserDefaults on every data change (src/lib/widgets.ts). The widget
// NEVER computes money or schedules; it only slices that snapshot per
// timeline day and renders. The one piece of logic living here is
// relative-date labeling ("Tomorrow"), because it must stay honest for days
// between app launches.

import SwiftUI
import WidgetKit

struct WidgetPayment: Codable, Identifiable {
  /// Unique per OCCURRENCE ("itemId:dueDate") — ForEach needs distinct ids
  /// or it repaints a later cycle with an earlier one's row.
  let id: String
  /// The item behind the occurrence, for the deep link.
  let itemId: String?
  let name: String
  /// Pre-formatted by the app ("12,90 CHF"); never computed here.
  let amount: String
  /// Local calendar date "YYYY-MM-DD".
  let dueDate: String
  /// Pre-localized trigger date ("25 Jul"); for an overdue charge, the day
  /// it SHOULD have been paid.
  let dateLabel: String?
  /// "#RRGGBB", resolved by the app's brand rules (never black or white).
  let color: String
  /// True for a charge whose day passed unpaid (optional: older snapshots
  /// don't carry it).
  let overdue: Bool?
  /// True when the user settles this one BY HAND (it will not pay itself).
  /// Optional keeps old snapshots decodable.
  let manual: Bool?

  var isOverdue: Bool { overdue ?? false }
  var isManual: Bool { manual ?? false }
  var linkId: String { itemId ?? id }
  var shortDate: String { dateLabel ?? "" }
}

struct WidgetSnapshot: Codable {
  let version: Int
  /// "en" | "fr" | "de" | "it" | "pl": the APP's language, not the device's.
  let locale: String
  let generatedAt: String
  /// "July" / "Juillet".
  let monthLabel: String
  /// Pre-formatted committed total still ahead this month.
  let monthTotal: String
  /// The next charges (today through ~30 days), soonest first, capped.
  let payments: [WidgetPayment]
  /// Present while the app is locked (trial over, no purchase): shown as the
  /// empty line so the widget explains itself instead of looking stale.
  /// Optional keeps old snapshots (without the field) decodable.
  let lockedLine: String?
  /// The APP's appearance preference: "light" | "dark" | "system" (nil =
  /// old snapshot = the historical always-dark look).
  let theme: String?
}

enum SharedStore {
  /// Must match expo-target.config.js and WIDGET_APP_GROUP in widgets.ts.
  static let appGroup = "group.ch.keelapp.keel"
  /// Must match WIDGET_SNAPSHOT_KEY in widgets.ts.
  static let key = "keel.widget.snapshot.v1"

  static func load() -> WidgetSnapshot? {
    guard let defaults = UserDefaults(suiteName: appGroup),
      let raw = defaults.string(forKey: key),
      let data = raw.data(using: .utf8)
    else { return nil }
    return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
  }
}

// MARK: - Dates

extension WidgetPayment {
  var dueAsDate: Date? {
    let parts = dueDate.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    var components = DateComponents()
    components.year = parts[0]
    components.month = parts[1]
    components.day = parts[2]
    return Calendar.current.date(from: components)
  }

  /// Whole days from the reference day to the due day (0 = due today).
  func daysFrom(_ reference: Date) -> Int {
    guard let due = dueAsDate else { return 0 }
    let calendar = Calendar.current
    return calendar.dateComponents(
      [.day],
      from: calendar.startOfDay(for: reference),
      to: calendar.startOfDay(for: due)
    ).day ?? 0
  }
}

extension WidgetSnapshot {
  /// Everything the widgets list. Nothing is filtered out: the snapshot holds
  /// a full year, so every entry is either ahead or overdue, and an overdue
  /// charge stays urgent no matter how old. The reference day only changes
  /// LABELS (a charge that was upcoming at write time flips to overdue when
  /// its day passes with the app unopened).
  func upcoming(from reference: Date) -> [WidgetPayment] {
    _ = reference
    return payments
  }

  /// Overdue as of the timeline day: the snapshot's flag OR date drift.
  func isLate(_ payment: WidgetPayment, from reference: Date) -> Bool {
    payment.isOverdue || payment.daysFrom(reference) < 0
  }

  func overdueCount(from reference: Date) -> Int {
    payments.filter { isLate($0, from: reference) }.count
  }

  var isFrench: Bool { locale.hasPrefix("fr") }
  var isGerman: Bool { locale.hasPrefix("de") }
  var isItalian: Bool { locale.hasPrefix("it") }
  var isPolish: Bool { locale.hasPrefix("pl") }

  func dueLabel(_ payment: WidgetPayment, from reference: Date) -> String {
    let days = payment.daysFrom(reference)
    if isFrench {
      switch days {
      case ..<0: return "En retard"
      case 0: return "Aujourd'hui"
      case 1: return "Demain"
      default: return "Dans \(days) jours"
      }
    }
    if isGerman {
      switch days {
      case ..<0: return "Überfällig"
      case 0: return "Heute"
      case 1: return "Morgen"
      default: return "In \(days) Tagen"
      }
    }
    if isItalian {
      switch days {
      case ..<0: return "In ritardo"
      case 0: return "Oggi"
      case 1: return "Domani"
      default: return "Tra \(days) giorni"
      }
    }
    if isPolish {
      switch days {
      case ..<0: return "Po terminie"
      case 0: return "Dziś"
      case 1: return "Jutro"
      default: return "Za \(days) dni"
      }
    }
    switch days {
    case ..<0: return "Overdue"
    case 0: return "Today"
    case 1: return "Tomorrow"
    default: return "In \(days) days"
    }
  }

  func dueShort(_ payment: WidgetPayment, from reference: Date) -> String {
    let days = payment.daysFrom(reference)
    if isFrench {
      switch days {
      case ..<0: return "retard"
      case 0: return "auj."
      case 1: return "demain"
      default: return "\(days) j"
      }
    }
    if isGerman {
      switch days {
      case ..<0: return "fällig"
      case 0: return "heute"
      case 1: return "morgen"
      default: return "\(days) T"
      }
    }
    if isItalian {
      switch days {
      case ..<0: return "ritardo"
      case 0: return "oggi"
      case 1: return "domani"
      default: return "\(days) g"
      }
    }
    if isPolish {
      switch days {
      case ..<0: return "po term."
      case 0: return "dziś"
      case 1: return "jutro"
      default: return "\(days) dn."
      }
    }
    switch days {
    case ..<0: return "late"
    case 0: return "today"
    case 1: return "tmrw"
    default: return "\(days)d"
    }
  }

  /// "2 late" in the snapshot's language, for the list header.
  func lateLine(_ count: Int) -> String {
    if isFrench { return "\(count) en retard" }
    if isGerman { return "\(count) überfällig" }
    if isItalian { return "\(count) in ritardo" }
    if isPolish { return "\(count) po terminie" }
    return "\(count) late"
  }

  /// "+3 more" for the list's truncation footer.
  func moreLine(_ count: Int) -> String {
    if isFrench { return "+\(count) autres" }
    if isGerman { return "+\(count) weitere" }
    if isItalian { return "+\(count) altri" }
    if isPolish { return "+\(count) więcej" }
    return "+\(count) more"
  }

  var emptyLine: String {
    // A locked app explains itself; "all clear" would be a false calm.
    if let locked = lockedLine, !locked.isEmpty { return locked }
    if isFrench { return "Rien à venir" }
    if isGerman { return "Nichts anstehend" }
    if isItalian { return "Tutto a posto" }
    if isPolish { return "Nic do zapłaty" }
    return "All clear"
  }
  var upcomingTitle: String {
    if isFrench { return "À venir" }
    if isGerman { return "Anstehend" }
    if isItalian { return "In arrivo" }
    if isPolish { return "Nadchodzące" }
    return "Upcoming"
  }
}

// MARK: - Keel palette (mirrors src/theme.tsx, night-at-sea)

extension Color {
  init(keelHex hex: String) {
    var value: UInt64 = 0
    let cleaned = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
    Scanner(string: cleaned).scanHexInt64(&value)
    self.init(
      red: Double((value >> 16) & 255) / 255,
      green: Double((value >> 8) & 255) / 255,
      blue: Double(value & 255) / 255
    )
  }

  static let keelNavy = Color(keelHex: "#0B1E3F")
  static let keelNavyDeep = Color(keelHex: "#071429")
  /// The 2026-09-08 blue shift: sea blue replaced the old teal sea glass.
  static let keelSeaGlass = Color(keelHex: "#6FA8E8")
  static let keelMuted = Color(keelHex: "#93A0B4")
  /// The dark theme's warning tone (src/theme.tsx): overdue everywhere.
  static let keelWarning = Color(keelHex: "#F0B35C")
}

/// The widget's theme-resolved palette, mirroring src/theme.tsx. The app's
/// explicit preference (carried in the snapshot) wins; "system" (or an old
/// snapshot) follows the device scheme.
struct KeelPalette {
  let ink: Color
  let muted: Color
  let accent: Color
  let warning: Color
  let bgTop: Color
  let bgBottom: Color

  /// Night-at-sea (the historical widget look).
  static let dark = KeelPalette(
    ink: .white,
    muted: .keelMuted,
    accent: .keelSeaGlass,
    warning: .keelWarning,
    bgTop: Color(keelHex: "#123156"),
    bgBottom: Color(keelHex: "#0B1A33")
  )

  /// Morning-at-sea, from the light theme's stage and inks.
  static let light = KeelPalette(
    ink: Color(keelHex: "#0F1720"),
    muted: Color(keelHex: "#5C6B7A"),
    accent: Color(keelHex: "#2F6FB8"),
    warning: Color(keelHex: "#C07C00"),
    bgTop: Color(keelHex: "#DCE7F5"),
    bgBottom: Color(keelHex: "#F1F5F6")
  )

  static func resolve(theme: String?, systemDark: Bool) -> KeelPalette {
    if theme == "dark" { return .dark }
    if theme == "light" { return .light }
    return systemDark ? .dark : .light
  }
}

/// The stage every home-screen widget stands on.
struct KeelWidgetBackground: View {
  let palette: KeelPalette
  var body: some View {
    LinearGradient(
      colors: [palette.bgTop, palette.bgBottom],
      startPoint: .top,
      endPoint: .bottom
    )
  }
}

// MARK: - Sample content (widget gallery previews)

extension WidgetSnapshot {
  static func sample(reference: Date = Date()) -> WidgetSnapshot {
    let calendar = Calendar.current
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    func day(_ offset: Int) -> String {
      formatter.string(
        from: calendar.date(byAdding: .day, value: offset, to: reference) ?? reference)
    }
    let monthFormatter = DateFormatter()
    monthFormatter.locale = Locale(identifier: "en")
    monthFormatter.dateFormat = "LLLL"
    return WidgetSnapshot(
      version: 1,
      locale: "en",
      generatedAt: "",
      monthLabel: monthFormatter.string(from: reference),
      monthTotal: "128.50 CHF",
      payments: [
        WidgetPayment(
          id: "sample-1", itemId: "sample-1", name: "Streaming", amount: "12.90 CHF",
          dueDate: day(1), dateLabel: nil, color: "#D65A6B", overdue: false, manual: false),
        WidgetPayment(
          id: "sample-2", itemId: "sample-2", name: "Music", amount: "11.99 CHF",
          dueDate: day(3), dateLabel: nil, color: "#4CAF7D", overdue: false, manual: false),
        WidgetPayment(
          id: "sample-3", itemId: "sample-3", name: "Cloud storage", amount: "2.99 CHF",
          dueDate: day(6), dateLabel: nil, color: "#3693F3", overdue: false, manual: false),
        WidgetPayment(
          id: "sample-4", itemId: "sample-4", name: "Gym", amount: "24.90 CHF",
          dueDate: day(9), dateLabel: nil, color: "#E0A93E", overdue: false, manual: true),
      ],
      lockedLine: nil,
      theme: nil
    )
  }
}
