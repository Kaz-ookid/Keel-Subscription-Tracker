// The App Group bridge for the Keel widgets: the app writes its pre-formatted
// snapshot into the group's shared UserDefaults and pokes WidgetKit; the
// widget extension (targets/widgets/Shared.swift) reads the same suite + key.
//
// Vendored as a LOCAL module because expo autolinking on EAS reliably picks
// these up (see modules/apple-intelligence) while it skipped the equivalent
// pod from @bacons/apple-targets in this monorepo; that package remains only
// as the config plugin that builds the widget target. API shape adapted from
// its MIT-licensed ExtensionStorageModule.

import ExpoModulesCore
import WidgetKit

public class KeelExtensionStorageModule: Module {
  public func definition() -> ModuleDefinition {
    Name("KeelExtensionStorage")

    // Plain string in, under the key, in the shared suite. The widget reads
    // it with UserDefaults(suiteName:).string(forKey:).
    Function("setString") { (key: String, value: String, group: String) in
      UserDefaults(suiteName: group)?.set(value, forKey: key)
    }

    // The write-verification read: returns what the suite actually holds, so
    // the JS side can tell a landed write from a silent failure.
    Function("getString") { (key: String, group: String) -> String? in
      UserDefaults(suiteName: group)?.string(forKey: key)
    }

    Function("reloadWidgets") { () in
      WidgetCenter.shared.reloadAllTimelines()
    }
  }
}
