# Keel widgets (WidgetKit extension)

Fully written, **not wired**: this code compiles into the app only through a
dev build (EAS + Apple Developer account). Expo Go ignores this folder
entirely. Until wired, nothing imports `src/lib/widgets.ts` and the widgets
never appear.

## What ships in the bundle

Two widgets, one shared timeline provider, Keel's night-at-sea look:

| Widget | Families | Shows |
|---|---|---|
| **Next payment** | home small + lock screen inline, circular, rectangular | The single next charge: name, amount, "Today / Tomorrow / In N days"; circular shows days-until as a dial number. |
| **Upcoming payments** | home medium (3 rows), home large (7 rows) | The next charges with due-in labels and amounts, month + committed total in the header. |

Behavior details:
- **The app does all the math.** `src/lib/widgets.ts` pre-formats a JSON
  snapshot (localized amounts via core, brand colors via the bleed rules,
  month total) into the App Group's UserDefaults. Swift only slices and
  renders; the sole Swift logic is relative-date labels, computed per
  timeline day so "Tomorrow" stays honest between app opens.
- **Timeline**: one entry per day for 7 days, `.atEnd`, plus a forced reload
  from the app on every data change.
- **Deep links**: every widget/row opens `keel://item?id=<id>` (expo-router
  handles the route).
- **Language**: follows the app's language (stored in the snapshot), not the
  device's. Gallery names/descriptions are English for now.
- Empty states: "All clear" / "Rien à venir"; a never-fed widget shows
  "Open Keel".

## Wiring steps (dev-build era)

1. `npx expo install @bacons/apple-targets` (from `apps/mobile`).
2. `app.json`: add `"@bacons/apple-targets"` to `plugins`, set
   `ios.appleTeamId`, and give the APP the same App Group:
   ```json
   "ios": {
     "entitlements": {
       "com.apple.security.application-groups": ["group.com.keel.app"]
     }
   }
   ```
3. `src/lib/widgets.ts`: delete the `@ts-expect-error` above the dynamic
   import (the package now exists).
4. Feed the widgets from `src/state/app-state.tsx`: extend the persist
   effect (the one calling `saveState`) with:
   ```ts
   import { buildWidgetSnapshot, writeWidgetSnapshot } from "../lib/widgets";
   // inside the effect, after saveState(...):
   void writeWidgetSnapshot(
     buildWidgetSnapshot(items, displayCurrency, rates, language, accent),
   );
   ```
   `language`: current i18n language narrowed to "en" | "fr"; `accent`: the
   dark theme's accent (widgets are always night-at-sea).
5. `eas build --profile development --platform ios` (prebuild picks up this
   folder), install, add widgets from the gallery, verify: data appears,
   day rollover relabels, taps deep-link, lock-screen shapes render.

## Constraints to remember

- The three identifiers must stay in sync (`group.com.keel.app`,
  `keel.widget.snapshot.v1`): `Shared.swift` / `expo-target.config.js` /
  `widgets.ts`.
- Swift here has never been compiled (written blind on Windows); budget a
  small fix round on the first EAS build.
- Widget iteration has no hot reload: every visual tweak is a full build.
  Batch widget work; consider the paid EAS tier for that stretch.
