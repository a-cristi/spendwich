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
  JS: `https://cdn.jsdelivr.net/npm/remotestoragejs@1.2.3/release/remotestorage.js`
  `integrity="sha256-/4uJ0AZ6NHWmI2/jfMfdsj9Q6XBDl5nGIE1fdCycJLs=" crossorigin="anonymous"`
- **remotestorage-widget 1.8.0** — connect/disconnect UI for remoteStorage.
  JS: `https://cdn.jsdelivr.net/npm/remotestorage-widget@1.8.0/build/widget.js`
  `integrity="sha256-FebjQgYGNnXIT8ypAqLnVjMJaVugEEK+164mWGejRCk=" crossorigin="anonymous"`
  CSS: `https://cdn.jsdelivr.net/npm/remotestorage-widget@1.8.0/src/assets/styles.css`
  `integrity="sha256-SlXfOMpgWFj02iydOetsbjzTVcWGlK7NgCt/UMZDHSk=" crossorigin="anonymous"`
- **Chart.js 4.4.9** — `https://cdn.jsdelivr.net/npm/chart.js@4.4.9/dist/chart.umd.js`
  `integrity="sha256-3jFXc0VLYHa2OZC/oFzlFVo39xmSyH17tfmi6mmGl+8=" crossorigin="anonymous"`
- **chartjs-plugin-annotation 3.1.0** — official Chart.js plugin for box/line annotations. Used for faded background columns on zero-income periods in % of Income mode. UMD build auto-registers with Chart.js (no `Chart.register()` needed).
  `https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation@3.1.0/dist/chartjs-plugin-annotation.min.js`
  `integrity="sha256-/wN4amD2yTzKz+D7tsLjxnHXkwhWo2ifLzkxE9jWVew=" crossorigin="anonymous"`
