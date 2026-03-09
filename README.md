# 🥪 spendwich

No cloud. No nonsense. Just your money, in your browser.

**[Try it →](https://a-cristi.github.io/spendwich/)**

> Vibecoded with Claude.

## Features

### Transactions

- Add income and expenses with a date, amount, category, description, and optional labels
- Inline expense/income toggle — type a negative number and it flips automatically
- Edit or delete any transaction at any time

### Recurring transactions

- Mark any transaction as recurring: daily, weekly, monthly, or yearly
- Occurrences are generated at runtime — the source entry stays clean and human-readable
- Edit with scope: *only this occurrence*, *this and all future*, or *all occurrences*
- Month-end clamping: if a recurrence falls on a non-existent date (e.g. the 31st in February), it lands on the last valid day of that month

### Categories & labels

- Fully user-defined — name them whatever makes sense to you
- Categories carry an emoji icon chosen from a curated picker
- Labels are free-form tags; a transaction can have any number of them
- Deleting a category or label preserves existing references — they show as *(deleted)* rather than silently disappearing

### Multi-currency

Set a default currency and record transactions in any other currency. Exchange rates are fetched automatically from [Frankfurter](https://www.frankfurter.dev/) based on the transaction date — override manually at any time, or enter a rate directly if you're offline.

### Filtering & views

- Filter by category, label (with wildcard support — `*-hotel` matches `London-hotel`, `Paris-hotel`, etc.), or both
- Three transaction views: **Flat list**, **By category**, **By label**
- Date range modes: **Month**, **Year**, **Custom range**, **All time**

### Reports

- Monthly, yearly, custom range, and all-time summaries
- Income / Expenses / Net summary cards
- Breakdown by category or by label, with pie and bar charts
- Yearly view includes a month-by-month bar chart

### Import & export

- **CSV import** — order-independent column headers; clear per-row error messages on failure
- **JSON export / import** — full backup and restore in a human-readable, directly-editable format

## Your data

Everything lives in a single JSON file — open it in any text editor, version-control it, share it. It's just a file; you own it completely.

To sync across devices, connect a [remoteStorage](https://remotestorage.io/) account in Settings (free providers: [5apps](https://5apps.com/storage), self-hosted). Your data goes directly between your devices and your storage account — nothing passes through any server we control.

## Running it

Zero setup. Serve the files any way you like:

```bash
python -m http.server
# or
npx serve .
```

Then open `http://localhost:8000`. Or just open `index.html` directly — it works on `file://` too.

## Development

```bash
# Run tests (requires Node 20+)
node --test tests/*.test.js
```

- Pure logic lives in `src/` — no DOM dependencies, fully unit-testable
- UI code lives in `src/ui/` — not covered by automated tests
- No TypeScript, no bundler, no transpilation — plain ES modules throughout
- All conventions, design tokens, and architectural decisions are documented in `CLAUDE.md`
