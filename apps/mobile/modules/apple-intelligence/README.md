# Apple Intelligence in Keel

The "Keel reads it for you" path: the AI import (and the debug-only
assistant) run on Apple's **Private Cloud Compute** model
(`PrivateCloudComputeLanguageModel`, iOS 27), through this local Expo
module. Opt-in: nothing is sent until the user turns it on (the import
screen asks in place; Settings keeps the switch). The native half needs a
dev build; in Expo Go every availability probe answers "unavailable" and
the screens explain themselves instead of working.

Two jobs share this module:
- **The reader** (`parseSubscriptions`): rough notes in, import-format v2
  JSON out (`ios/ImportSchema.swift`).
- **The assistant** (`assist`): a natural-language request against core's
  grounding snapshot (`buildAssistantPrompt`) in, plan JSON out
  (`ios/AssistantSchema.swift`); core's `parseAssistantPlan` resolves and
  validates, the review screen confirms, the store applies with a safety
  backup.

Cloud-or-nothing (decided 2026-10-11): the on-device model was tried
(device QA 2026-07-20) and could not carry the feature; it is not offered.
When the cloud model cannot run (OS, device, offline, daily allowance
spent) the screens say which wall it hit and point at bring-your-own AI.

## What Apple Intelligence offers apps, and what Keel uses

| Surface | What it is | Keel verdict |
|---|---|---|
| **Foundation Models framework** (iOS 26) | Direct Swift access to the on-device ~3B LLM: `LanguageModelSession`, guided generation (`@Generable` schemas force valid structured output), tool calling, streaming. Free, offline, private. | **Tried and retired.** The ~3B on-device model could not read real lists (context, quality). Guided generation stays: the same `@Generable` schemas now constrain the cloud model. |
| Writing Tools | Proofread/rewrite in text fields, automatic on standard text views. | Nothing to build; text inputs get it for free on-device. |
| App Intents (Siri, Shortcuts, Spotlight) | "Add a subscription", "What's due next?" as system actions. | Worthwhile follow-up, separate work: needs App Intents Swift in the app target and a different bridge. Not in this pass. |
| Genmoji / Image Playground / Visual Intelligence | Image generation & camera understanding. | Not applicable to Keel. |

Requirements at runtime: iOS 27+, the `com.apple.developer.private-cloud-compute`
entitlement (managed capability, granted 2026-10-11), a network connection,
and whatever device eligibility Apple applies to the cloud model (being
verified on an iPhone 14 Plus, which is not Apple Intelligence-capable).
The `availability()` probe reports each state and the screen explains it.

## Architecture (same philosophy as the widgets)

- **Swift is a constrained executor, not a brain.**
  `ios/AppleIntelligenceModule.swift` runs the model;
  `ios/ImportSchema.swift` mirrors import format v2 as `@Generable` types so
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

## QA checklist (dev build on iOS 27)

Local Expo modules under `modules/` are autolinked at prebuild; the UI
entry points are the import hub card and the assistant (Settings, debug).

1. Consent: first open of "Keel reads it for you" asks before sending;
   declining leads to the bring-your-own path; the Settings switch
   mirrors the choice both ways.
2. Reader: rough FR + EN lists, screenshot-derived text, trials, split
   payments; the review screen flags exactly like the external path.
3. Walls, each with its own message: airplane mode (offline), allowance
   exhausted (quota), a device Apple deems ineligible, Apple Intelligence
   switched off, iOS 26 (the card must not appear at all).
4. Assistant (debug drawer): pause/resume/end/delete/rename/move/reprice
   on real and fuzzy names, FR + EN; unresolved reasons show instead of
   wrong guesses; the safety backup lands and reverts from AI history.

## The privacy claim, restated for the cloud model (2026-10-11)

The on-device era's claim ("nothing leaves the phone") no longer describes
this path, and the copy must never pretend it does. The honest statement,
used everywhere (app, site, policy):

- **Opt-in.** Off until the user turns it on; the import screen asks in
  place before the first byte leaves, Settings keeps the switch, and the
  AI hard switch above it removes every AI surface.
- **Where it goes, in Apple's terms.** The text is processed on Apple's
  Private Cloud Compute. Apple states that data sent there is not stored
  and is not accessible to Apple, and PCC is externally inspectable by
  design (researchers get a Virtual Research Environment). Keel relays
  these as Apple's commitments, never as its own.
- **What Keel itself does.** No server, no account; the app sends the
  text to Apple's model and reads the answer back on the phone; every
  item stops at the review screen before anything is saved.
- **The allowance and the cap.** PCC has a per-user daily allowance (the
  "quota" failure maps to its own message), and app-level access is free
  under the Small Business Program for apps under 2M first-time
  downloads, with a 6-month migration window if that is ever crossed.
  That is why PCC stays an engine behind this bridge: swappable.
- Wording rule for site/store/posts: say "Apple's cloud model (Private
  Cloud Compute)". Never "Apple Intelligence is fully local", never
  "nothing leaves your phone" about this path.

## Constraints to remember

- `@Generable` + `Codable` on the same structs is intentional (encode the
  decoded value straight back to JSON); if the macros clash at compile time,
  add small mirror structs for encoding instead.
- Images: the current module takes TEXT only. Vision-framework OCR of
  screenshots feeding the same pipeline is the natural v2 (PROJECT_BRIEF
  §6.1 already plans it).
