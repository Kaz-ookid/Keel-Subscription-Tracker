# Keel

Keel is a subscription and recurring-payment tracker. The goal is to answer
not just *what* you pay, but *when* it hits *which* account: "buy now pay
later" plans are tracked payment by payment, and every automatic charge can
be assigned to a specific bank account or card.

In active development. iOS first, Android and web planned. Not released.

## What works today

- Recurring subscriptions: any cycle (every N days/weeks/months/years),
  weekday anchors ("first Thursday"), optional end date, free trials and
  scheduled price changes, price history with typo-vs-real-change edits,
  manual or automatic settlement
- Split payments (pay-in-X / BNPL): per-installment tracking, progress,
  provider, mark paid one by one
- Accounts: create/edit/archive, assign payments, one currency per account,
  per-account totals ("account X needs Y by end of month")
- Payments views: day-by-day upcoming timeline with overdue section, full
  catalog with sorting and status filters, monthly calendar
- Insights: spending by category (donut) and by account, monthly history
  and forecast charts, price-change log, multi-currency merge into a
  display currency (ECB reference rates)
- AI-assisted import: paste any AI's answer to a generated prompt and
  review every proposed item before it's saved
- Reminders: local notifications with a notification center (master
  switch, default lead and time of day, scheduled list with quick add,
  preview)
- Data: local-only storage on the device, daily automatic local backups
  with history (restore/share), file export/import; no backend, no bank
  sync
- App lock (Face ID / passcode), English + French, dark theme by default

## Structure

npm-workspaces monorepo:

- `packages/core`: all business logic (data model, money and date math,
  forecasting, reminder planning, import parsing) as a pure TypeScript
  package with no UI dependencies, tested with Vitest
- `apps/mobile`: Expo / React Native app (expo-router), the only UI layer
  so far

## Development

```sh
npm install
npm test          # core unit tests
npm run typecheck # both packages
npm run lint
npm run format
cd apps/mobile && npx expo start   # run the app
```
