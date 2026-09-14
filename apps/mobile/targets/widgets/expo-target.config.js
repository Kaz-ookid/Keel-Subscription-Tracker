// Keel's widget extension (home screen + lock screen), compiled from the
// Swift files in this folder by the @bacons/apple-targets config plugin at
// prebuild (the plugin is listed in app.json). README.md here has the
// details.
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
