# spendwich — dev notes

## Philosophy

- No build step — the app must be servable as static files directly (e.g. GitHub Pages, `python -m http.server`, `npx serve`)
- No backend, no database, no auth — everything runs in the browser
- Minimal dependencies — prefer native browser APIs; third-party libraries are fine when they serve a clear purpose and are lightweight (ideally zero dependencies of their own)
- Responsive — must work on desktop and mobile
- After completing any feature, fix, or refactor, proactively review `CLAUDE.md` and propose additions for any decisions, patterns, or conventions that were established. Do not wait to be asked
- Changes to `CLAUDE.md` always land in a dedicated commit — nothing else changes in that commit

## Design tokens

- `--primary: #5055d8` (warm indigo)
- `--bg: #f4f3ef` (off-white)
- `--surface: #ffffff`
- Income amounts: `#15803d` (green)
- Expense amounts: `#b91c1c` (red)
- Category badges: `background:#e0e7ff; color:#3730a3` (blue). Label badges: `background:#ede9fe; color:#5b21b6` (purple). Apply consistently in both flat list and tree views. Null groups (uncategorized / no label) use plain muted text, no badge.

## Dependencies

- Before adding any new library, present a short **pros / cons list** and wait for permission. Factors to weigh: bundle size, number of transitive dependencies, API stability, whether a native browser API covers the same ground.
- Always pin CDN resources to an exact version and include a matching SRI `integrity` attribute (`sha256-…`) with `crossorigin="anonymous"`. Fetch the hash from `https://data.jsdelivr.com/v1/package/npm/<pkg>@<version>/flat` when adding or upgrading.
- **Chart.js 4.4.9** — `https://cdn.jsdelivr.net/npm/chart.js@4.4.9/dist/chart.umd.js`
  `integrity="sha256-3jFXc0VLYHa2OZC/oFzlFVo39xmSyH17tfmi6mmGl+8=" crossorigin="anonymous"`
- **Flatpickr 4.6.13** — date picker (week starts Monday, keyboard-navigable, clear close UX)
  JS: `https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/dist/flatpickr.min.js`
  `integrity="sha256-Huqxy3eUcaCwqqk92RwusapTfWlvAasF6p2rxV6FJaE=" crossorigin="anonymous"`
  CSS: `https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/dist/flatpickr.min.css`
  `integrity="sha256-GzSkJVLJbxDk36qko2cnawOGiqz/Y8GsQv/jMTUrx1Q=" crossorigin="anonymous"`
  Always use `dateFormat: 'Y-m-d'` and `locale: { firstDayOfWeek: 1 }`. Use `type="text"` inputs (not `type="date"`).
  Inside a `<dialog>`, always add `static: true` — dialogs render in the browser top layer, so Flatpickr's default of appending the calendar to `<body>` puts it behind the dialog.

## Architecture

- Vanilla JavaScript (ES modules)
- Single `index.html` entry point
- Pure logic lives in `src/` — no DOM dependencies, fully testable with Node
- DOM/UI code lives in `src/ui/` — not covered by tests
- Hash-based client-side routing (`#transactions`, `#categories`, `#labels`, `#reports`, `#settings`). No History API — keeps compatibility with `file://` serving
- The store is the single source of truth. UI components never mutate data directly; they call store functions and re-render
- Every view module exports `render(container)`, manages its own module-level `_container` reference, and has a local `refresh()` for re-renders without full remount
- Modal pattern: `openModal({ title, body, footer }) → { close, dialog, bodyEl }` using native `<dialog>` element — no library needed
- `expandAndFilter` matches `labelPattern` against **label names** (not IDs). Always pass `labels: data.labels` in the options object when a labelPattern may be used
- `groupByLabel`: a transaction with N labels appears in all N groups. Totals can overlap and will not sum to the overall total — each label shows the full cost of everything tagged with it. The by-label view displays a visible note warning users about this overlap
- Import/export split: CSV import and Export JSON live in the Transactions header (quick access, contextually a transaction operation). Full JSON import/export (backup/restore) also lives in Settings. The Transactions empty state shows prominent import CTAs for first-time users
- When `refresh()` destroys and recreates the DOM while a text input has focus, capture `selectionStart` before calling `refresh()` and restore focus + cursor to the new input after — see the `#filter-label` handler in `src/ui/views/transactions.js`
- Transaction modal: Expense/Income segmented toggle defaults to Expense for new transactions; the amount field always shows an absolute value. Typing a negative number auto-flips the toggle and strips the sign. On save, the sign is applied: `isExpense ? -Math.abs(absAmt) : Math.abs(absAmt)`
- Category icon: a single emoji stored as `cat.icon` (default `'🏷️'`). Shown in category list rows, transaction badges, group headers, modal category selector, and reports breakdown. The emoji picker in the category modal is a button grid of `EMOJI_SET` (~50 curated finance emoji); clicking highlights the selected button via border color and updates `selectedIcon`

