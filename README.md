# 🥪 spendwich

Track what you do, not what you have.

Local-first personal finance for people who want perspective, not punishment.

spendwich is a browser-based app for tracking income, expenses, and spending patterns in a single JSON file you fully own. No backend, no account, no financial theater.

**[Try it →](https://a-cristi.github.io/spendwich/)**

## Why spendwich

- Local-first: no backend, no account, no vendor-controlled data store
- Plain JSON data: readable, editable, easy to back up, easy to version-control
- Static app: runs from a tiny local server or GitHub Pages
- Optional sync: connect your own [remoteStorage](https://remotestorage.io/) account if you want multi-device sync

## What it does

### Transactions

- Add income and expenses with date, amount, category, description, and optional labels
- Edit or delete any transaction at any time
- Inline expense/income toggle — type a negative number and it flips automatically
- Mark transactions as recurring: daily, weekly, monthly, or yearly
- Edit recurring entries with scope: *only this occurrence*, *this and all future*, or *all occurrences*
- Three views: flat list, grouped by category, grouped by label
- Date range modes: **Last month**, **Month**, **Year**, **Custom range**, **All time**
- Filter by category or label (wildcard support: `*-hotel` matches `London-hotel`, `Paris-hotel`, etc.)

### Categories & labels

- Fully user-defined with emoji icons (categories) and free-form tags (labels)
- Deleting a category or label preserves existing references — they show as *(deleted)*

### Multi-currency

Record transactions in any currency. Exchange rates are fetched automatically from [Frankfurter](https://www.frankfurter.dev/) based on the transaction date, or enter a rate manually when needed.

### Reports

- Summary cards with delta vs prior period, daily average, and sparkline
- Category and label breakdowns with pie and bar charts
- Click a category or label to drill into a spending trend chart
- Category trend drill-down includes spike detection and an erratic badge for irregular spending
- **% of Income mode** — see expense categories as a share of income over time
- **Compare mode** — put two periods side by side with a plain-language synthesis
- Period modes: **Last month**, **Month**, **Year** (auto year-to-date for the current year), **Custom range**, **All time**

### Import & export

- **CSV import** — order-independent headers, clear per-row errors
- **JSON export / import** — full backup and restore in a human-readable format
- **Sample data** — load a realistic demo dataset to explore the app without entering real data

### Dark mode

Follows your system preference by default; override in Settings.

## Non-goals

- Not a budgeting app with envelopes, targets, or forced monthly plans
- Not a bank aggregation product with Plaid-style account linking
- Not an investing or net-worth tracker
- Not financial advice — it helps you see your data, not tell you what to do

## Your data

Everything lives in a single JSON file you own completely. Open it in any text editor, version-control it, share it, or keep it entirely local.

Example shape:

```json
{
  "version": 2,
  "settings": {
    "defaultCurrency": "USD"
  },
  "categories": [
    { "id": "...", "name": "Groceries", "icon": "🛒" }
  ],
  "labels": [
    { "id": "...", "name": "meal-prep" }
  ],
  "transactions": [
    {
      "id": "...",
      "date": "2026-04-25",
      "amount": -42.5,
      "currency": "USD",
      "amountInDefault": -42.5,
      "exchangeRate": 1,
      "categoryId": "...",
      "labelIds": ["..."],
      "description": "Market run",
      "recurrence": null
    }
  ]
}
```

To sync across devices, connect a [remoteStorage](https://remotestorage.io/) account in Settings (free providers: [5apps](https://5apps.com/storage), self-hosted). Sync is optional. Data goes directly between your devices and your storage — nothing passes through any server we control.

## Running it

Zero setup. Serve the files any way you like:

```bash
python -m http.server
# or
npx serve .
```

Then open `http://localhost:8000`.

## Development

Pure logic lives in `src/` and is unit-tested with Node. UI code lives in `src/ui/` and is exercised manually in the browser.

```bash
npm install          # once
node --test tests/*.test.js
npm run lint
```

- No TypeScript, no bundler, no transpilation — plain ES modules throughout
- Conventions, design tokens, and architecture notes live in `CLAUDE.md`

Vibecoded with Claude.
