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
  private var next: WidgetPayment? { snapshot?.upcoming(from: entry.date).first }

  var body: some View {
    switch family {
    case .accessoryInline: inline
    case .accessoryCircular: circular
    case .accessoryRectangular: rectangular
    default: small
    }
  }

  // MARK: Home screen (small)

  private var small: some View {
    VStack(alignment: .leading, spacing: 4) {
      if let snapshot, let next {
        HStack(spacing: 6) {
          Circle()
            .fill(Color(keelHex: next.color))
            .frame(width: 10, height: 10)
          Text(snapshot.dueLabel(next, from: entry.date))
            .font(.caption)
            .foregroundStyle(Color.keelSeaGlass)
          Spacer(minLength: 0)
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
        VStack(spacing: 0) {
          Text("\(max(next.daysFrom(entry.date), 0))")
            .font(.title2.weight(.bold))
          Text(snapshot.isFrench ? "j" : "d")
            .font(.caption2)
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
        Text(snapshot.dueLabel(next, from: entry.date))
          .font(.caption)
          .foregroundStyle(.secondary)
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
    return URL(string: "keel://item?id=\(next.id)")
  }
}