## Data

- User data is stored as a single JSON file — no File System Access API, no browser-specific code
- `settings.defaultCurrency` (ISO 4217, e.g. `"USD"`) is the baseline currency for `amountInDefault` calculations
- Load via `<input type="file">`, save via programmatic file download — works universally including Firefox
- The JSON structure must be human-readable and directly editable by the user
- Recurrence is stored as a single entry in the JSON (easy to manually edit) but displayed in the UI as individual expanded occurrences — the app generates virtual transactions from the recurrence rule at runtime without mutating the source entry
- When a recurrence date is invalid (e.g. Feb 30), clamp to the last valid day of that month
- **Use UTC date methods exclusively** (`getUTCFullYear`, `setUTCDate`, etc.) throughout recurrence logic
- Never construct a `Date` from a bare YYYY-MM-DD string — `new Date('2026-01-15')` is implementation-defined (UTC in V8 today, but fragile). Always append the suffix: `new Date(dateString + 'T00:00:00Z')`
- Always call `migrate()` before `validate()` when loading imported JSON. Validation must see current-schema data; running it on pre-migration data produces false failures if a future `validate()` check references a field that `migrate()` is responsible for introducing
- Transaction sign convention: negative amount = expense, positive = income. Do not use a separate type field
- `amountInDefault` and `exchangeRate` are stored on every transaction and must be kept in sync when editing
- Orphaned category/label references (from deleted entities) are preserved in the JSON and rendered with a `(deleted)` badge. Never strip or null-out references on delete
- JSON schema version is stored as `data.version` (integer). `CURRENT_VERSION = 2`. Run `migrate()` on import. Warn but do not block if version is higher than `CURRENT_VERSION`
- v1→v2 migration: `color` was removed from categories; `icon` (single emoji, default `'🏷️'`) was added
- Virtual transactions produced by the recurrence expander carry `isVirtual: true` and a `sourceId` pointing to the parent. They must never be passed to store mutation functions
- Virtual transaction IDs use the format `sourceId + '-' + YYYY-MM-DD`. They are not UUIDs
- Recurrence expansion window: from the transaction's `date` up to today (inclusive) for the list view; up to the report period's end date for reports. Never expand to infinity

## Exchange rates

- Fetch from the Frankfurter API (free, no auth) based on transaction date
- Degrade gracefully if offline or API unavailable — fall back to manual entry
- Never block the user from saving a transaction due to exchange rate unavailability
- Cache fetched rates in a module-level `Map` for the lifetime of the page. Key format: `"<FROM>-<TO>-<DATE>"`
- Set a 5-second `AbortController` timeout on every fetch
- Frankfurter returns the most recent prior business day's rate for weekends — store the rate as returned. This is acceptable

## CSV import

- Parsed entirely in the browser (no server upload). RFC 4180 compliant (quoted fields, escaped quotes).
- On failure, throw a specific human-readable error (e.g. `Row 4: unknown category "Food"`). Never a silent failure or generic "import failed".
- Expected columns (header row required, order-independent): `date` (YYYY-MM-DD), `amount` (signed decimal), `currency`, `category`, `description`, `labels` (semicolon-separated, optional)
- `category` is required and must be non-empty after trimming — throw `Row N: category is required` for blank values. `labels` is the only optional column

## Code style

- ES modules (`import`/`export`), not CommonJS
- No TypeScript — plain JS is fine for this scope
- No comments unless the logic is genuinely non-obvious
- Keep functions small and single-purpose
- No transpilation, no bundler
- Never use `innerHTML +=` — it re-serializes and re-parses the entire container, destroying all child nodes and their event listeners. Use `appendChild` with `createElement` instead
- Always pass user-supplied or imported data through `escHtml()` before inserting into innerHTML, including values from imported JSON (e.g., error messages). Emoji icon values do not need escaping — they contain no HTML-special characters
- `escHtml()` and `formatAmount()` live in `src/ui/utils.js` — import from there; do not define private copies in individual view files

## Testing

- Use `node:test` (Node 20+) — zero install, ES-module-native, no config required
- Run with: `node --test tests/*.test.js`
- Only `src/` modules are tested. `src/ui/` is not covered by tests
- Tests must pass before any commit touching `src/`
- `store._reset()` exists solely for test isolation — call it in `beforeEach` in any test file that touches store state. Do not call it in application code

## Git

- Commit after each feature is working, not all at once at the end
- Partially implemented features that can be committed are also ok
- Use conventional commit messages (`feat:`, `fix:`, `chore:`, etc.)
- Work directly on `main`