- **Flatpickr 4.6.13** — date picker (week starts Monday, keyboard-navigable, clear close UX)
  JS: `https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/dist/flatpickr.min.js`
  `integrity="sha256-Huqxy3eUcaCwqqk92RwusapTfWlvAasF6p2rxV6FJaE=" crossorigin="anonymous"`
  CSS: `https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/dist/flatpickr.min.css`
  `integrity="sha256-GzSkJVLJbxDk36qko2cnawOGiqz/Y8GsQv/jMTUrx1Q=" crossorigin="anonymous"`
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
- Modal pattern: `openModal({ title, subtitle, deco, body, footer }) → { close, dialog, bodyEl }` using native `<dialog>` element — no library needed. `subtitle` adds a small-caps label above the serif title (`.modal-subtitle` + `.modal-title`). `deco` adds a 40px accent column on the right (rotated vertical text + gradient line, `.modal-deco`); both trigger class `modal-styled` on the dialog (580px wide, generous padding). Pass the entity name as the `deco` string (e.g. `'CATEGORY'`, `'LABEL'`). Modals without `subtitle`/`deco` keep the original 480px flat structure. Use `<script type="importmap">` in `index.html` to bust module cache when updating `modal.js` or view modules that use it — map `/src/ui/modal.js` → `/src/ui/modal.js?vN` and increment `vN` per change. Emoji picker uses `.icon-picker-grid` (CSS grid) + `.icon-btn` / `.icon-btn.selected` classes — never inline styles. Footer buttons are appended directly to the footer Node (no inner wrapper div) — `.modal-footer` flex layout handles alignment
- `expandAndFilter` matches `labelPattern` against **label names** (not IDs). Always pass `labels: data.labels` in the options object when a labelPattern may be used
- `groupByLabel`: a transaction with N labels appears in all N groups. Totals can overlap and will not sum to the overall total — each label shows the full cost of everything tagged with it. The by-label view displays a visible note warning users about this overlap
- Import/export split: CSV import and Export JSON live in the Transactions header (quick access, contextually a transaction operation). Full JSON import/export (backup/restore) also lives in Settings. The Transactions empty state shows prominent import CTAs for first-time users
- `src/ui/remotestorage.js` also manages **localStorage persistence** (`_LS_KEY = 'spendwich-data'`). `initRemoteStorage` loads from `localStorage` before the `file://` guard (so it works everywhere, including offline), then registers `_saveToLocalStorage` via `onDataChange`. `_saveToLocalStorage` is NOT gated on `_syncing` — localStorage must stay in sync even when loading remote data. This enables offline mode and survives OAuth redirect page reloads.
- Cross-device sync integration pattern: `store.onDataChange(fn)` fires after every mutation; the remoteStorage module subscribes and calls `storeFile()` immediately (no debounce — remoteStorage.js handles network batching internally). `_syncing` flag prevents `loadData() → _notifyChange() → saveToRemote()` loop. `_paused` flag brackets the async currency-migration batch (`pauseAutosave()` / `resumeAutosave()`). `_hasConnected` and `_readyConnected` deduplicate the `onReady`+`onConnected` double-fire on page-load auto-reconnect (see earlier commit notes). First-connect conflict detection uses `_handleFirstSync(raw)` (shared by `onReady`/`onConnected`), which compares localStorage vs remote via `isSameData()` from `src/sync.js`. Four branches: `raw && localHasData && !same` → conflict dialog; `raw && !same` → `loadData+refreshFn`; `!raw && localHasData` → push to remote; `raw && same` → nothing (data already loaded from localStorage, `onSyncDone` handles widget). `_rawHasData` tests transactions, categories, and labels. `isSameData` normalises both sides via `normalizeForCompare` (sorted object keys + id-sorted arrays) before comparing — robust against manually edited JSON. remoteStorage uses redirect-based OAuth so the page reloads on first connect — localStorage bridges the reload and makes conflict detection work. Before calling the refresh callback on a remote change, check `document.querySelector('dialog[open]')` and skip if a modal is open — data is already updated in memory and the view will reflect it on next navigation. JSON import while connected shows a confirmation modal via `confirmLoadIfConnected(raw, onConfirm)` before overwriting remote data. CSV import (`importBulk`) appends, so no confirmation needed.
- `initRemoteStorage(navigate)` must be called before the first `navigate()` call in `router.js` — if `navigate()` runs first, `_rs` is still `null` when the Settings view renders and `attachWidget()` incorrectly shows the `file://` note even on localhost
- When `refresh()` destroys and recreates the DOM while a text input has focus, capture `selectionStart` before calling `refresh()` and restore focus + cursor to the new input after — see the `#filter-label` handler in `src/ui/views/transactions.js`
- Transaction modal: Expense/Income segmented toggle defaults to Expense for new transactions; the amount field always shows an absolute value. Typing a negative number auto-flips the toggle and strips the sign. On save, the sign is applied: `isExpense ? -Math.abs(absAmt) : Math.abs(absAmt)`. The active Expense button uses `.btn-expense` (red) and the active Income button uses `.btn-income` (green) — never use `.btn-primary` for this toggle
- `openTxModal` accepts an optional `saveOverride(fields)` callback. When provided it replaces the default `addTransaction`/`updateTransaction` call while keeping toast/close/refresh unchanged. Used by the recurring scope dialog to route saves to `overrideOccurrence` or `splitSeries`
- Category icon: a single emoji stored as `cat.icon` (default `'🏷️'`). Shown in category list rows, transaction badges, group headers, modal category selector, and reports breakdown. The emoji picker in the category modal is a button grid of `EMOJI_SET` (~50 curated finance emoji); clicking highlights the selected button via border color and updates `selectedIcon`
- The top `<nav>` is `position: sticky` — never give it any `overflow` value other than `visible`. CSS spec forces both axes to `auto` when you set one, turning the sticky nav into a scroll container; on Firefox Android (APZ) and iOS Safari this intercepts touch events on content below the nav. Route links live inside `<div class="nav-links">` (which carries `overflow-x: auto` on mobile); the `<nav>` itself stays overflow-free
- Two `<nav>` elements coexist: top nav (`nav:not(.bottom-nav)`) and bottom nav (`nav.bottom-nav`). All top-nav CSS uses `nav:not(.bottom-nav)` selectors to prevent `position:sticky; top:0` and link padding/background from leaking into the bottom nav. The bottom nav is `display:none` on desktop and `position:fixed; bottom:0` on mobile via `@media (max-width:600px)`. It uses scroll-reveal: starts at `transform:translateY(100%)` and gains `.nav-visible` (translate to 0) on the first `scroll` event or after a 400ms fallback timeout (for short pages that cannot scroll). `.bottom-nav-item` uses `flex:1; flex-direction:column; align-items:center` for icon+label tabs.
- Transaction list row layout: the data columns (date + description/badges + amount) are wrapped in a `flex:1;min-width:0` inner div; the action buttons div gets `flex-shrink:0` so it never wraps to a second line on narrow viewports. Never put `flex-wrap:wrap` directly on `.list-row` — it allows the action buttons to detach from their row
- Reports summary cards: always display the Expenses value as `Math.abs(report.expenses)` — the card label and red colour already communicate expense polarity. NET keeps its sign (positive/negative is meaningful there)
- Reports sidebar has three sections: **Report** (Summary | Compare — `.seg-group`, always visible on mobile/desktop), **Period** (Monthly · Yearly · Custom range · All time — shown for Summary only, uses `view-mode-nav` desktop / `view-mode-select` mobile), **View** (By category/label + Expenses/Income tabs — shown for Summary only). `_reportType = 'summary' | 'compare'`.
- Reports breakdown tab state: `_breakdownTab = 'expenses' | 'income'` (module-level). Filtering: expenses = `total < 0`, income = `total > 0`. Items with `total === 0` excluded from both tabs. The pie chart always mirrors the active tab — never passes the full unfiltered `byCategory`/`byLabel` array. Reset `_pctOfIncome = false` when switching tabs.
- % of income toggle: `_pctOfIncome` boolean (module-level). Only shown when `_breakdownTab === 'expenses'`. `renderBreakdownTable` accepts `incomeTotal = 0` as last param; when `incomeTotal > 0 && _pctOfIncome`, renders a `pct%` column: `Math.round(Math.abs(b.total) / incomeTotal * 100)`.
- `cashFlowReport(data, from, to)` in `src/reports.js`: iterates month-by-month from `from` to `to` (YYYY-MM-DD strings), calls `monthlyReport` for each, accumulates `cumulative` net. Returns `[{ month: 'YYYY-MM', income, expenses, net, cumulative }]`. Empty array when `from > to`.
- Cash flow chart: `renderCashFlowChart(cfData, labels, currency, container)` in `src/ui/views/reports.js`. Chart.js mixed chart — two `'bar'` datasets (income/expenses, semi-transparent fill) + one `'line'` dataset (cumulative net, indigo, `tension: 0.3`, `order: 1`). Appears in Summary mode: Yearly always (derived from `report.months`, no extra `cashFlowReport()` call); Custom range when start/end are in different months; All time when transactions exist. Monthly: never shown (single month has no trend).
- Category trend drill-down: clicking a category row in the breakdown table sets `_trendCategoryId` and renders `renderCategoryTrend()` — a line chart showing spending evolution over time. Granularity adapts to period: daily (monthly mode), monthly (yearly/custom < 36 months), quarterly (custom/all time ≥ 36 months). `categoryTrendReport(data, categoryId, from, to, granularity)` in `src/reports.js` returns `[{ period, total, count }]` with gap-filling. Insight cards: avg spend (neutral/purple), dynamic comparison (MoM/YoY/prev period, neutral/purple), total (contextual mint/rose tint based on sum sign). Sidebar Period stays functional during trend; View section is hidden. Back button resets `_trendCategoryId = null`.
- Category trend — full-horizon chart: the chart always covers the full selected period (e.g. all 31 days of March). Future periods are `null`-padded so the line ends cleanly at today instead of continuing flat at zero. `isFuturePeriod(p)` compares period string to today: daily → `p > todayStr`; monthly → `p > todayMonthStr`; quarterly → `p > todayQuarterStr`. Spike detection runs on the raw `Math.abs` values **before** nulling future periods — nulling first would distort the mean/stddev baseline.
- Category trend — elapsed-period avg: `elapsedCount = Math.max(trendData.filter(b => !isFuturePeriod(b.period)).length, 1)`. Avg card uses `total / elapsedCount` (not `total / trendData.length`) so a partial month reflects actual pace. Sublabel reads "Based on N days/months/quarters".
- Category trend — period header: daily granularity uses `monthsFull()` (returns full month names array) so the header reads "March 2026" not "Mar 2026".
- Category trend — honest comparison (Golden Rule): **current period in progress** → compare avg/elapsed vs avg/elapsed of prev period's same window (`prevElapsed = min(elapsedCount, prevTrend.length)`); subtitle "avg/day · same window". When current elapsed > prev period length (e.g. March 29–31 vs February), use full prev period; subtitle "avg/day · full prev. period". **Past period** → full total vs full total (no slicing). `computeDynamicComparison(data, categoryId, from, to, granularity, currentTotal, elapsedCount)` implements this; `computePctComparison` applies the same elapsed-slice logic for `% Inc` mode.
- Spike detection: `detectSpikes(values, sensitivity = 2.0)` in `src/reports.js` — Z-score/standard deviation method, returns indices where value > mean + sensitivity × stdDev. Requires ≥ 3 values; returns `[]` when stdDev is 0. Run on `Math.abs(total)` for category-agnostic detection. Chart integration: per-point `pointRadius` (7px spike vs 4px normal) and `pointBackgroundColor` arrays — rose (`--expense`) for negative-total spikes, mint (`--income`) for positive. Tooltip appends " (Spike)".
- % of Income mode: `_trendPctMode` toggle (Value | % of Income) on expense category trends only. `incomeTrendReport(data, from, to, granularity)` in `src/reports.js` returns `[{ period, income }]` — daily granularity spreads total month income to every day (daily income is meaningless). Y-axis ceiling uses smart steps `[2,5,10,15,20,30,50,75,100,150,200]` with 15% buffer; only bumps to 100%+ when real overspend exists. Zero-income periods: entire period zero → early return with unavailable message + toggle; partial zero-income → `null` chart data (line breaks naturally), faded background columns via `chartjs-plugin-annotation` (`rgba(0,0,0,0.04)` light / `rgba(255,255,255,0.03)` dark), hollow ghost circle marker at `pctCeiling * 0.06` height (visible above axis), excluded from spike detection and avg % calculation. Real overspend (>100% with income) → clamped to ceiling, rose spike dot, tooltip "(Funded by Savings)". Overspend (`hasOverspend`) triggers: (1) dashed rose annotation line at y=100 with "= income" label on the right (`incomeLimit` key in annotation object); (2) `afterBuildTicks` on `yScale` forces ticks at exactly 0%, 100%, and ceiling% so auto-tick placement never skips the income boundary. Insight cards: avg % of income (excludes zero-income periods), comparison in percentage points (pp), total stays as currency. `computePctComparison` compares avg % between current and previous period.
- Compare mode: `_compareMode = 'monthly' | 'yearly'`. Monthly/Yearly seg-group toggle in sidebar. Monthly uses `buildMonthPicker(label, value, onChange)`, yearly uses `buildYearPicker(label, value, onChange)` (single year `<select>`). When yearly, `_compareA`/`_compareB` are `{ year }` (no `month` property); label generation checks `specA.month` to decide format. Defaults: monthly = prev month vs current month; yearly = prev year vs current year. `diffBreakdown(itemsA, itemsB, nameKey, incomeA, incomeB)` computes share shift — filters to expense items only, merges both sets by name, sorts by abs share shift. Allocation cards show per-category spend, % of income, and share shift badge.
- Never use `<input type="month">` for month pickers — renders as a plain text box in Firefox and Safari. Use two `<select>` elements (month name + year) in a flex row instead.
- Never use `justify-content:space-between` on a full-width flex row when child items are narrow. On a 960px container this creates hundreds of pixels of dead space. Use `justify-content:flex-start` with an explicit `gap` instead
- Nav active state (desktop): underline — `border-bottom: 2px solid var(--primary); background: transparent; border-radius: 0`. Nav background uses `var(--surface-low)` (cream tint). Mobile bottom-nav keeps its circular highlight unchanged. Always use `nav:not(.bottom-nav) a.active` selectors so styles don't bleed into the bottom nav.
- Page headers: every view wraps the `<h1>` and subtitle in `<div class="page-title-block">`. The `.page-subtitle` is a muted, small-text line immediately below the heading. Never omit the subtitle from a view without a deliberate reason.
- Transaction list card: wrap `div.list` in `div.tx-list-card` (white card, rounded, subtle shadow). Only append the card wrapper when `txs.length > 0` — skip it for empty states to avoid a ghost white card.
- Category display in transaction rows: use `.tx-row-cat-dot` (32px emoji circle, `background: var(--surface-low)`) instead of `.badge.badge-category`. Add a `.tx-row-cat-name` (small muted text, `display:block`) below the description. In grouped-by-category views, `.tx-row-cat-name` can be omitted since the group header already provides context.
- Labels list: no bento grid (labels have no emoji icons). Use the `.tx-list-card` card wrapper. Keep Edit/Delete as text `btn-sm` buttons.
- Category filter (Transactions sidebar): searchable emoji card grid. Trigger button (`.cat-trigger`) toggles a panel (`.cat-panel`) containing a search input (`.cat-search`) and a 3-column CSS grid (`.cat-grid`) of emoji cards (`.cat-card`). Module-level `_catPanelOpen` and `_catSearch` state. Panel closes on card click, clear button, or click-outside. Search filters cards by name (case-insensitive substring). `max-height: 280px` desktop / `320px` mobile with `overflow-y: auto`.
- Label overflow in transaction rows: show max 3 label badges, then a `+N` badge (`.badge-more`) with a `title` tooltip listing all labels.
- Settings page uses a two-column `.manage-layout` grid (`1fr 280px`, gap `1.5rem`, `align-items: start`). Left column (`.manage-main`): categories list card + labels list card. Right column (`.manage-aside`, `position: sticky; top: 1.5rem`): Preferences, Sync, Data sections. Mobile (≤900px): single column, static aside. Both categories and labels render as compact `.tx-list-card` + `.list` + `.list-row` rows (emoji span `font-size:1.1rem; width:2rem` + name + Edit/Delete buttons). A `makeSection(title)` helper builds `.settings-section` cards in the aside. Old `#categories` and `#labels` routes redirect to `#settings` in the router. Nav has 3 items: Transactions, Reports, Settings.

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
- Category deletion with transactions: `confirmDeleteCategory` shows a richer modal with transaction count, a searchable category picker (`.tx-cat-picker` pattern) for reassignment, and label chips (`.tx-label-chip` pattern) for tagging. `reassignCategory(fromId, toCategoryId, addLabelIds)` in `store.js` handles the batch update — when `toCategoryId` is null, only labels are added (categoryId preserved as orphaned)
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
- Segmented button toggle groups use the `.seg-group` CSS class (sets `gap:0`, removes intermediate border-radii, collapses inner border). Never use inline `display:flex;gap:0.25rem` for button groups that form a single control
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

## Git

- Commit after each feature is working, not all at once at the end
- Partially implemented features that can be committed are also ok
- Use conventional commit messages (`feat:`, `fix:`, `chore:`, etc.)
- Work directly on `main`
