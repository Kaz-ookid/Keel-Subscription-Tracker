# Keel widgets (WidgetKit extension)

Shipped and wired: the app feeds a JSON snapshot through the shared App
Group (`src/lib/widgets.ts`) on every data change, and these widgets render
it. The extension compiles into dev/EAS builds via `@bacons/apple-targets`;
Expo Go ignores this folder (the snapshot writer no-ops without the native
module).

## What ships in the bundle

Two widgets, one shared timeline provider, Keel's night-at-sea look:

| Widget | Families | Shows |
|---|---|---|
| **Next payment** | home small + lock screen inline, circular, rectangular | The single next charge: name, amount, "Today / Tomorrow / In N days"; circular shows days-until as a dial number. |
| **Upcoming payments** | home medium (4 rows), home large (12 rows) | The next charges with due-in labels and amounts, month + committed total in the header. |

Behavior details:
- **The app does all the math.** `src/lib/widgets.ts` pre-formats a JSON
  snapshot (localized amounts via core, brand colors via the bleed rules,
  month total) into the App Group's UserDefaults. Swift only slices and
  renders; the sole Swift logic is relative-date labels, computed per
  timeline day so "Tomorrow" stays honest between app opens.
- **Timeline**: one entry per day for 7 days, `.atEnd`, plus a forced reload
  from the app on every data change.
- **Deep links**: an Upcoming row opens its item (`keel://item?id=<id>`);
  everything else opens the Upcoming list (`keel://upcoming`). expo-router
  handles both routes.
- **Language**: follows the app's language (stored in the snapshot), not the
  device's. Gallery names/descriptions are English for now.
- Empty states: "All clear" / "Rien à venir"; a never-fed widget shows
  "Open Keel".

## How it is wired

- `@bacons/apple-targets` (in `app.json` plugins) compiles this folder into
  the widget extension at prebuild; `ios.appleTeamId` and the shared App
  Group are set in `app.json`.
- The app feeds the snapshot from the persist effect in
  `src/state/app-state.tsx` (via `buildWidgetSnapshot` /
  `writeWidgetSnapshot` in `src/lib/widgets.ts`) on every data change.

## Constraints to remember

- The three identifiers must stay in sync (`group.ch.keelapp.keel`,
  `keel.widget.snapshot.v1`): `Shared.swift` / `expo-target.config.js` /
  `widgets.ts`.
- Widget iteration has no hot reload: every visual tweak is a full build,
  so batch widget work.
