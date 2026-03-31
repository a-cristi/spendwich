import { getData, addTransaction, updateTransaction, deleteTransaction, importBulk, loadData, exportData, deleteOccurrenceAt, truncateSeries, overrideOccurrence, splitSeries } from '../../store.js';
import { confirmLoadIfConnected } from '../remotestorage.js';
import { expandAndFilter, groupByCategory, groupByLabel } from '../../filters.js';
import { fetchRate, convertAmount } from '../../currency.js';
import { importTransactions } from '../../csv.js';
import { openModal } from '../modal.js';
import { toast } from '../toast.js';
import { escHtml, formatAmount } from '../utils.js';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatTxDate(dateStr) {
  const y = +dateStr.slice(0, 4);
  const m = MONTH_NAMES[+dateStr.slice(5, 7) - 1];
  const d = +dateStr.slice(8, 10);
  return _dateMode === 'month' ? `${m} ${d}` : `${m} ${d}, ${y}`;
}

const ICON_EDIT = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const ICON_DEL  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;

let _container = null;
let _fpInstances = [];
let _viewMode = 'flat'; // flat | by-category | by-label
let _filterCategoryId = null;
let _filterLabel = '';
let _dateMode = 'month'; // month | year | custom | all
let _year = new Date().getFullYear();
let _month = new Date().getMonth() + 1;
let _customStart = '';
let _customEnd = '';
let _page = 0;
let _filtersExpanded = false;
let _catPanelOpen = false;
let _catSearch = '';
const PAGE_SIZE = 100;

export function render(container) {
  _container = container;
  refresh();
}

function getDateRange() {
  if (_dateMode === 'month') {
    const lastDay = new Date(Date.UTC(_year, _month, 0)).getUTCDate();
    const m = String(_month).padStart(2, '0');
    const d = String(lastDay).padStart(2, '0');
    return { start: `${_year}-${m}-01`, end: `${_year}-${m}-${d}` };
  }
  if (_dateMode === 'year') {
    return { start: `${_year}-01-01`, end: `${_year}-12-31` };
  }
  if (_dateMode === 'custom') {
    return { start: _customStart || null, end: _customEnd || null };
  }
  return { start: null, end: null };
}

function _closeTxMenus(e) {
  if (e && e.target.closest('.tx-menu-trigger')) return;
  document.querySelectorAll('.tx-action-menu.active').forEach(m => m.classList.remove('active'));
}

