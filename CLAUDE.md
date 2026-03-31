# spendwich — dev notes

## Philosophy

- No build step — the app must be servable as static files directly (e.g. GitHub Pages, `python -m http.server`, `npx serve`)
- No backend, no database, no auth — everything runs in the browser
- Minimal dependencies — prefer native browser APIs; third-party libraries are fine when they serve a clear purpose and are lightweight (ideally zero dependencies of their own)
- Responsive — must work on desktop and mobile
- Only add to `CLAUDE.md` when a rule is non-obvious and cannot be recovered by reading the code. Never document what existing code does — only why it was built that way or what must never be done.
- Changes to `CLAUDE.md` always land in a dedicated commit — nothing else changes in that commit

## Design tokens

- `--primary: #5055d8` (warm indigo)
- `--bg: #f2f0ea` (warm off-white)
- `--surface: #fffefb` · `--surface-hover: #faf8f2` · `--border: #e5e2d9`
- `--text: #1c1917` · `--text-muted: #78716c` · `--radius: 10px`
- `--font-serif: 'Fraunces', Georgia, serif` — brand/page headings only. Never for numbers (causes optical-sizing drift at different character counts)
- `--font-sans: 'Plus Jakarta Sans', system-ui, sans-serif` — all UI, body, and numeric displays
- Income amounts: `#15803d` (green) · Expense amounts: `#b91c1c` (red)
- Category badges: use CSS class `.badge.badge-category` (never inline styles — dark-mode overrides live in `:root.dark .badge-category`). Label badges: `.badge.badge-label`. Null groups use plain muted text, no badge.
- All monetary displays use `font-family: var(--font-sans); font-weight: 600; font-variant-numeric: tabular-nums`

## Dark mode

- Theme stored in `localStorage` key `spendwich-theme` (`'light'` | `'dark'` | `'auto'`). Default is `'auto'` (follows `prefers-color-scheme`).
- Dark class is `.dark` on `<html>`. All dark token overrides live in `:root.dark { ... }` in `index.html`.
- Dark token palette: `--bg:#16151f` · `--surface:#1d1c2b` · `--surface-hover:#252436` · `--border:#2d2b42` · `--text:#eeedf5` · `--text-muted:#9896b8` · `--primary:#818cf8` · `--income:#4ade80` · `--expense:#fb7185`
- Dark mode income/expense colors are perceptually tuned — lifted to higher lightness for contrast on dark backgrounds. Elements using these as backgrounds (summary cards, toggle buttons) need dark text (`#1c1917`) overrides in `:root.dark`
- Summary cards: light mode uses pastel fills (`#e6f9ed` mint / `#fde8e8` rose) with semantic-colored text; dark mode uses jewel-tone fills (`#064e3b` deep emerald / `#4c0519` deep ruby) — the base label/value/sublabel rules use `var(--income)`/`var(--expense)` which resolve to the bright dark-mode values (`#4ade80`/`#fb7185`) automatically. No text color overrides needed in `:root.dark` for these cards. The Net card keeps a white/surface background with a colored `border-top` accent line — do not give it a pastel fill
- Anti-FOUC: a tiny inline `<script>` in `<head>` reads `localStorage` and adds `.dark` to `<html>` before any CSS/content renders. Do not remove or move it.
- Theme logic lives in `src/ui/theme.js` — `initTheme()`, `setTheme(pref)`, `getThemePref()`, `isDark()`, `onThemeChange(fn)`. Import from there; never duplicate.
- `initTheme()` is called in `router.js` before `initRemoteStorage()`.
- Reports (Chart.js): use `isDark()` at chart-build time to select light vs dark color arrays. Register `onThemeChange(() => refresh())` at module level so charts re-render on toggle.
- The remoteStorage widget uses regular DOM (not Shadow DOM). Dark mode overrides for `.rs-widget`, `.rs-sub-headline`, `.rs-sign-in-form input`, etc. live alongside other `:root.dark` rules in `index.html`. The green connect button (`#3fb34f`) is left as-is for CTA contrast.

## Dependencies

