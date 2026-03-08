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
  Inside a `<dialog>`, use `appendTo: dialog` instead of `static: true`. `static: true` keeps the calendar in the dialog DOM but always positions it below the input via `top: calc(100% + 2px)`, which gets clipped when the input is near the bottom. `appendTo: dialog` attaches the calendar to the `<dialog>` element (keeping it in the top layer) and uses page-absolute coordinates so it can position above or below the input as needed.
  The dialog has `overflow: auto`, so any Flatpickr input that sits in the right portion of the dialog (e.g. the last column of a multi-column grid) will have its calendar clipped on the right. Keep date inputs full-width or left-aligned so the calendar opens near the left edge of the dialog and stays within bounds.

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
- Transaction modal: Expense/Income segmented toggle defaults to Expense for new transactions; the amount field always shows an absolute value. Typing a negative number auto-flips the toggle and strips the sign. On save, the sign is applied: `isExpense ? -Math.abs(absAmt) : Math.abs(absAmt)`. The active Expense button uses `.btn-expense` (red) and the active Income button uses `.btn-income` (green) — never use `.btn-primary` for this toggle
- `openTxModal` accepts an optional `saveOverride(fields)` callback. When provided it replaces the default `addTransaction`/`updateTransaction` call while keeping toast/close/refresh unchanged. Used by the recurring scope dialog to route saves to `overrideOccurrence` or `splitSeries`
- Category icon: a single emoji stored as `cat.icon` (default `'🏷️'`). Shown in category list rows, transaction badges, group headers, modal category selector, and reports breakdown. The emoji picker in the category modal is a button grid of `EMOJI_SET` (~50 curated finance emoji); clicking highlights the selected button via border color and updates `selectedIcon`
- The `<nav>` is `position: sticky` — never give it any `overflow` value other than `visible`. CSS spec forces both axes to `auto` when you set one, turning the sticky nav into a scroll container; on Firefox Android (APZ) and iOS Safari this intercepts touch events on content below the nav. Route links live inside `<div class="nav-links">` (which carries `overflow-x: auto` on mobile); the `<nav>` itself stays overflow-free
- Transaction list row layout: the data columns (date + description/badges + amount) are wrapped in a `flex:1;min-width:0` inner div; the action buttons div gets `flex-shrink:0` so it never wraps to a second line on narrow viewports. Never put `flex-wrap:wrap` directly on `.list-row` — it allows the action buttons to detach from their row
- Reports summary cards: always display the Expenses value as `Math.abs(report.expenses)` — the card label and red colour already communicate expense polarity. NET keeps its sign (positive/negative is meaningful there)
- Transactions sidebar layout: the Transactions view uses a `.tx-layout` CSS Grid (`grid-template-columns: 220px 1fr`) with a `.tx-sidebar` on the left and `.tx-main` on the right. The sidebar is `position: sticky; top: 4.5rem` and contains three sections (Period, Filters, View) separated by `border-bottom`. On mobile (≤600px) `.tx-layout` switches to `display: block` and `.tx-sidebar` becomes a flat card above the list. All sidebar CSS uses `.tx-*` class names scoped to the transactions view — other views are not affected.
- Transactions sidebar — Period section: 4 vertical nav buttons (`.tx-sidebar-mode-btn`) replace the old seg-group tab row on desktop. On mobile a `<select class="tx-sidebar-mode-select">` replaces the buttons (hidden on desktop via `display:none`). The period nav (prev/next arrows + selects) lives in `.tx-sidebar-date-row`. Month mode uses a 2-row column layout (`[‹ month ›]` + `[year]`) to fit the 220px sidebar width; year mode uses a single flex row (`[‹ year ›]`).
- Transactions sidebar — Filter/View section: `.tx-sidebar-filter-area` is `display:flex; flex-direction:column; gap:0.5rem` on desktop (full-width selects fit naturally in 188px content area). On mobile it switches to a CSS Grid with `grid-template-areas: "cat toggle" "label label"` so category + view toggle share the first row and label search spans the full second row. Grid-area classes: `.tx-sidebar-filter-cat`, `.tx-sidebar-filter-toggle`, `.tx-sidebar-filter-label`.
- Never use `justify-content:space-between` on a full-width flex row when child items are narrow. On a 960px container this creates hundreds of pixels of dead space. Use `justify-content:flex-start` with an explicit `gap` instead

## Data

- User data is stored as a single JSON file — no File System Access API, no browser-specific code
- `settings.defaultCurrency` (ISO 4217, e.g. `"USD"`) is the baseline currency for `amountInDefault` calculations
- Load via `<input type="file">`, save via programmatic file download — works universally including Firefox
- The JSON structure must be human-readable and directly editable by the user
- Recurrence is stored as a single entry in the JSON (easy to manually edit) but displayed in the UI as individual expanded occurrences — the app generates virtual transactions from the recurrence rule at runtime without mutating the source entry
- Recurring edit/delete uses a **split-into-separate-transactions** approach rather than an `exceptions` field. Three scopes: (1) *Only this occurrence* — `overrideOccurrence`/`deleteOccurrenceAt` splits the series into a head (before), an override or gap, and a tail (after); (2) *This and all future* — `splitSeries`/`truncateSeries` truncates the head and creates a new tail; (3) *All occurrences* — operates directly on the source transaction. This keeps the JSON human-readable with no schema changes
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

- Fetch from the Frankfurter API (free, no auth) based on transaction date. Base URL: `https://api.frankfurter.dev/v1/` (the old `api.frankfurter.app` domain is dead as of early 2026)
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
- Segmented button toggle groups use the `.seg-group` CSS class (sets `gap:0`, removes intermediate border-radii, collapses inner border). Never use inline `display:flex;gap:0.25rem` for button groups that form a single control
- Transaction dates are displayed context-sensitively via `formatTxDate()`: month view shows `"Mar 15"` (no year, redundant in a single-month view); all other modes show `"Mar 15, 2026"`. Always use this function rather than rendering raw ISO strings in list rows
- Action buttons that contain only an SVG icon use `.btn-icon` (tighter padding) plus a `title` and `aria-label` attribute for accessibility

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
