# Keel

Keel is a subscription and recurring-payment tracker. The goal is to answer
not just *what* you pay, but *when* it hits *which* account: "buy now pay
later" plans are tracked payment by payment, and every automatic charge can
be assigned to a specific bank account or card.

In early development. iOS first, Android and web planned. Not released.

## What works today

- Recurring subscriptions: any cycle (every N days/weeks/months/years),
  optional end date, price history, manual or automatic settlement
- Pay-in-X plans: per-installment tracking, progress, mark paid one by one
- Accounts: create/edit/archive, assign automatic payments, one currency
  per account
- Upcoming view: charges day by day through next month, overdue section,
  per-account totals ("account X needs Y by end of month")
- Committed-monthly summary on the subscriptions list
- Local-only storage on the device; no backend, no bank sync

Planned next: smoothing annual costs into the monthly view, reminders that
actually notify, receipt OCR capture.

## Structure

npm-workspaces monorepo:

- `packages/core`: all business logic (data model, money and date math,
  forecasting) as a pure TypeScript package with no UI dependencies, tested
  with Vitest
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
