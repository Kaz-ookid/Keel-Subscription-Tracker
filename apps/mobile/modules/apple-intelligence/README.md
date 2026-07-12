# Apple Intelligence in Keel

Fully written, **not wired**: the native half needs a dev build (Expo Go
can't load it), and nothing in the app links to the screen yet. In Expo Go
every availability probe answers "unavailable" and the app behaves exactly
as before.

## What Apple Intelligence offers apps, and what Keel uses

| Surface | What it is | Keel verdict |
|---|---|---|
| **Foundation Models framework** (iOS 26) | Direct Swift access to the on-device ~3B LLM: `LanguageModelSession`, guided generation (`@Generable` schemas force valid structured output), tool calling, streaming. Free, offline, private. | **Built — this module.** It is exactly PROJECT_BRIEF §6.1 Path C/D: the AI import running on-device, no per-use cost, nothing leaving the phone. Guided generation IS the "grammar-constrained decoding" the ai-training plan requires. |
| Writing Tools | Proofread/rewrite in text fields, automatic on standard text views. | Nothing to build; text inputs get it for free on-device. |
| App Intents (Siri, Shortcuts, Spotlight) | "Add a subscription", "What's due next?" as system actions. | Worthwhile follow-up, separate work: needs App Intents Swift in the app target and a different bridge. Not in this pass. |
| Genmoji / Image Playground / Visual Intelligence | Image generation & camera understanding. | Not applicable to Keel. |

Requirements at runtime: iPhone 15 Pro or newer, iOS 26+, Apple Intelligence
enabled in iOS Settings, model downloaded. The `availability()` probe reports
each of these as a distinct state and the screen explains them.

## Architecture (same philosophy as the widgets)

- **Swift is a constrained executor, not a brain.**
  `ios/AppleIntelligenceModule.swift` runs the model;
  `ios/ImportSchema.swift` mirrors import format v1 as `@Generable` types so
  decoding physically cannot produce anything else. It returns raw JSON.
- **Core keeps owning the format.** The instructions are core's
  `buildImportPrompt` (same as the bring-your-own-AI path), the output goes
  through core's `parseImportDocument` (same validation, same warnings), and
  everything still lands on the review screen. One format, one parser, two
  model providers.
- `src/lib/apple-intelligence.ts` is the guarded JS door (lazy import,
  "unavailable" on any failure). `app/add/import-ondevice.tsx` is the
  finished screen: availability states, input, busy state, errors, then the
  normal review flow.

## Wiring steps (dev-build era)

1. Nothing to install: local Expo modules under `modules/` are autolinked at
   prebuild. The first `eas build` compiles this module.
2. Light up the entry point in `app/add/import.tsx`: replace the
   `keelComingSoon` alert on the "Keel reads it for you" card with
   `router.push("/add/import-onDevice" → "/add/import-ondevice")` when
   `onDeviceAvailability()` resolves to anything but "unavailable", keeping
   the coming-soon alert otherwise. (One state + one conditional; the card
   already exists.)
3. Update the card copy: `importAI.methodKeelSoon` should only show when the
   path stays unavailable.
4. On-device QA: rough FR + EN lists, screenshots-derived text, trials,
   split payments; verify the review screen flags exactly like the external
   path; test all four unavailability states (old iOS, non-Pro device, AI
   toggled off, model downloading).

## Constraints to remember

- Swift here has never been compiled (written blind on Windows); the
  Foundation Models API shapes follow Apple's docs and WWDC25 material.
  Budget a fix round on the first EAS build.
- `@Generable` + `Codable` on the same structs is intentional (encode the
  decoded value straight back to JSON); if the macros clash at compile time,
  add small mirror structs for encoding instead.
- Images: the current module takes TEXT only. Vision-framework OCR of
  screenshots feeding the same pipeline is the natural v2 (PROJECT_BRIEF
  §6.1 already plans it).
