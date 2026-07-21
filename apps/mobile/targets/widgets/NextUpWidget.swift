// "Next payment": the single next charge. One widget, four shapes — the
// home-screen small tile plus all three lock-screen accessories. Tapping any
// of them deep-links straight to that charge's detail screen.

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
  let entry: KeelEntry

  private var snapshot: WidgetSnapshot? { entry.snapshot }
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

  /// The payment after `next`: the small tile teases it so "in 5 days" can't
  /// hide something landing the day after.
  private var following: WidgetPayment? {
    guard let list = snapshot?.upcoming(from: entry.date), list.count > 1 else { return nil }
    return list[1]
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
          .foregroundStyle(nextIsLate ? Color.keelWarning : Color.keelSeaGlass)
          .lineLimit(1)
          .minimumScaleFactor(0.8)
          Spacer(minLength: 0)
          if nextIsLate {
            let lateCount = snapshot.overdueCount(from: entry.date)
            Text(lateCount > 1 ? "⚠\(lateCount)" : "⚠")
              .font(.caption2.weight(.bold))
              .foregroundStyle(Color.keelWarning)
          }
        }
        Spacer(minLength: 0)
        Text(next.name)
          .font(.headline)
          .foregroundStyle(.white)
          .lineLimit(1)
        Text(next.amount)
          .font(.title2.weight(.bold))
          .foregroundStyle(.white)
          .minimumScaleFactor(0.6)
          .lineLimit(1)
        // What comes right after, so the single hero never hides a same-week
        // charge: "→ Disney+ · 5d".
        if let following {
          Text("→ \(following.name) · \(snapshot.dueShort(following, from: entry.date))")
            .font(.caption2)
            .foregroundStyle(Color.keelMuted)
            .lineLimit(1)
        }
      } else {
        Spacer(minLength: 0)
        Text(snapshot?.emptyLine ?? "All clear")
          .font(.headline)
          .foregroundStyle(.white)
        Spacer(minLength: 0)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .containerBackground(for: .widget) { KeelWidgetBackground() }
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

  /// expo-router deep link into the charge's own screen.
  private var deepLink: URL? {
    guard let next else { return URL(string: "keel://") }
    return URL(string: "keel://item?id=\(next.linkId)")
  }
}
