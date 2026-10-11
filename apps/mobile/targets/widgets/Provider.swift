// One timeline provider for every Keel widget: an entry per day for a week,
// so relative labels ("Tomorrow", "In 3 days") stay honest even when the app
// hasn't been opened for days. `.atEnd` re-reads the snapshot after the last
// entry; the app also force-reloads all timelines whenever its data changes.

import WidgetKit

struct KeelEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot?
}

struct KeelProvider: TimelineProvider {
  func placeholder(in context: Context) -> KeelEntry {
    KeelEntry(date: Date(), snapshot: .sample())
  }

  func getSnapshot(in context: Context, completion: @escaping (KeelEntry) -> Void) {
    // Sample rows belong to the gallery only: a real home screen with no
    // snapshot yet shows the empty state, never invented subscriptions.
    let snapshot = context.isPreview ? WidgetSnapshot.sample() : SharedStore.load()
    completion(KeelEntry(date: Date(), snapshot: snapshot))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<KeelEntry>) -> Void) {
    let snapshot = SharedStore.load()
    let calendar = Calendar.current
    let now = Date()
    var entries = [KeelEntry(date: now, snapshot: snapshot)]
    for offset in 1...6 {
      if let day = calendar.date(byAdding: .day, value: offset, to: calendar.startOfDay(for: now)) {
        entries.append(KeelEntry(date: day, snapshot: snapshot))
      }
    }
    completion(Timeline(entries: entries, policy: .atEnd))
  }
}
