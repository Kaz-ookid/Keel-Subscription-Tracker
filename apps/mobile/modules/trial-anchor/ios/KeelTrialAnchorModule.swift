// The iCloud key-value store bridge for the trial anchor (PROJECT_BRIEF
// §7.3): one small string that follows the Apple ID, so deleting the app or
// moving to a new iPhone never restarts the 45-day clock. Vendored as a
// LOCAL module because expo autolinking on EAS reliably picks these up
// (see modules/extension-storage for the precedent and rationale).
//
// Requires the com.apple.developer.ubiquity-kvstore-identifier entitlement
// (declared in app.json). KVS holds up to 1 MB per app; we store one date.

import ExpoModulesCore

public class KeelTrialAnchorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("KeelTrialAnchor")

    // synchronize() nudges an early pull/push with iCloud; the OS batches
    // the real sync on its own schedule either way.
    Function("getString") { (key: String) -> String? in
      NSUbiquitousKeyValueStore.default.synchronize()
      return NSUbiquitousKeyValueStore.default.string(forKey: key)
    }

    Function("setString") { (key: String, value: String) in
      NSUbiquitousKeyValueStore.default.set(value, forKey: key)
      NSUbiquitousKeyValueStore.default.synchronize()
    }

    Function("removeString") { (key: String) in
      NSUbiquitousKeyValueStore.default.removeObject(forKey: key)
      NSUbiquitousKeyValueStore.default.synchronize()
    }
  }
}