function refresh() {
  document.removeEventListener('click', _closeTxMenus);
  _fpInstances.forEach(fp => fp.destroy());
  _fpInstances = [];
  const data = getData();

  _container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'page-header';
  header.innerHTML = `
    <div class="page-title-block">
      <h1>Transactions</h1>
      <p class="page-subtitle">Your financial timeline</p>
    </div>
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
      <button class="btn btn-sm btn-secondary" id="import-csv-btn">Import CSV</button>
      <button class="btn btn-sm btn-secondary" id="export-btn">Export JSON</button>
      <button class="btn btn-primary" id="add-tx-btn">+ Add</button>
    </div>
  `;
  _container.appendChild(header);

  const layout = document.createElement('div');
  layout.className = 'view-layout';
  _container.appendChild(layout);

  const sidebar = buildSidebar(data);

  const main = document.createElement('div');
  main.className = 'view-main';

  const range = getDateRange();
  const windowEnd = range.end
    ? new Date(range.end + 'T23:59:59Z')
    : (() => { const d = new Date(); d.setUTCHours(23, 59, 59, 999); return d; })();

  const filterOpts = { windowEnd, labels: data.labels };
  if (_filterCategoryId) filterOpts.categoryId = _filterCategoryId;
  if (_filterLabel.trim()) filterOpts.labelPattern = _filterLabel.trim();

  const txs = expandAndFilter(data.transactions, filterOpts)
    .filter(tx => {
      if (range.start && tx.date < range.start) return false;
      if (range.end   && tx.date > range.end)   return false;
      return true;
    })
    .reverse();

  const catMap = new Map(data.categories.map(c => [c.id, c]));
  const lblMap = new Map(data.labels.map(l => [l.id, l]));
  const { defaultCurrency } = data.settings;

  let summaryCards = null;
  if (txs.length > 0) {
    const income   = txs.reduce((s, t) => t.amountInDefault > 0 ? s + t.amountInDefault : s, 0);
    const expenses = txs.reduce((s, t) => t.amountInDefault < 0 ? s + t.amountInDefault : s, 0);
    const net = income + expenses;
    const netCardCls = net >= 0 ? 'summary-card-net-pos' : 'summary-card-net-neg';
    const netValueCls = net === 0 ? '' : (net > 0 ? 'amount-income' : 'amount-expense');
    const netSign = net >= 0 ? '+' : '';

    summaryCards = document.createElement('div');
    summaryCards.className = 'summary-cards';
    summaryCards.innerHTML = `
      <div class="summary-card summary-card-income">
        <div class="label">Income</div>
        <div class="value">+${escHtml(formatAmount(income, defaultCurrency))}</div>
        <div class="sublabel">this period</div>
      </div>
      <div class="summary-card summary-card-expense">
        <div class="label">Expenses</div>
        <div class="value">${escHtml(formatAmount(Math.abs(expenses), defaultCurrency))}</div>
        <div class="sublabel">this period</div>
      </div>
      <div class="summary-card ${netCardCls}">
        <div class="label">Net</div>
        <div class="value ${netValueCls}">${netSign}${escHtml(formatAmount(net, defaultCurrency))}</div>
        <div class="sublabel">${net >= 0 ? 'positive balance' : 'negative balance'}</div>
      </div>
    `;
  }

  const isMobile = window.matchMedia('(max-width: 600px)').matches;
  if (isMobile) {
    const stickyHeader = document.createElement('div');
    stickyHeader.className = 'tx-sticky-header';
    stickyHeader.appendChild(sidebar);
    if (summaryCards) stickyHeader.appendChild(summaryCards);
    layout.appendChild(stickyHeader);
  } else {
    layout.appendChild(sidebar);
    if (summaryCards) main.appendChild(summaryCards);
  }

  layout.appendChild(main);

  const list = document.createElement('div');
  list.className = 'list';

  if (txs.length === 0 && data.transactions.length === 0) {
    const emptyCard = document.createElement('div');
    emptyCard.className = 'card';
    emptyCard.style.cssText = 'padding:3rem 2rem;text-align:center;margin-bottom:1.5rem';
    emptyCard.innerHTML = `
      <div style="font-size:2.5rem;margin-bottom:1rem">🥪</div>
      <p style="font-family:var(--font-serif);font-size:1.1rem;font-weight:400;margin-bottom:0.5rem">No transactions yet</p>
      <p style="color:var(--text-muted);font-size:0.875rem;margin-bottom:1.75rem;max-width:320px;margin-left:auto;margin-right:auto">Import a CSV file to get started, or load a full JSON backup to restore your data.</p>
      <div style="display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap">
        <label class="btn btn-primary" style="cursor:pointer">
          Import CSV
          <input type="file" id="empty-csv-input" accept=".csv,text/csv" style="display:none">
        </label>
        <label class="btn btn-secondary" style="cursor:pointer">
          Load JSON backup
          <input type="file" id="empty-json-input" accept=".json" style="display:none">
        </label>
      </div>
    `;
    emptyCard.querySelector('#empty-csv-input').addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) handleCsvFile(file, getData());
      e.target.value = '';
    });
    emptyCard.querySelector('#empty-json-input').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = evt => {
        const raw = evt.target.result;
        confirmLoadIfConnected(raw, () => {
          try {
            loadData(raw);
            toast('Data loaded successfully', 'success');
            refresh();
          } catch (err) {
            toast(`Load failed: ${err.message}`, 'error');
          }
        });
      };
      reader.readAsText(file);
      e.target.value = '';
    });
    main.appendChild(emptyCard);
  } else if (txs.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'list-empty';
    empty.textContent = 'No transactions in this period.';
    main.appendChild(empty);
  } else if (_viewMode === 'flat') {
    const pageSlice = txs.slice(_page * PAGE_SIZE, (_page + 1) * PAGE_SIZE);
    renderFlatList(list, pageSlice, catMap, lblMap, defaultCurrency, data);
    if (txs.length > PAGE_SIZE) list.appendChild(buildPaginationBar(txs.length));
  } else if (_viewMode === 'by-category') {
    renderGrouped(list, groupByCategory(txs, data.categories), 'category', catMap, lblMap, defaultCurrency, data);
  } else {
    renderGrouped(list, groupByLabel(txs, data.labels), 'label', catMap, lblMap, defaultCurrency, data);
  }

  if (txs.length > 0) {
    if (_viewMode === 'by-label') {
      const note = document.createElement('p');
      note.style.cssText = 'font-size:0.8rem;color:var(--text-muted);margin-bottom:0.5rem';
      note.textContent = 'Transactions with multiple labels appear in each group — totals may overlap.';
      main.appendChild(note);
    }
    const listCard = document.createElement('div');
    listCard.className = 'tx-list-card';
    listCard.appendChild(list);
    main.appendChild(listCard);
  }

  header.querySelector('#add-tx-btn').addEventListener('click', () => openTxModal(null, data));
  header.querySelector('#import-csv-btn').addEventListener('click', () => openCsvImport(getData()));
  header.querySelector('#export-btn').addEventListener('click', () => {
    const json = exportData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spendwich-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // Populate nav overflow menu on mobile
  const overflowMenu = document.querySelector('.nav-overflow-menu');
  const overflowTrigger = document.querySelector('.nav-overflow-trigger');
  if (overflowMenu) {
    overflowMenu.innerHTML = '';
    if (overflowTrigger) overflowTrigger.style.display = '';
    const importItem = document.createElement('button');
    importItem.className = 'nav-overflow-item';
    importItem.textContent = 'Import CSV';
    importItem.addEventListener('click', () => {
      overflowMenu.classList.remove('active');
      openCsvImport(getData());
    });
    const exportItem = document.createElement('button');
    exportItem.className = 'nav-overflow-item';
    exportItem.textContent = 'Export JSON';
    exportItem.addEventListener('click', () => {
      overflowMenu.classList.remove('active');
      const json = exportData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `spendwich-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
    overflowMenu.appendChild(importItem);
    overflowMenu.appendChild(exportItem);
  }

  // FAB for mobile "+ Add"
  const fab = document.createElement('button');
  fab.className = 'tx-fab';
  fab.textContent = '+';
  fab.setAttribute('aria-label', 'Add transaction');
  fab.addEventListener('click', () => openTxModal(null, data));
  _container.appendChild(fab);

  // Close any open three-dot menus on outside click
  document.addEventListener('click', _closeTxMenus);
}

function buildSidebar(data) {
  const sidebar = document.createElement('div');
  sidebar.className = 'view-sidebar';

  // --- Section 1: Period ---
  const periodSect = document.createElement('div');
  periodSect.className = 'view-sidebar-section';

  const periodLabel = document.createElement('span');
  periodLabel.className = 'view-sidebar-label';
  periodLabel.textContent = 'Period';
  periodSect.appendChild(periodLabel);

  // Desktop: vertical nav buttons (hidden on mobile)
  const modeNav = document.createElement('div');
  modeNav.className = 'view-mode-nav';
  const dateModes = [['month','Month'],['year','Year'],['custom','Custom'],['all','All time']];
  for (const [dm, label] of dateModes) {
    const btn = document.createElement('button');
    btn.className = 'view-mode-btn' + (_dateMode === dm ? ' active' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => { _dateMode = dm; _page = 0; refresh(); });
    modeNav.appendChild(btn);
  }
  periodSect.appendChild(modeNav);

  // Date row: on mobile becomes flex row [mode select] [period nav]
  const dateRow = document.createElement('div');
  dateRow.className = 'view-date-row';

  // Mobile: select for date mode (hidden on desktop via CSS)
  const modeSelect = document.createElement('select');
  modeSelect.className = 'view-mode-select';
  for (const [dm, label] of dateModes) {
    const opt = document.createElement('option');
    opt.value = dm;
    opt.textContent = label;
    opt.selected = _dateMode === dm;
    modeSelect.appendChild(opt);
  }
  modeSelect.addEventListener('change', e => { _dateMode = e.target.value; _page = 0; refresh(); });
  dateRow.appendChild(modeSelect);

  // Period nav (same for desktop and mobile, rendered when mode !== 'all')
  if (_dateMode !== 'all') {
    const periodNav = document.createElement('div');

    if (_dateMode === 'month') {
      const MONTHS = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];
      const monthRow = document.createElement('div');
      monthRow.className = 'month-year-row';
      monthRow.style.cssText = 'display:flex;gap:0.5rem';
      const monthSel = document.createElement('select');
      monthSel.style.flex = '1';
      for (let i = 1; i <= 12; i++) {
        const opt = document.createElement('option');
        opt.value = i; opt.textContent = MONTHS[i - 1]; opt.selected = i === _month;
        monthSel.appendChild(opt);
      }
      const yearSel = document.createElement('select');
      yearSel.style.flex = '1';
      for (const y of yearRange()) {
        const opt = document.createElement('option');
        opt.value = y; opt.textContent = y; opt.selected = y === _year;
        yearSel.appendChild(opt);
      }
      function onMonthYearChange() { _month = +monthSel.value; _year = +yearSel.value; _page = 0; refresh(); }
      monthSel.addEventListener('change', onMonthYearChange);
      yearSel.addEventListener('change', onMonthYearChange);
      monthRow.appendChild(monthSel);
      monthRow.appendChild(yearSel);
      periodNav.appendChild(monthRow);
    } else if (_dateMode === 'year') {
      periodNav.style.cssText = 'display:flex;align-items:center;gap:0.5rem';
      periodNav.innerHTML = `
        <button class="btn btn-sm btn-secondary" id="prev-period">‹</button>
        <select id="sel-year" style="flex:1">
          ${yearRange().map(y => `<option ${_year === y ? 'selected' : ''}>${y}</option>`).join('')}
        </select>
        <button class="btn btn-sm btn-secondary" id="next-period">›</button>
      `;
      periodNav.querySelector('#sel-year').addEventListener('change',  e => { _year = +e.target.value; _page = 0; refresh(); });
      periodNav.querySelector('#prev-period').addEventListener('click', () => { _year--; _page = 0; refresh(); });
      periodNav.querySelector('#next-period').addEventListener('click', () => { _year++; _page = 0; refresh(); });
    } else if (_dateMode === 'custom') {
      periodNav.className = 'custom-range-row';
      periodNav.style.cssText = 'display:flex;flex-direction:column;gap:0.5rem;width:100%';
      periodNav.innerHTML = `
        <label style="font-size:0.875rem">From
          <input type="text" id="range-start" placeholder="Start date" autocomplete="off" readonly inputmode="none" style="margin-top:0.2rem">
        </label>
        <label style="font-size:0.875rem">To
          <input type="text" id="range-end" placeholder="End date" autocomplete="off" readonly inputmode="none" style="margin-top:0.2rem">
        </label>
      `;
      const startEl = periodNav.querySelector('#range-start');
      const endEl = periodNav.querySelector('#range-end');
      _fpInstances.push(flatpickr(startEl, {
        dateFormat: 'Y-m-d', locale: { firstDayOfWeek: 1 }, defaultDate: _customStart || null,
        onChange: ([d]) => {
          if (!d) return;
          _customStart = d.toISOString().slice(0, 10);
          if (endEl.value) { _page = 0; refresh(); }
        },
      }));
      _fpInstances.push(flatpickr(endEl, {
        dateFormat: 'Y-m-d', locale: { firstDayOfWeek: 1 }, defaultDate: _customEnd || null,
        onChange: ([d]) => {
          if (!d) return;
          _customEnd = d.toISOString().slice(0, 10);
          if (startEl.value) { _page = 0; refresh(); }
        },
      }));
    }

    dateRow.appendChild(periodNav);
  }

  periodSect.appendChild(dateRow);
  sidebar.appendChild(periodSect);

  // --- Mobile filter toggle button (hidden on desktop via CSS) ---
  const hasActiveFilter = !!_filterCategoryId || _filterLabel.trim() !== '' || _viewMode !== 'flat';
  const filterToggle = document.createElement('button');
  filterToggle.className = 'btn btn-sm btn-secondary tx-filter-toggle' + (_filtersExpanded ? ' expanded' : '');
  filterToggle.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg> Filters${hasActiveFilter ? '<span class="tx-filter-dot"></span>' : ''}`;
  filterToggle.addEventListener('click', () => {
    _filtersExpanded = !_filtersExpanded;
    filterToggle.classList.toggle('expanded', _filtersExpanded);
    filterArea.classList.toggle('expanded', _filtersExpanded);
  });
  sidebar.appendChild(filterToggle);

  // --- Section 2: Filters + View ---
  const filterSect = document.createElement('div');
  filterSect.className = 'view-sidebar-section';

  const filterLabel = document.createElement('span');
  filterLabel.className = 'view-sidebar-label';
  filterLabel.textContent = 'Filters';
  filterSect.appendChild(filterLabel);

  const filterArea = document.createElement('div');
  filterArea.className = 'tx-sidebar-filter-area' + (_filtersExpanded ? ' expanded' : '');
  const selectedCat = _filterCategoryId ? data.categories.find(c => c.id === _filterCategoryId) : null;
  const triggerContent = selectedCat
    ? `<span class="cat-trigger-emoji">${selectedCat.icon ?? '🏷️'}</span><span class="cat-trigger-name">${escHtml(selectedCat.name)}</span><span class="cat-trigger-clear" title="Clear filter">✕</span>`
    : `<span class="cat-trigger-emoji" style="opacity:0.5">🏷️</span><span class="cat-trigger-name">All categories</span><span class="cat-trigger-chevron">▼</span>`;

  const catCards = data.categories
    .filter(c => !_catSearch || c.name.toLowerCase().includes(_catSearch.toLowerCase()))
    .map(c => `<div class="cat-card${_filterCategoryId === c.id ? ' selected' : ''}" data-cat-id="${escHtml(c.id)}"><span class="cat-card-emoji">${c.icon ?? '🏷️'}</span><span class="cat-card-name">${escHtml(c.name)}</span></div>`)
    .join('');

  const allVisible = !_catSearch || 'all'.includes(_catSearch.toLowerCase());

  filterArea.innerHTML = `
    <div class="tx-sidebar-filter-cat">
      <button class="cat-trigger" type="button">${triggerContent}</button>
      ${_catPanelOpen ? `<div class="cat-panel">
        <div class="cat-search-wrap">
          <svg class="cat-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input class="cat-search" type="text" placeholder="Search…" value="${escHtml(_catSearch)}">
        </div>
        <div class="cat-grid">
          ${allVisible ? `<div class="cat-card cat-card-all${!_filterCategoryId ? ' selected' : ''}" data-cat-id=""><span class="cat-card-emoji cat-card-all-icon">✱</span><span class="cat-card-name">All</span></div>` : ''}
          ${catCards}
        </div>
      </div>` : ''}
    </div>
    <div class="label-search-wrapper tx-sidebar-filter-label">
      <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input type="text" id="filter-label" value="${escHtml(_filterLabel)}" placeholder="Filter by label…">
    </div>
    <div class="seg-group tx-sidebar-filter-toggle">
      <button class="btn btn-sm ${_viewMode === 'flat'        ? 'btn-primary' : 'btn-secondary'}" data-mode="flat">All</button>
      <button class="btn btn-sm ${_viewMode === 'by-category' ? 'btn-primary' : 'btn-secondary'}" data-mode="by-category">Category</button>
      <button class="btn btn-sm ${_viewMode === 'by-label'    ? 'btn-primary' : 'btn-secondary'}" data-mode="by-label">Label</button>
    </div>
  `;
  filterSect.appendChild(filterArea);

  // Category trigger button — toggle panel
  const catTriggerBtn = filterArea.querySelector('.cat-trigger');
  catTriggerBtn.addEventListener('click', (e) => {
    if (e.target.closest('.cat-trigger-clear')) {
      _filterCategoryId = null;
      _catPanelOpen = false;
      _catSearch = '';
      _page = 0;
      refresh();
      return;
    }
    _catPanelOpen = !_catPanelOpen;
    _catSearch = '';
    refresh();
  });

  // Category card clicks
  filterArea.querySelectorAll('.cat-card').forEach(card => {
    card.addEventListener('click', () => {
      _filterCategoryId = card.dataset.catId || null;
      _catPanelOpen = false;
      _catSearch = '';
      _page = 0;
      refresh();
    });
  });

  // Category search input
  const catSearchInput = filterArea.querySelector('.cat-search');
  if (catSearchInput) {
    catSearchInput.addEventListener('input', (e) => {
      const pos = e.target.selectionStart;
      _catSearch = e.target.value;
      refresh();
      const newInput = _container.querySelector('.cat-search');
      if (newInput) { newInput.focus(); newInput.setSelectionRange(pos, pos); }
    });
    catSearchInput.focus();
  }

  // Click outside to close panel
  if (_catPanelOpen) {
    const panel = filterArea.querySelector('.cat-panel');
    setTimeout(() => {
      const closeOnOutside = (e) => {
        if (panel && !panel.contains(e.target) && !catTriggerBtn.contains(e.target)) {
          _catPanelOpen = false;
          _catSearch = '';
          refresh();
        }
      };
      document.addEventListener('click', closeOnOutside, { once: true });
    }, 0);
  }

  filterArea.querySelector('#filter-label').addEventListener('input', e => {
    const pos = e.target.selectionStart;
    _filterLabel = e.target.value;
    _page = 0;
    refresh();
    const newInput = _container.querySelector('#filter-label');
    if (newInput) { newInput.focus(); newInput.setSelectionRange(pos, pos); }
  });

  filterArea.querySelectorAll('[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      _viewMode = btn.dataset.mode;
      _page = 0;
      refresh();
    });
  });

  sidebar.appendChild(filterSect);

  return sidebar;
}

function renderFlatList(list, txs, catMap, lblMap, defaultCurrency, data) {
  for (const tx of txs) {
    list.appendChild(buildTxRow(tx, catMap, lblMap, defaultCurrency, data));
  }
}

function renderGrouped(list, groups, groupType, catMap, lblMap, defaultCurrency, data) {
  const isCatGroup = groupType === 'category';

  for (const [key, group] of groups) {
    const isNull = key === null;
    const isDeleted = !isNull && (isCatGroup ? !group.category : !group.label);
    const groupName = isCatGroup
      ? (group.category?.name ?? (isNull ? '(uncategorized)' : '(deleted)'))
      : (group.label?.name ?? (isNull ? '(no label)' : '(deleted)'));

    const catIcon = isCatGroup && !isNull && !isDeleted ? (group.category?.icon ?? '') : '';
    const groupBadge = isDeleted
      ? `<span class="badge badge-deleted">${escHtml(groupName)}</span>`
      : isNull
        ? `<span style="font-size:0.875rem;color:var(--text-muted)">${escHtml(groupName)}</span>`
        : isCatGroup
          ? `<span class="badge badge-category">${catIcon} ${escHtml(groupName)}</span>`
          : `<span class="badge badge-label">${escHtml(groupName)}</span>`;

    const groupHeader = document.createElement('div');
    groupHeader.className = 'group-header';
    groupHeader.innerHTML = `
      ${groupBadge}
      <span style="margin-left:auto;font-size:0.875rem;font-weight:600" class="${group.total >= 0 ? 'amount-income' : 'amount-expense'}">${formatAmount(group.total, defaultCurrency)}</span>
      <span class="toggle-icon">▼</span>
    `;

    const groupRows = document.createElement('div');
    groupRows.style.display = 'none';
    const subGroups = isCatGroup
      ? crossGroupByLabel(group.transactions, data.labels)
      : crossGroupByCategory(group.transactions, data.categories);
    for (const sub of subGroups) {
      const subRow = document.createElement('div');
      subRow.className = 'list-row';
      subRow.style.paddingLeft = '2rem';

      const subBadge = sub.isDeleted
        ? `<span class="badge badge-deleted">${escHtml(sub.name)}</span>`
        : sub.isNull
          ? `<span style="font-size:0.875rem;color:var(--text-muted)">${escHtml(sub.name)}</span>`
          : isCatGroup
            ? `<span class="badge badge-label">${escHtml(sub.name)}</span>`
            : `<span class="badge badge-category">${escHtml(sub.name)}</span>`;

      subRow.innerHTML = `
        <span style="flex:1">${subBadge}</span>
        <span class="${sub.total >= 0 ? 'amount-income' : 'amount-expense'}" style="font-weight:600;font-size:0.875rem">${formatAmount(sub.total, defaultCurrency)}</span>
      `;
      groupRows.appendChild(subRow);
    }

    groupHeader.addEventListener('click', () => {
      const open = groupRows.style.display !== 'none';
      groupRows.style.display = open ? 'none' : 'block';
      groupHeader.querySelector('.toggle-icon').textContent = open ? '▼' : '▲';
    });

    list.appendChild(groupHeader);
    list.appendChild(groupRows);
  }
}

function crossGroupByLabel(transactions, labels) {
  const lblMap = new Map(labels.map(l => [l.id, l]));
  const totals = new Map();
  for (const tx of transactions) {
    const keys = tx.labelIds.length ? tx.labelIds : [null];
    for (const k of keys) totals.set(k, (totals.get(k) ?? 0) + tx.amountInDefault);
  }
  return [...totals]
    .map(([k, total]) => ({
      name: k ? (lblMap.get(k)?.name ?? '(deleted)') : '(no label)',
      total,
      isNull: k === null,
      isDeleted: k !== null && !lblMap.get(k),
    }))
    .sort((a, b) => a.total - b.total);
}

function crossGroupByCategory(transactions, categories) {
  const catMap = new Map(categories.map(c => [c.id, c]));
  const totals = new Map();
  for (const tx of transactions) {
    const k = tx.categoryId ?? null;
    totals.set(k, (totals.get(k) ?? 0) + tx.amountInDefault);
  }
  return [...totals]
    .map(([k, total]) => ({
      name: k ? (catMap.get(k)?.name ?? '(deleted)') : '(uncategorized)',
      total,
      isNull: k === null,
      isDeleted: k !== null && !catMap.get(k),
    }))
    .sort((a, b) => a.total - b.total);
}

function buildTxRow(tx, catMap, lblMap, defaultCurrency, data) {
  const row = document.createElement('div');
  row.className = 'list-row';

  const cat = tx.categoryId ? catMap.get(tx.categoryId) : null;
  const catDeleted = tx.categoryId && !cat;
  const MAX_LABELS = 3;
  const allLblPills = tx.labelIds.map(id => {
    const lbl = lblMap.get(id);
    return lbl
      ? `<span class="badge badge-label">${escHtml(lbl.name)}</span>`
      : `<span class="badge badge-deleted">(deleted)</span>`;
  });
  const lblOverflow = allLblPills.length - MAX_LABELS;
  const lblPills = lblOverflow > 0
    ? allLblPills.slice(0, MAX_LABELS).join('') + `<span class="badge badge-more" title="${escHtml(tx.labelIds.map(id => lblMap.get(id)?.name ?? '(deleted)').join(', '))}">+${lblOverflow}</span>`
    : allLblPills.join('');

  const amountStr = formatAmount(tx.amount, tx.currency);
  const amountCls = tx.amount >= 0 ? 'amount-income' : 'amount-expense';

  const primaryHtml = tx.description
    ? `<div class="tx-primary">${escHtml(tx.description)}</div>`
    : '';

  const catDot = cat
    ? `<span class="tx-row-cat-dot">${cat.icon ?? '🏷️'}</span>`
    : catDeleted
      ? `<span class="tx-row-cat-dot" title="Deleted category">🏷️</span>`
      : `<span class="tx-row-cat-dot">🏷️</span>`;

  const catNameLine = cat
    ? `<span class="tx-row-cat-name">${escHtml(cat.name)}</span>`
    : catDeleted
      ? `<span class="tx-row-cat-name" style="opacity:0.5">(deleted)</span>`
      : '';

  row.innerHTML = `
    <div class="tx-row-content">
      <span class="tx-date">${escHtml(formatTxDate(tx.date))}</span>
      ${catDot}
      <div class="tx-info">
        ${primaryHtml}
        ${catNameLine}
        <div class="tx-meta">
          ${lblPills}
          ${tx.isVirtual ? '<span class="badge badge-recurring">↻ recurring</span>' : ''}
        </div>
      </div>
      <span class="${amountCls} tx-amount">${amountStr}</span>
    </div>
    <div class="tx-actions">
      <button class="btn btn-sm btn-secondary btn-icon edit-btn" title="Edit" aria-label="Edit">${ICON_EDIT}</button>
      <button class="btn btn-sm btn-danger btn-icon del-btn" title="Delete" aria-label="Delete">${ICON_DEL}</button>
    </div>
    <div class="tx-actions-mobile">
      <button class="tx-menu-trigger" aria-label="Actions">&#8942;</button>
      <div class="tx-action-menu">
        <button class="tx-menu-item tx-menu-edit">Edit</button>
        <button class="tx-menu-item tx-menu-delete">Delete</button>
      </div>
    </div>
  `;

  const sourceTx = tx.isVirtual ? data.transactions.find(t => t.id === tx.sourceId) : tx;
  const occurrenceDate = tx.date;
  const editHandler = sourceTx?.recurrence
    ? () => openRecurringScopeDialog('edit', sourceTx, occurrenceDate, data)
    : () => openTxModal(sourceTx, data);
  const deleteHandler = sourceTx?.recurrence
    ? () => openRecurringScopeDialog('delete', sourceTx, occurrenceDate, data)
    : () => confirmDeleteTx(tx);

  // Desktop buttons
  row.querySelector('.edit-btn').addEventListener('click', editHandler);
  row.querySelector('.del-btn').addEventListener('click', deleteHandler);

  // Mobile three-dot menu
  row.querySelector('.tx-menu-trigger').addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = row.querySelector('.tx-action-menu');
    const wasActive = menu.classList.contains('active');
    _closeTxMenus();
    if (!wasActive) menu.classList.add('active');
  });
  row.querySelector('.tx-menu-edit').addEventListener('click', () => { _closeTxMenus(); editHandler(); });
  row.querySelector('.tx-menu-delete').addEventListener('click', () => { _closeTxMenus(); deleteHandler(); });

  return row;
}

