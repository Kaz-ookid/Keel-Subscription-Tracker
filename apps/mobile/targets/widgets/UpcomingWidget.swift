// "Upcoming payments": the next charges as a list, with the month's committed
// total in the header. Medium shows three rows; large shows seven. Every row
// deep-links to its charge.

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
  let entry: KeelEntry

  private var rowCount: Int { family == .systemLarge ? 7 : 3 }

  var body: some View {
    Group {
      if let snapshot = entry.snapshot {
        content(snapshot)
      } else {
        // No snapshot yet: the app has never written one (fresh install).
        Text("Open Keel")
          .font(.headline)
          .foregroundStyle(.white)
      }
    }
    .containerBackground(for: .widget) { KeelWidgetBackground() }
  }

  private func content(_ snapshot: WidgetSnapshot) -> some View {
    let upcoming = Array(snapshot.upcoming(from: entry.date).prefix(rowCount))
    let lateCount = snapshot.overdueCount(from: entry.date)
    return VStack(alignment: .leading, spacing: 6) {
      HStack(alignment: .firstTextBaseline) {
        Text(snapshot.upcomingTitle)
          .font(.headline)
          .foregroundStyle(.white)
        // Anything overdue outranks the month total in the header.
        if lateCount > 0 {
          Text(snapshot.lateLine(lateCount))
            .font(.caption.weight(.semibold))
            .foregroundStyle(Color.keelWarning)
        }
        Spacer()
        Text("\(snapshot.monthLabel) · \(snapshot.monthTotal)")
          .font(.caption)
          .foregroundStyle(Color.keelSeaGlass)
      }
      if upcoming.isEmpty {
        Spacer(minLength: 0)
        Text(snapshot.emptyLine)
          .font(.body)
          .foregroundStyle(Color.keelMuted)
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
                .foregroundStyle(.white)
                .lineLimit(1)
              if late {
                Image(systemName: "exclamationmark.triangle.fill")
                  .font(.caption2)
                  .foregroundStyle(Color.keelWarning)
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
              .foregroundStyle(late ? Color.keelWarning : Color.keelMuted)
              .lineLimit(1)
              Text(payment.amount)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .lineLimit(1)
            }
          }
        }
        // The omission made honest: how much more the snapshot holds beyond
        // the visible rows (`upcoming` is already truncated to rowCount).
        if snapshot.payments.count > upcoming.count {
          Text(snapshot.moreLine(snapshot.payments.count - upcoming.count))
            .font(.caption)
            .foregroundStyle(Color.keelMuted)
        }
        Spacer(minLength: 0)
      }
    }
  }
}
