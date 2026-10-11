// "Upcoming payments": the next charges as a list, with the month's committed
// total in the header. Medium shows four rows; large shows twelve. Each ROW
// deep-links to its charge; everywhere else on the widget opens the Upcoming
// timeline. Follows the app's theme preference (system scheme otherwise).

import SwiftUI
import WidgetKit

struct UpcomingWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "KeelUpcoming", provider: KeelProvider()) { entry in
      UpcomingView(entry: entry)
    }
    .configurationDisplayName("Upcoming payments")
    .description("The next charges and this month's committed total.")
    .supportedFamilies([.systemMedium, .systemLarge])
  }
}

struct UpcomingView: View {
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var colorScheme
  let entry: KeelEntry

  private var rowCount: Int { family == .systemLarge ? 12 : 4 }
  private var palette: KeelPalette {
    KeelPalette.resolve(theme: entry.snapshot?.theme, systemDark: colorScheme == .dark)
  }

  var body: some View {
    Group {
      if let snapshot = entry.snapshot {
        content(snapshot)
      } else {
        // No snapshot yet: the app has never written one (fresh install).
        Text("Open Keel")
          .font(.headline)
          .foregroundStyle(palette.ink)
      }
    }
    .containerBackground(for: .widget) { KeelWidgetBackground(palette: palette) }
    // Anywhere that is not a specific row opens the Upcoming timeline.
    .widgetURL(URL(string: "keel://upcoming"))
  }

  private func content(_ snapshot: WidgetSnapshot) -> some View {
    let upcoming = Array(snapshot.payments.prefix(rowCount))
    let lateCount = snapshot.overdueCount(from: entry.date)
    return VStack(alignment: .leading, spacing: 6) {
      HStack(alignment: .firstTextBaseline) {
        Text(snapshot.upcomingTitle)
          .font(.headline)
          .foregroundStyle(palette.ink)
        // Anything overdue outranks the month total in the header.
        if lateCount > 0 {
          Text(snapshot.lateLine(lateCount))
            .font(.caption.weight(.semibold))
            .foregroundStyle(palette.warning)
        }
        Spacer()
        Text("\(snapshot.monthLabel) · \(snapshot.monthTotal)")
          .font(.caption)
          .foregroundStyle(palette.accent)
      }
      if upcoming.isEmpty {
        Spacer(minLength: 0)
        Text(snapshot.emptyLine)
          .font(.body)
          .foregroundStyle(palette.muted)
        Spacer(minLength: 0)
      } else {
        ForEach(upcoming) { payment in
          let late = snapshot.isLate(payment, from: entry.date)
          Link(
            destination: URL(string: "keel://item?id=\(payment.linkId)") ?? URL(string: "keel://")!
          ) {
            HStack(spacing: 8) {
              Circle()
                .fill(Color(keelHex: payment.color))
                .frame(width: 8, height: 8)
              Text(payment.name)
                .font(.subheadline)
                .foregroundStyle(palette.ink)
                .lineLimit(1)
              // Settle-by-hand rows say so: this one will NOT pay itself.
              if payment.isManual {
                Image(systemName: "hand.raised.fill")
                  .font(.caption2)
                  .foregroundStyle(late ? palette.warning : palette.muted)
              }
              if late {
                Image(systemName: "exclamationmark.triangle.fill")
                  .font(.caption2)
                  .foregroundStyle(palette.warning)
              }
              Spacer(minLength: 8)
              // The trigger date, then the relative read: "25 Jul · 5d".
              // For an overdue charge the date is the day it SHOULD have
              // been paid: "25 Jun · late".
              Text(
                payment.shortDate.isEmpty
                  ? snapshot.dueShort(payment, from: entry.date)
                  : "\(payment.shortDate) · \(snapshot.dueShort(payment, from: entry.date))"
              )
              .font(late ? .caption.weight(.semibold) : .caption)
              .foregroundStyle(late ? palette.warning : palette.muted)
              .lineLimit(1)
              Text(payment.amount)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(palette.ink)
                .lineLimit(1)
            }
          }
        }
        // The omission made honest: how much more the snapshot holds beyond
        // the visible rows (`upcoming` is already truncated to rowCount).
        if snapshot.payments.count > upcoming.count {
          Text(snapshot.moreLine(snapshot.payments.count - upcoming.count))
            .font(.caption)
            .foregroundStyle(palette.muted)
        }
        Spacer(minLength: 0)
      }
    }
  }
}
