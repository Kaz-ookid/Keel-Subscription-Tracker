// The extension's entry point: every Keel widget ships in this one bundle.

import SwiftUI
import WidgetKit

@main
struct KeelWidgetBundle: WidgetBundle {
  var body: some Widget {
    NextUpWidget()
    UpcomingWidget()
  }
}
