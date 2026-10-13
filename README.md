# Keel

**Know what you pay, when it hits, and which account it leaves.**

Keel is a subscription and recurring-payment tracker for iPhone. Most
trackers answer "how much per month". Keel answers the three questions
they skip: a "pay in 4" purchase is tracked payment by payment, every
charge knows the bank account it leaves, and yearly costs are smoothed into
a monthly number that never ambushes a month.

[Download on the App Store](https://apps.apple.com/app/id6792831014) ·
[keel-app.ch](https://keel-app.ch) · iOS 16.4+ · English, French, German,
Italian, Polish

## What it does

**Track**

- Subscriptions on any cycle (every N days, weeks, months or years, or
  "the first Thursday"), with an optional end date, free trials, intro
  prices that graduate on their date, and a price history that tells a typo
  from a real change.
- Split payments (pay-in-X, buy now pay later): the plan is one commitment,
  each installment is its own payment you tick off.
- Automatic charges log themselves on their day. Manual ones wait for your
  tap and sit at the top of Upcoming until they are paid or skipped.
- Weekend-aware due dates for banks that never debit on a Saturday.
- Accounts: assign every payment to the account it leaves, each in its own
  currency, with per-account totals and views.

**Stay ahead**

- Up to three reminders per commitment, any lead, repeating until the due
  day, plus a daily, weekly or monthly summary of what is still unpaid.
- Trial-end reminders before the first real charge.
- Home screen widgets: the next payment and the days ahead.

**Understand**

- Upcoming timeline, full catalog with sort and filters, monthly calendar
  with brand logos on their days.
- Insights: spending by category and by account, monthly history and
  forecast, price-change log, yearly costs smoothed into the monthly
  baseline, several currencies merged at ECB reference rates.

**Import**

- Type a rough list, or hand Keel screenshots and documents (PDF
  statements, scanned or not, CSV and text exports). Text is captured on
  the phone, personal details such as card numbers, IBANs, phone numbers,
  reference numbers and the personal part of email addresses are removed
  automatically, and you preview what is left before anything is sent.
- The reading itself is done either by Apple's cloud model (Private Cloud
  Compute, opt-in, iOS 27) or by an AI you already use, with instructions
  Keel generates. What the model leaves out, Keel reads off your own
  lines: prices, currencies, cycles, dates, payment mode. Every result
  lands on a review screen, grouped by account, before it is saved. AI is
  optional and switches off completely.

**Keep it yours**

- Local-first: your data lives on your phone as one file. Daily automatic
  backups with history, manual backups, file export and import, and an
  optional iCloud copy that follows your Apple ID.
- No account, no server, no tracking. Face ID or passcode lock.

## Principles

- **All logic in one pure core.** The data model, date and money math,
  forecasting, reminder planning, import parsing and personal-data
  scrubbing live in `@keel/core`, a TypeScript package with no UI
  dependency and its own test suite. The app is a thin layer over it, which
  keeps other platforms possible without a rewrite.
- **Dates are strings, money is integers.** Calendar days are
  `YYYY-MM-DD` strings compared lexically; amounts are minor units with an
  explicit currency. No floating point, no time zones in the model.
- **Nothing is applied without review.** Imports and assistant actions
  propose; a review screen disposes. Destructive actions back up first.
- **Native where it matters.** iOS specifics (widgets, Vision text
  recognition, PDFKit, StoreKit, Private Cloud Compute) are small Swift
  modules behind typed bridges that degrade quietly where a capability is
  absent.

## Repository

```
packages/core        @keel/core: models, calculations, import, assistant plans (Vitest)
apps/mobile          Expo app (expo-router, React Native, React 19)
  app/               screens, file-based routes
  src/components     shared UI (ui/ building blocks, ai/ kit, feature folders)
  src/lib            device-side services: storage, backups, iCloud, purchases, notifications
  src/state          the app state provider and session stores
  src/i18n           five locales, key parity enforced by the type checker
  modules/           local Expo modules (Swift): apple-intelligence, trial-anchor, extension-storage
  targets/widgets    the WidgetKit extension
```

## Development

```sh
npm install
npm run typecheck                      # core, then the app
npx eslint .
npx vitest run --root packages/core    # core tests
cd apps/mobile && npx expo start       # the app
```

The app runs in Expo Go with the native modules absent (each reports
"unavailable" and the feature hides itself). Widgets, purchases, iCloud,
text recognition and the cloud model need a development build:

```sh
cd apps/mobile && npx eas-cli build --platform ios --profile development
```

Before every commit: Prettier on touched files, ESLint, the type check,
the core tests, and `npx expo export --platform ios` as a bundle check.

## Privacy

Keel has no backend. Data stays on the device unless you export it, turn
on the iCloud copy, or choose an AI path. Brand logos come from a public
icon service only after you opt in. The full policy is at
[keel-app.ch/privacy](https://keel-app.ch/privacy.html).

## A note on comments

Code comments cite internal working documents (PROJECT_BRIEF, DESIGN.md,
section numbers like §7.3). Those are the project's private planning notes
and are not part of this repository; a citation marks where a decision is
recorded, and the surrounding comment carries the decision itself.

## License

The source is published for transparency. © 2026 Maxime Teuber, all rights
reserved. See [LICENSE](LICENSE).