- Before adding any new library, present a short **pros / cons list** and wait for permission. Factors to weigh: bundle size, number of transitive dependencies, API stability, whether a native browser API covers the same ground.
- Always pin CDN resources to an exact version and include a matching SRI `integrity` attribute (`sha256-…`) with `crossorigin="anonymous"`. Fetch the hash from `https://data.jsdelivr.com/v1/package/npm/<pkg>@<version>/flat` when adding or upgrading.
- **remotestoragejs 1.2.3** — cross-device sync via the remoteStorage protocol (users connect their own provider — 5apps, self-hosted). Requires serving over HTTP/HTTPS; `file://` degrades gracefully (widget shows a plain note, app still works).
- **remotestorage-widget 1.8.0** — connect/disconnect UI for remoteStorage.
- **Chart.js 4.4.9** — charts throughout Reports.
- **chartjs-plugin-annotation 3.1.0** — UMD build auto-registers with Chart.js (no `Chart.register()` needed).
- **Flatpickr 4.6.13** — date picker (week starts Monday, keyboard-navigable, clear close UX).
  Always use `dateFormat: 'Y-m-d'` and `locale: { firstDayOfWeek: 1 }`. Use `type="text"` inputs (not `type="date"`).
  Inside a `<dialog>`, use `appendTo: dialog` instead of `static: true`. `static: true` keeps the calendar in the dialog DOM but always positions it below the input via `top: calc(100% + 2px)`, which gets clipped when the input is near the bottom. `appendTo: dialog` attaches the calendar to the `<dialog>` element (keeping it in the top layer) and uses page-absolute coordinates so it can position above or below the input as needed.
  The dialog has `overflow: auto`, so any Flatpickr input that sits in the right portion of the dialog (e.g. the last column of a multi-column grid) will have its calendar clipped on the right. Keep date inputs full-width or left-aligned so the calendar opens near the left edge of the dialog and stays within bounds.
  Outside a `<dialog>` (e.g. sidebar date range inputs), the calendar popup is appended to `document.body` and is NOT removed by `innerHTML = ''`. Track instances in a module-level array and destroy them explicitly at the top of `refresh()`: `_fpInstances.forEach(fp => fp.destroy()); _fpInstances = [];` — then push each new instance: `_fpInstances.push(flatpickr(el, {...}))`.
  Dark mode theming for Flatpickr requires `!important` on every override — Flatpickr's compound selectors (e.g. `.flatpickr-calendar.open`, `.flatpickr-day.selected`) have specificity 0,2,0+ which beats un-`!important` rules. The month display uses a native `<select class="flatpickr-monthDropdown-months">` — set `background: var(--surface) !important; color: var(--text) !important` on it to prevent the browser-default white background from showing through in dark mode. The `numInputWrapper span` (up/down arrows) default to `opacity: 0` but can bleed through — add `opacity: 0 !important` at rest and `opacity: 1 !important` on `numInputWrapper:hover span`.

## Architecture

