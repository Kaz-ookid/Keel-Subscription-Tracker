# Keel

Keel is a subscription and recurring-payment tracker for iPhone. It answers
not just *what* you pay, but *when* it hits *which* account: "buy now pay
later" plans are tracked payment by payment, yearly costs are smoothed into
a real monthly number, and every charge knows the bank account it leaves.

Launching on the App Store. Website: [keel-app.ch](https://keel-app.ch).

## What it does

- **Recurring subscriptions**: any cycle (every N days/weeks/months/years),
  weekday anchors ("first Thursday"), optional end date, free trials and
  scheduled price changes, price history with typo-vs-real-change edits,
  weekend-aware debit dates, manual or automatic settlement
- **Split payments (pay-in-X / BNPL)**: per-installment tracking, progress,
  provider, tick payments off one by one
- **Accounts**: create/edit/archive, assign payments, one currency per
  account, per-account totals and filtered views
- **Payments views**: day-by-day upcoming timeline with overdue section,
  full catalog with sorting and filters, monthly calendar with brand logos
  on their due days, and a harbor
- **Insights**: spending by category and by account, monthly history and
  forecast charts, yearly costs smoothed into the monthly baseline,
  price-change log, multi-currency merge at ECB reference rates
- **AI-assisted import**: paste a generated prompt into any assistant and
  review every proposed line before it is saved; or, on iOS 27, let Apple's
  cloud model (Private Cloud Compute) do the reading, opt-in and described
  in Apple's terms. Entirely optional, and it switches off completely.
- **Reminders**: up to three per commitment, any lead (days, weeks,
  months), repeating nudges until the due day, plus a daily/weekly/monthly
  overdue summary
- **Home screen widgets**: the next payments and the days ahead, theme-aware
- **Data**: local-first on the device, daily automatic local backups with
  history, file export/import, private iCloud backup; no developer server,
  no account, no tracking
- **App lock** (Face ID / passcode), five languages (EN, FR, DE, IT, PL),
  light and dark themes

## Structure

npm-workspaces monorepo:

- `packages/core`: all business logic (data model, money and date math,
  forecasting, reminder planning, import parsing) as a pure TypeScript
  package with no UI dependencies, tested with Vitest
- `apps/mobile`: Expo / React Native app (expo-router), the only UI layer
  so far — plus small local Swift modules (widgets, iCloud key-value
  storage, Apple Intelligence bridge)

## Development

```sh
npm install
npm test          # core unit tests
npm run typecheck # both packages
npm run lint
npm run format
cd apps/mobile && npx expo start   # run the app
```

## A note on comments

Code comments occasionally cite internal working documents (PROJECT_BRIEF,
DESIGN.md, section numbers like §7.3). Those are the project's private
planning notes and are not part of this repository; the citations mark
where a design decision is recorded, and the surrounding comment carries
the decision itself.

## License

Source visible for transparency. © 2026 Maxime Teuber, all rights
reserved.
