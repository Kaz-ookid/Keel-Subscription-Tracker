# Apple Intelligence in Keel

The "Keel reads it for you" path: the AI import (and the debug-only
assistant) run on Apple's **Private Cloud Compute** model
(`PrivateCloudComputeLanguageModel`, iOS 27), through this local Expo
module. Opt-in: nothing is sent until the user turns it on (the import hub
asks in place; the "AI features" switch in Settings removes every AI
surface). The native half needs a development build; without it every
availability probe answers "unavailable" and the screens explain themselves
instead of working.

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
When the cloud model cannot run (OS, device, offline, per-user allowance
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
and an Apple Intelligence device: the cloud model is device-gated like the
on-device one (verified 2026-10-12, an iPhone 14 Plus is refused). The
`availability()` probe reports each state and the screen explains it.

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
- **Code does the deterministic part around the model.** Before the read,
  core splits a typed list at account headings and reads each section with
  its own currency (`headings.ts`), and condenses a long document to the
  lines that matter (`condenseDocument`, `line-facts.ts`). After the model
  answers, core reads off each typed line whatever the model left out
  (price, currency, manual/automatic, cycle, day, start date) and a
  document's total, payment mode and due date off their label lines
  (`readLineFacts`, `readDocumentFacts`), before any default applies.
- `src/lib/apple-intelligence.ts` is the guarded JS door (lazy import,
  "unavailable" on any failure). `app/add/import-keel.tsx` is the screen
  (Screenshots and Documents, read on the device by the Vision framework,
  then Type or paste; availability states, busy state, errors) and
  `app/add/import-keel-preview.tsx` the editable preview with the automatic
  privacy scrub (card numbers, IBANs, phone numbers, references, tax ids and
  the personal part of emails removed, the domain kept because it names the
  issuer), then the normal review flow grouped by account.

## QA checklist (dev build on iOS 27)

Local Expo modules under `modules/` are autolinked at prebuild; the UI
entry points are the import hub in the Add sheet and the assistant (debug
drawer, dev and beta builds only).

1. Consent: first open of "Keel reads it for you" asks before sending;
   declining leads to the bring-your-own path; there is no separate
   Settings consent switch, the "AI features" switch removes the whole
   path.
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

- **Opt-in.** Off until the user turns it on; the import hub asks in
  place before the first byte leaves, and the "AI features" switch in
  Settings removes every AI surface.
- **Where it goes, in Apple's terms.** The text is processed on Apple's
  Private Cloud Compute. Apple states that data sent there is not stored
  and is not accessible to Apple, and PCC is externally inspectable by
  design (researchers get a Virtual Research Environment). Keel relays
  these as Apple's commitments, never as its own.
- **What Keel itself does.** No server, no account; the app sends the
  text to Apple's model and reads the answer back on the phone; every
  item stops at the review screen before anything is saved.
- **The allowance and the cap.** Apple applies a per-user allowance that
  behaves like a rolling window, not a daily reset; the app trusts only
  Apple's own probe about it (the "quota" failure maps to its own
  message), and app-level access is free
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
- Images: this module takes TEXT only. Screenshots and scanned PDFs are
  read on the device by the Vision framework first, shown in the editable
  preview, and the resulting text goes through the same pipeline.