- Vanilla JavaScript (ES modules)
- Single `index.html` entry point
- Pure logic lives in `src/` — no DOM dependencies, fully testable with Node
- DOM/UI code lives in `src/ui/` — not covered by tests
- Hash-based client-side routing (`#transactions`, `#categories`, `#labels`, `#reports`, `#settings`). No History API — keeps compatibility with `file://` serving
- The store is the single source of truth. UI components never mutate data directly; they call store functions and re-render
- Every view module exports `render(container)`, manages its own module-level `_container` reference, and has a local `refresh()` for re-renders without full remount
- Use `<script type="importmap">` in `index.html` to bust module cache when updating `modal.js` or view modules — map the path to `?vN` and increment `N` per change.
- `expandAndFilter` matches `labelPattern` against **label names** (not IDs). Always pass `labels: data.labels` in the options object when a labelPattern may be used
- `groupByLabel`: a transaction with N labels appears in all N groups. Totals can overlap and will not sum to the overall total — each label shows the full cost of everything tagged with it. The by-label view displays a visible note warning users about this overlap
- `src/ui/remotestorage.js` also manages localStorage persistence (`_LS_KEY = 'spendwich-data'`). `initRemoteStorage` loads from localStorage before the `file://` guard, enabling offline mode and bridging the OAuth redirect page reload (remoteStorage OAuth reloads the page; localStorage carries data across). Read the module for sync state machine details (`_syncing`, `_paused`, conflict resolution, etc.).
- `initRemoteStorage(navigate)` must be called before the first `navigate()` call in `router.js` — if `navigate()` runs first, `_rs` is still `null` when the Settings view renders and `attachWidget()` incorrectly shows the `file://` note even on localhost
- When `refresh()` destroys and recreates the DOM while a text input has focus, capture `selectionStart` before calling `refresh()` and restore focus + cursor to the new input after — see the `#filter-label` handler in `src/ui/views/transactions.js`
- Transaction modal: sign applied on save as `isExpense ? -Math.abs(absAmt) : Math.abs(absAmt)`. Expense/Income toggle uses `.btn-expense`/`.btn-income` — never `.btn-primary`.
- The top `<nav>` is `position: sticky` — never give it any `overflow` value other than `visible`. CSS spec forces both axes to `auto` when you set one, turning the sticky nav into a scroll container; on Firefox Android (APZ) and iOS Safari this intercepts touch events on content below the nav. Route links live inside `<div class="nav-links">` (which carries `overflow-x: auto` on mobile); the `<nav>` itself stays overflow-free
- All top-nav CSS must use `nav:not(.bottom-nav)` selectors — `position:sticky` and padding styles leak into the bottom nav otherwise.
- Never put `flex-wrap:wrap` on `.list-row` — action buttons detach from their row on narrow viewports.
- Reports summary cards: always display the Expenses value as `Math.abs(report.expenses)` — the card label and red colour already communicate expense polarity. NET keeps its sign (positive/negative is meaningful there)
- Reports breakdown: pie chart always mirrors the active tab — never pass the full unfiltered array. Reset `_pctOfIncome = false` when switching tabs.
- % of Income toggle: expense categories only.
- Category trend drill-down: clicking a category row → line chart of spending over time. Granularity adapts: daily (monthly mode), monthly (yearly/custom < 36 months), quarterly (≥ 36 months). Three insight cards: avg, comparison (MoM/YoY/prev period), total. Sidebar Period stays functional; View section is hidden. Back button resets `_trendCategoryId = null`.
- % of Income chart: spike detection runs on raw values before nulling future periods — nulling first distorts the mean/stddev baseline. Overspend (>100% with income): clamped to ceiling, tooltip "(Funded by Savings)". Zero-income periods: `null` chart data + faded annotation columns.
- Compare mode: savings rate is N/A when income is zero (not −100%).
- Never use `<input type="month">` for month pickers — renders as a plain text box in Firefox and Safari. Use two `<select>` elements (month name + year) in a flex row instead.
- Never use `justify-content:space-between` on a full-width flex row when child items are narrow. On a 960px container this creates hundreds of pixels of dead space. Use `justify-content:flex-start` with an explicit `gap` instead
- Nav active state (desktop): underline — `border-bottom: 2px solid var(--primary); background: transparent; border-radius: 0`. Nav background uses `var(--surface-low)` (cream tint). Mobile bottom-nav keeps its circular highlight unchanged. Always use `nav:not(.bottom-nav) a.active` selectors so styles don't bleed into the bottom nav.
- Page headers: every view wraps the `<h1>` and subtitle in `<div class="page-title-block">`. The `.page-subtitle` is a muted, small-text line immediately below the heading. Never omit the subtitle from a view without a deliberate reason.
- Transaction list card: wrap `div.list` in `div.tx-list-card` (white card, rounded, subtle shadow). Only append the card wrapper when `txs.length > 0` — skip it for empty states to avoid a ghost white card.
- Category display in transaction rows: use `.tx-row-cat-dot` (32px emoji circle, `background: var(--surface-low)`) instead of `.badge.badge-category`. Add a `.tx-row-cat-name` (small muted text, `display:block`) below the description. In grouped-by-category views, `.tx-row-cat-name` can be omitted since the group header already provides context.
- Labels list: no bento grid (labels have no emoji icons). Use the `.tx-list-card` card wrapper. Keep Edit/Delete as text `btn-sm` buttons.
- Label overflow in transaction rows: show max 3 label badges, then a `+N` badge (`.badge-more`) with a `title` tooltip listing all labels.
- Old `#categories` and `#labels` routes redirect to `#settings`. Nav has 3 items: Transactions, Reports, Settings.

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
- If imported `data.version > CURRENT_VERSION`, warn but do not block.
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
- Expected columns (header row required, order-independent): `date` (any format parseable by `new Date()`, normalized to YYYY-MM-DD using local timezone), `amount` (signed decimal), `currency`, `category`, `description`, `labels` (semicolon-separated, optional)
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
- Segmented button groups use `.seg-group` — never inline `display:flex;gap:0.25rem` for groups that form a single control.
- Transaction dates are displayed context-sensitively via `formatTxDate()`: month view shows `"Mar 15"` (no year, redundant in a single-month view); all other modes show `"Mar 15, 2026"`. Always use this function rather than rendering raw ISO strings in list rows
- Action buttons that contain only an SVG icon use `.btn-icon` (tighter padding) plus a `title` and `aria-label` attribute for accessibility
- Use `background-color` (not the `background` shorthand) when styling elements that also have a `background-image` (e.g. `<select>` elements styled with a custom chevron SVG via `background-image`). The `background` shorthand resets all sub-properties including `background-image`, wiping any custom arrow. Same applies to `transition: background-color` vs `transition: background`
- `change` event is more reliable than `click` for toggling visual state on checkboxes/radios: `change` fires after the input's checked state updates, `click` fires before it — reading `.checked` inside a `click` handler on the label/container gets the stale value

## Testing

- Use `node:test` (Node 20+) — zero install, ES-module-native, no config required
- Run with: `node --test tests/*.test.js`
- Only `src/` modules are tested. `src/ui/` is not covered by tests
- Tests must pass before any commit touching `src/`
- `store._reset()` exists solely for test isolation — call it in `beforeEach` in any test file that touches store state. Do not call it in application code

## Linting

- Run with: `npm run lint` (requires `npm install` once after cloning)
- `no-unused-vars` warns on dead code; prefix intentionally unused params with `_` to silence it
- `no-restricted-syntax` enforces the `innerHTML +=` ban documented above
- CDN globals (`Chart`, `flatpickr`, `RemoteStorage`, `Widget`) are declared in `eslint.config.js` — add new ones there if further CDN libraries are introduced

## Git

- Commit after each feature is working, not all at once at the end
- Partially implemented features that can be committed are also ok
- Use conventional commit messages (`feat:`, `fix:`, `chore:`, etc.)
- Work directly on `main`
