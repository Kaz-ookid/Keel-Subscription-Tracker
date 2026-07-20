// Keel's widget extension (home screen + lock screen), compiled from the
// Swift files in this folder by the @bacons/apple-targets config plugin at
// prebuild. DORMANT until the dev-build era: the plugin is not installed and
// app.json does not list it yet — README.md here has the wiring steps.
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "widget",
  name: "KeelWidgets",
  deploymentTarget: "17.0",
  entitlements: {
    // Must match SharedStore.appGroup (Shared.swift) and WIDGET_APP_GROUP
    // (src/lib/widgets.ts); the app itself needs the same group in app.json.
    "com.apple.security.application-groups": ["group.ch.keelapp.keel"],
  },
};