function openTxModal(tx, data, saveOverride = null) {
  const isEdit = tx !== null && tx !== undefined;
  const { defaultCurrency } = data.settings;
  let isExpense = tx ? tx.amount < 0 : true;

  const dialog = document.createElement('dialog');
  dialog.className = 'tx-dialog';

  const catCards = data.categories.map((c, i) => {
    const selected = tx ? tx.categoryId === c.id : i === 0;
    return `<div class="cat-card${selected ? ' selected' : ''}" data-cat-id="${escHtml(c.id)}">
      <span class="cat-card-emoji">${c.icon ?? '🏷️'}</span>
      <span class="cat-card-name">${escHtml(c.name)}</span>
    </div>`;
  }).join('');

  const labelChips = data.labels.map(l => {
    const checked = tx?.labelIds?.includes(l.id);
    return `
      <label class="tx-label-chip${checked ? ' selected' : ''}">
        <input type="checkbox" value="${escHtml(l.id)}" ${checked ? 'checked' : ''} style="display:none">
        ${escHtml(l.name)}
      </label>`;
  }).join('');

  dialog.innerHTML = `
    <div class="tx-form-wrap">
      <div class="tx-form-main">
        <div class="tx-body-grid">
          <div class="tx-body-left">
            <div class="tx-form-header">
              <p class="modal-subtitle">Record a transaction</p>
              <h2 class="modal-title">${isEdit ? 'Edit Entry' : 'New Entry'}</h2>
            </div>
            <div class="tx-amount-row">
              <div class="seg-group">
                <button type="button" id="tx-expense-btn" class="btn btn-sm">Expense</button>
                <button type="button" id="tx-income-btn" class="btn btn-sm">Income</button>
              </div>
              <input type="text" id="tx-date" class="tx-date-input" placeholder="YYYY-MM-DD" autocomplete="off">
            </div>
            <input type="number" id="tx-amount" class="tx-amount-input" step="0.01" min="0"
              placeholder="0.00" value="${tx ? Math.abs(tx.amount) : ''}">
            <span class="tx-field-label">Category</span>
            <div class="tx-cat-picker" id="tx-cat">
              <div class="cat-search-wrap">
                <svg class="cat-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <input class="cat-search" type="text" placeholder="Search categories…">
              </div>
              <div class="cat-grid">
                ${data.categories.length > 0 ? catCards : '<span style="color:var(--text-muted);font-size:0.8rem;grid-column:1/-1">No categories yet — add one in Settings.</span>'}
              </div>
            </div>
            <div class="form-group">
              <span class="tx-field-label">Description</span>
              <input type="text" id="tx-desc" value="${escHtml(tx?.description ?? '')}" autocomplete="off" placeholder="What was this for?">
            </div>
            ${data.labels.length > 0 ? `
            <div class="form-group">
              <span class="tx-field-label">Labels</span>
              <div class="tx-labels-wrap" id="tx-labels">${labelChips}</div>
            </div>` : ''}
          </div>
          <div class="tx-body-right">
            <div class="tx-currency-card">
              <span class="tx-field-label">Currency</span>
              <input type="text" id="tx-currency" maxlength="10" value="${escHtml(tx?.currency ?? defaultCurrency)}" placeholder="${escHtml(defaultCurrency)}">
              <span class="tx-field-label">Rate <span id="rate-status" style="font-weight:400;color:var(--text-muted);text-transform:none;letter-spacing:0"></span></span>
              <input type="number" id="tx-exchange" step="0.000001" value="${tx?.exchangeRate ?? 1}">
              <span class="tx-field-label">In ${escHtml(defaultCurrency)}</span>
              <input type="number" id="tx-amount-default" step="0.01" value="${tx?.amountInDefault ?? ''}">
            </div>
            <div class="tx-recurring-wrap">
              <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;font-size:0.875rem;margin-bottom:0.25rem">
                <input type="checkbox" id="tx-recurring" ${tx?.recurrence ? 'checked' : ''}>
                Recurring
              </label>
              <div id="recurrence-fields" style="${tx?.recurrence ? '' : 'display:none'}">
                <div class="form-group" style="margin-top:0.5rem">
                  <span class="tx-field-label">Frequency</span>
                  <select id="tx-freq">
                    ${['daily','weekly','monthly','yearly'].map(f => `<option ${tx?.recurrence?.frequency === f ? 'selected' : ''}>${f}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <span class="tx-field-label">Every N</span>
                  <input type="number" id="tx-interval" min="1" value="${tx?.recurrence?.interval ?? 1}">
                </div>
                <div class="form-group">
                  <span class="tx-field-label">End date</span>
                  <div style="display:flex;gap:0.25rem">
                    <input type="text" id="tx-end" placeholder="No end date" autocomplete="off" style="flex:1">
                    <button type="button" id="tx-end-clear" class="btn btn-sm btn-secondary" title="Clear end date">×</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="tx-form-deco" aria-hidden="true">
        <div class="tx-form-deco-text">${isEdit ? 'EDIT' : 'NEW'}</div>
        <div class="tx-form-deco-line"></div>
      </div>
    </div>
    <div class="tx-form-footer">
      <button class="btn btn-secondary cancel-btn">Cancel</button>
      <button class="btn btn-primary save-btn" ${data.categories.length === 0 ? 'disabled' : ''}>${isEdit ? 'Save changes' : 'Add Transaction'}</button>
    </div>
  `;

  document.body.appendChild(dialog);
  dialog.showModal();

  function close() { dialog.close(); dialog.remove(); }
  dialog.addEventListener('cancel', close);

  flatpickr(dialog.querySelector('#tx-date'), {
    dateFormat: 'Y-m-d',
    locale: { firstDayOfWeek: 1 },
    defaultDate: tx?.date ?? new Date().toISOString().slice(0, 10),
    appendTo: dialog,
    onChange: () => updateRate(),
  });

  const fpEnd = flatpickr(dialog.querySelector('#tx-end'), {
    dateFormat: 'Y-m-d',
    locale: { firstDayOfWeek: 1 },
    defaultDate: tx?.recurrence?.endDate || null,
    appendTo: dialog,
    onOpen(_, __, fp) {
      requestAnimationFrame(() => {
        const cal = fp.calendarContainer;
        const dr = dialog.getBoundingClientRect();
        const cr = cal.getBoundingClientRect();
        if (cr.right > dr.right) cal.style.left = (parseFloat(cal.style.left) - (cr.right - dr.right) - 8) + 'px';
      });
    },
  });

  dialog.querySelector('#tx-end-clear').addEventListener('click', () => fpEnd.clear());

  // Auto-fetch exchange rate on currency/date change
  async function updateRate() {
    const curr = dialog.querySelector('#tx-currency').value.trim().toUpperCase();
    const date = dialog.querySelector('#tx-date').value;
    if (!curr || !date || curr === defaultCurrency) {
      dialog.querySelector('#tx-exchange').value = 1;
      syncAmountDefault();
      return;
    }
    dialog.querySelector('#rate-status').textContent = '(fetching…)';
    const rate = await fetchRate(curr, defaultCurrency, date);
    dialog.querySelector('#rate-status').textContent = rate ? '' : '(unavailable)';
    if (rate) {
      dialog.querySelector('#tx-exchange').value = rate;
      syncAmountDefault();
    }
  }

  function syncAmountDefault() {
    const absAmt = parseFloat(dialog.querySelector('#tx-amount').value);
    const rate = parseFloat(dialog.querySelector('#tx-exchange').value);
    if (!isNaN(absAmt) && !isNaN(rate)) {
      const signed = isExpense ? -Math.abs(absAmt) : Math.abs(absAmt);
      dialog.querySelector('#tx-amount-default').value = convertAmount(signed, rate);
    }
  }

  function updateToggle() {
    dialog.querySelector('#tx-expense-btn').className = 'btn btn-sm ' + (isExpense ? 'btn-expense' : 'btn-secondary');
    dialog.querySelector('#tx-income-btn').className  = 'btn btn-sm ' + (isExpense ? 'btn-secondary' : 'btn-income');
  }

  updateToggle();

  dialog.querySelector('#tx-expense-btn').addEventListener('click', () => {
    isExpense = true; updateToggle(); syncAmountDefault();
  });
  dialog.querySelector('#tx-income-btn').addEventListener('click', () => {
    isExpense = false; updateToggle(); syncAmountDefault();
  });

  dialog.querySelector('#tx-cat .cat-search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    dialog.querySelectorAll('#tx-cat .cat-card').forEach(card => {
      const name = card.querySelector('.cat-card-name').textContent.toLowerCase();
      card.style.display = !q || name.includes(q) ? '' : 'none';
    });
  });
  dialog.querySelector('#tx-cat .cat-grid').addEventListener('click', e => {
    const card = e.target.closest('.cat-card');
    if (!card) return;
    dialog.querySelectorAll('#tx-cat .cat-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
  });

  if (data.labels.length > 0) {
    dialog.querySelector('#tx-labels').addEventListener('change', e => {
      if (!e.target.matches('input[type="checkbox"]')) return;
      const chip = e.target.closest('.tx-label-chip');
      if (chip) chip.classList.toggle('selected', e.target.checked);
    });
  }

  dialog.querySelector('#tx-currency').addEventListener('change', updateRate);
  dialog.querySelector('#tx-amount').addEventListener('input', () => {
    const el = dialog.querySelector('#tx-amount');
    if (el.valueAsNumber < 0) {
      el.value = Math.abs(el.valueAsNumber);
      isExpense = !isExpense;
      updateToggle();
    }
    syncAmountDefault();
  });
  dialog.querySelector('#tx-exchange').addEventListener('input', syncAmountDefault);

  dialog.querySelector('#tx-recurring').addEventListener('change', e => {
    dialog.querySelector('#recurrence-fields').style.display = e.target.checked ? '' : 'none';
  });

  dialog.querySelector('.cancel-btn').addEventListener('click', close);
  dialog.querySelector('.save-btn').addEventListener('click', () => {
    const date = dialog.querySelector('#tx-date').value;
    const absAmt = parseFloat(dialog.querySelector('#tx-amount').value);
    const amount = isExpense ? -Math.abs(absAmt) : Math.abs(absAmt);
    const currency = dialog.querySelector('#tx-currency').value.trim().toUpperCase();
    const exchangeRate = parseFloat(dialog.querySelector('#tx-exchange').value) || 1;
    const amountInDefault = parseFloat(dialog.querySelector('#tx-amount-default').value) || amount;
    const description = dialog.querySelector('#tx-desc').value.trim();
    const categoryId = dialog.querySelector('#tx-cat .cat-card.selected')?.dataset.catId || null;
    const labelIds = [...dialog.querySelectorAll('#tx-labels input:checked')].map(cb => cb.value);

    if (!date || isNaN(amount) || !currency || !categoryId) {
      toast('Please fill in date, amount, currency, and category', 'error');
      return;
    }

    let recurrence = null;
    if (dialog.querySelector('#tx-recurring').checked) {
      recurrence = {
        frequency: dialog.querySelector('#tx-freq').value,
        interval: parseInt(dialog.querySelector('#tx-interval').value) || 1,
        endDate: dialog.querySelector('#tx-end').value || null,
      };
    }

    const fields = { date, amount, currency, exchangeRate, amountInDefault, description, categoryId, labelIds, recurrence };

    if (saveOverride) {
      saveOverride(fields);
      toast('Transaction updated', 'success');
    } else if (isEdit) {
      updateTransaction(tx.id, fields);
      toast('Transaction updated', 'success');
    } else {
      addTransaction(fields);
      toast('Transaction added', 'success');
    }
    close();
    _page = 0;
    refresh();
  });

  if (!isEdit) updateRate();
  setTimeout(() => dialog.querySelector('#tx-amount').focus(), 50);
}

function openRecurringScopeDialog(action, sourceTx, occurrenceDate, data) {
  let selectedScope = 'occurrence';

  const isEdit = action === 'edit';
  const verb = isEdit ? 'editing' : 'deleting';
  const verbPast = isEdit ? 'updated' : 'deleted';

  const options = [
    {
      value: 'occurrence',
      title: 'Only this occurrence',
      desc: isEdit
        ? `Change applies to ${occurrenceDate} only. Future occurrences remain unchanged.`
        : `Remove only the ${occurrenceDate} occurrence. The rest of the series remains.`,
    },
    {
      value: 'from-here',
      title: 'This and all future occurrences',
      desc: isEdit
        ? 'Updates this occurrence and all subsequent ones in the series.'
        : 'Deletes from this date onward. Earlier occurrences remain.',
    },
    {
      value: 'all',
      title: 'All occurrences in the series',
      desc: isEdit
        ? 'Applies changes to every occurrence, past and future.'
        : 'Removes the entire recurring transaction series permanently.',
    },
  ];

  const body = document.createElement('div');
  body.innerHTML = `
    <p class="scope-intro">You're ${verb} <strong>${escHtml(sourceTx.description)}</strong>.
      Which occurrences should be ${verbPast}?</p>
    <div class="scope-options">
      ${options.map((o, i) => `
        <button type="button" class="scope-option${i === 0 ? ' selected' : ''}" data-scope="${o.value}">
          <span class="scope-radio"></span>
          <span class="scope-text">
            <span class="scope-title">${escHtml(o.title)}</span>
            <span class="scope-desc">${escHtml(o.desc)}</span>
          </span>
        </button>
      `).join('')}
    </div>
  `;

  body.querySelectorAll('.scope-option').forEach(btn => {
    btn.addEventListener('click', () => {
      body.querySelectorAll('.scope-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedScope = btn.dataset.scope;
    });
  });

  const footer = document.createElement('div');
  footer.innerHTML = `
    <button class="btn btn-secondary cancel-btn">Cancel</button>
    <button class="btn ${isEdit ? 'btn-primary' : 'btn-danger'} confirm-btn">${isEdit ? 'Edit' : 'Delete'}</button>
  `;

  const { close } = openModal({
    title: isEdit ? 'Edit recurring transaction' : 'Delete recurring transaction',
    subtitle: 'Recurring',
    deco: 'SERIES',
    body,
    footer,
  });

  footer.querySelector('.cancel-btn').addEventListener('click', close);
  footer.querySelector('.confirm-btn').addEventListener('click', () => {
    close();
    if (!isEdit) {
      if (selectedScope === 'occurrence') { deleteOccurrenceAt(sourceTx.id, occurrenceDate); toast('Occurrence deleted', 'success'); }
      else if (selectedScope === 'from-here') { truncateSeries(sourceTx.id, occurrenceDate); toast('Transactions deleted', 'success'); }
      else { deleteTransaction(sourceTx.id); toast('Transaction deleted', 'success'); }
      _page = 0; refresh();
    } else {
      if (selectedScope === 'occurrence') openTxModal({ ...sourceTx, date: occurrenceDate, recurrence: null }, data, fields => overrideOccurrence(sourceTx.id, occurrenceDate, fields));
      else if (selectedScope === 'from-here') openTxModal({ ...sourceTx, date: occurrenceDate }, data, fields => splitSeries(sourceTx.id, occurrenceDate, fields));
      else openTxModal(sourceTx, data);
    }
  });
}

function confirmDeleteTx(tx) {
  const body = document.createElement('div');
  body.innerHTML = `
    <p style="margin-bottom:0.25rem">Remove <strong>${escHtml(tx.description || 'this transaction')}</strong> from ${escHtml(tx.date)}?</p>
    <p style="font-size:0.8rem;color:var(--text-muted)">This cannot be undone.</p>
  `;

  const footer = document.createElement('div');
  footer.innerHTML = `
    <button class="btn btn-secondary cancel-btn">Cancel</button>
    <button class="btn btn-danger confirm-btn">Delete</button>
  `;

  const { close } = openModal({ title: 'Delete transaction', subtitle: 'Transaction', deco: 'ENTRY', body, footer });
  footer.querySelector('.cancel-btn').addEventListener('click', close);
  footer.querySelector('.confirm-btn').addEventListener('click', () => {
    deleteTransaction(tx.id);
    toast('Transaction deleted', 'success');
    close();
    _page = 0;
    refresh();
  });
}


function handleCsvFile(file, data) {
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const { categories, labels, transactions } = importTransactions(evt.target.result, data);
      importBulk(categories, labels, transactions);
      toast(`Imported ${transactions.length} transaction(s)`, 'success');
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  reader.readAsText(file);
}

function openCsvImport(data) {
  const body = document.createElement('div');
  body.innerHTML = `
    <p style="margin-bottom:1rem;font-size:0.875rem;color:var(--text-muted)">
      Required columns: <code>date</code>, <code>amount</code>, <code>currency</code>, <code>category</code>, <code>description</code><br>
      Optional: <code>labels</code> (semicolon-separated)
    </p>
    <label class="btn btn-secondary" style="cursor:pointer;display:inline-flex">
      Choose CSV file
      <input type="file" id="csv-input" accept=".csv,text/csv" style="display:none">
    </label>
    <div id="csv-status" style="margin-top:0.75rem;font-size:0.875rem"></div>
  `;

  const footer = document.createElement('div');
  footer.innerHTML = '<button class="btn btn-secondary cancel-btn">Close</button>';

  const { close } = openModal({ title: 'Import CSV', subtitle: 'Import', deco: 'CSV', body, footer });
  footer.querySelector('.cancel-btn').addEventListener('click', close);

  body.querySelector('#csv-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const { categories, labels, transactions } = importTransactions(evt.target.result, data);
        importBulk(categories, labels, transactions);
        toast(`Imported ${transactions.length} transaction(s)`, 'success');
        close();
        refresh();
      } catch (err) {
        body.querySelector('#csv-status').innerHTML = `<span style="color:var(--expense)">${escHtml(err.message)}</span>`;
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });
}

function buildPaginationBar(total) {
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const start = _page * PAGE_SIZE + 1;
  const end   = Math.min((_page + 1) * PAGE_SIZE, total);
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;align-items:center;gap:0.75rem;padding:0.75rem 1rem;'
    + 'border-top:1px solid var(--border);font-size:0.875rem;flex-wrap:wrap';
  bar.innerHTML = `
    <span style="color:var(--text-muted)">Showing ${start}–${end} of ${total}</span>
    <div style="display:flex;gap:0.25rem;margin-left:auto;align-items:center">
      <button class="btn btn-sm btn-secondary" id="pg-prev"
              ${_page === 0 ? 'disabled' : ''}>‹ Prev</button>
      <span style="padding:0 0.4rem;color:var(--text-muted)">
        Page ${_page + 1} of ${totalPages}
      </span>
      <button class="btn btn-sm btn-secondary" id="pg-next"
              ${_page >= totalPages - 1 ? 'disabled' : ''}>Next ›</button>
    </div>
  `;
  bar.querySelector('#pg-prev').addEventListener('click', () => { _page--; refresh(); });
  bar.querySelector('#pg-next').addEventListener('click', () => { _page++; refresh(); });
  return bar;
}


function yearRange() {
  const now = new Date().getFullYear();
  const years = [];
  for (let y = now - 10; y <= now + 2; y++) years.push(y);
  return years;
}

