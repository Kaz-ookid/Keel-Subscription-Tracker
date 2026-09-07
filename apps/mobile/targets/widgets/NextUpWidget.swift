// "Next payment": the single next charge. One widget, four shapes — the
// home-screen small tile plus all three lock-screen accessories. Long names
// wrap to two lines, and the tile's spare space teases what comes after.
// Tapping ANY shape opens the Upcoming timeline (the tile is a glance, the
// timeline is the place to act). Follows the app's theme preference.

import SwiftUI
import WidgetKit

struct NextUpWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "KeelNextUp", provider: KeelProvider()) { entry in
      NextUpView(entry: entry)
    }
    .configurationDisplayName("Next payment")
    .description("Your next charge at a glance.")
    .supportedFamilies([
      .systemSmall, .accessoryInline, .accessoryCircular, .accessoryRectangular,
    ])
  }
}

struct NextUpView: View {
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var colorScheme
  let entry: KeelEntry

  private var snapshot: WidgetSnapshot? { entry.snapshot }
  private var palette: KeelPalette {
    KeelPalette.resolve(theme: snapshot?.theme, systemDark: colorScheme == .dark)
  }
  /// The single most urgent thing: the oldest overdue charge if any exists
  /// (the app pins them first), else the nearest upcoming one.
  private var next: WidgetPayment? { snapshot?.upcoming(from: entry.date).first }
  private var nextIsLate: Bool {
    guard let snapshot, let next else { return false }
    return snapshot.isLate(next, from: entry.date)
  }

  var body: some View {
    switch family {
    case .accessoryInline: inline
    case .accessoryCircular: circular
    case .accessoryRectangular: rectangular
    default: small
    }
  }

  // MARK: Home screen (small)

  /// What comes after `next`: the tile teases up to two more so "in 5 days"
  /// can't hide something landing the day after.
  private func following(_ index: Int) -> WidgetPayment? {
    guard let list = snapshot?.upcoming(from: entry.date), list.count > index else { return nil }
    return list[index]
  }

  private var small: some View {
    VStack(alignment: .leading, spacing: 4) {
      if let snapshot, let next {
        HStack(spacing: 6) {
          Circle()
            .fill(Color(keelHex: next.color))
            .frame(width: 10, height: 10)
          // Relative + the trigger date: "In 5 days · 26 Jul"; for overdue,
          // the date it SHOULD have been paid: "Overdue · 25 Jun".
          Text(
            next.shortDate.isEmpty
              ? snapshot.dueLabel(next, from: entry.date)
              : "\(snapshot.dueLabel(next, from: entry.date)) · \(next.shortDate)"
          )
          .font(.caption.weight(nextIsLate ? .semibold : .regular))
          .foregroundStyle(nextIsLate ? palette.warning : palette.accent)
          .lineLimit(1)
          .minimumScaleFactor(0.8)
          Spacer(minLength: 0)
          if nextIsLate {
            let lateCount = snapshot.overdueCount(from: entry.date)
            Text(lateCount > 1 ? "⚠\(lateCount)" : "⚠")
              .font(.caption2.weight(.bold))
              .foregroundStyle(palette.warning)
          }
        }
        Spacer(minLength: 0)
        HStack(alignment: .firstTextBaseline, spacing: 4) {
          // Long names wrap instead of vanishing behind an ellipsis.
          Text(next.name)
            .font(.headline)
            .foregroundStyle(palette.ink)
            .lineLimit(2)
            .minimumScaleFactor(0.85)
          if next.isManual {
            Image(systemName: "hand.raised.fill")
              .font(.caption2)
              .foregroundStyle(nextIsLate ? palette.warning : palette.muted)
          }
        }
        Text(next.amount)
          .font(.title2.weight(.bold))
          .foregroundStyle(palette.ink)
          .minimumScaleFactor(0.6)
          .lineLimit(1)
        // The spare space works: up to two follow-ups in light text, so the
        // hero never hides a same-week charge.
        if let second = following(1) {
          Text("→ \(second.name) · \(snapshot.dueShort(second, from: entry.date))")
            .font(.caption2)
            .foregroundStyle(palette.muted)
            .lineLimit(1)
        }
        if let third = following(2) {
          Text("→ \(third.name) · \(snapshot.dueShort(third, from: entry.date))")
            .font(.caption2)
            .foregroundStyle(palette.muted.opacity(0.7))
            .lineLimit(1)
        }
      } else {
        Spacer(minLength: 0)
        Text(snapshot?.emptyLine ?? "All clear")
          .font(.headline)
          .foregroundStyle(palette.ink)
        Spacer(minLength: 0)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .containerBackground(for: .widget) { KeelWidgetBackground(palette: palette) }
    .widgetURL(deepLink)
  }

  // MARK: Lock screen

  private var inline: some View {
    Group {
      if let snapshot, let next {
        Text("\(next.name) \(next.amount) · \(snapshot.dueShort(next, from: entry.date))")
      } else {
        Text(snapshot?.emptyLine ?? "All clear")
      }
    }
    .containerBackground(for: .widget) { Color.clear }
    .widgetURL(deepLink)
  }

  private var circular: some View {
    ZStack {
      AccessoryWidgetBackground()
      if let snapshot, let next {
        if nextIsLate {
          // Days-until makes no sense for a passed date: the dial shows the
          // alert instead, with how many charges wait.
          VStack(spacing: 0) {
            Image(systemName: "exclamationmark.triangle.fill")
              .font(.body)
            Text("\(snapshot.overdueCount(from: entry.date))")
              .font(.caption.weight(.bold))
          }
        } else {
          // One line ("5d"), not a number with a stray unit wrapping under
          // it — the dial reads as "days until the next payment".
          Text("\(max(next.daysFrom(entry.date), 0))\(snapshot.isFrench ? "j" : "d")")
            .font(.title3.weight(.bold))
            .minimumScaleFactor(0.6)
            .lineLimit(1)
        }
      } else {
        Image(systemName: "checkmark")
          .font(.title3)
      }
    }
    .containerBackground(for: .widget) { Color.clear }
    .widgetURL(deepLink)
  }

  private var rectangular: some View {
    VStack(alignment: .leading, spacing: 1) {
      if let snapshot, let next {
        Text(next.name)
          .font(.headline)
          .lineLimit(1)
        Text(next.amount)
          .font(.body.weight(.semibold))
        Text(
          next.shortDate.isEmpty
            ? snapshot.dueLabel(next, from: entry.date)
            : "\(snapshot.dueLabel(next, from: entry.date)) · \(next.shortDate)"
        )
        .font(.caption.weight(nextIsLate ? .semibold : .regular))
        .foregroundStyle(nextIsLate ? AnyShapeStyle(Color.keelWarning) : AnyShapeStyle(.secondary))
        .lineLimit(1)
      } else {
        Text(snapshot?.emptyLine ?? "All clear")
          .font(.headline)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .containerBackground(for: .widget) { Color.clear }
    .widgetURL(deepLink)
  }

  /// Every shape opens the Upcoming timeline — the glance leads to the place
  /// where marking paid and acting actually live.
  private var deepLink: URL? { URL(string: "keel://upcoming") }
}
