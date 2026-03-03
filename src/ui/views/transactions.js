import { getData, addTransaction, updateTransaction, deleteTransaction, importBulk, loadData, exportData, deleteOccurrenceAt, truncateSeries, overrideOccurrence, splitSeries } from '../../store.js';
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
let _viewMode = 'flat'; // flat | by-category | by-label
let _filterCategoryId = null;
let _filterLabel = '';
let _dateMode = 'month'; // month | year | custom | all
let _year = new Date().getFullYear();
let _month = new Date().getMonth() + 1;
let _customStart = '';
let _customEnd = '';
let _page = 0;
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

function refresh() {
  const data = getData();

  _container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'page-header';
  header.innerHTML = `
    <h1>Transactions</h1>
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
      <button class="btn btn-sm btn-secondary" id="import-csv-btn">Import CSV</button>
      <button class="btn btn-sm btn-secondary" id="export-btn">Export JSON</button>
      <button class="btn btn-primary" id="add-tx-btn">+ Add</button>
    </div>
  `;
  _container.appendChild(header);

  const dateTabs = document.createElement('div');
  dateTabs.className = 'seg-group';
  dateTabs.innerHTML = `
    <button class="btn btn-sm ${_dateMode === 'month'  ? 'btn-primary' : 'btn-secondary'}" data-dm="month">Month</button>
    <button class="btn btn-sm ${_dateMode === 'year'   ? 'btn-primary' : 'btn-secondary'}" data-dm="year">Year</button>
    <button class="btn btn-sm ${_dateMode === 'custom' ? 'btn-primary' : 'btn-secondary'}" data-dm="custom">Custom</button>
    <button class="btn btn-sm ${_dateMode === 'all'    ? 'btn-primary' : 'btn-secondary'}" data-dm="all">All time</button>
  `;
  dateTabs.querySelectorAll('[data-dm]').forEach(btn =>
    btn.addEventListener('click', () => { _dateMode = btn.dataset.dm; _page = 0; refresh(); })
  );

  const periodRow = document.createElement('div');
  periodRow.style.cssText = 'display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap';

  if (_dateMode === 'month') {
    periodRow.innerHTML = `
      <button class="btn btn-sm btn-secondary" id="prev-period">‹</button>
      <select id="sel-month" style="width:140px">
        ${months().map((m, i) => `<option value="${i + 1}" ${_month === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}
      </select>
      <select id="sel-year" style="width:90px">
        ${yearRange().map(y => `<option ${_year === y ? 'selected' : ''}>${y}</option>`).join('')}
      </select>
      <button class="btn btn-sm btn-secondary" id="next-period">›</button>
    `;
    periodRow.querySelector('#sel-month').addEventListener('change', e => { _month = +e.target.value; _page = 0; refresh(); });
    periodRow.querySelector('#sel-year').addEventListener('change',  e => { _year  = +e.target.value; _page = 0; refresh(); });
    periodRow.querySelector('#prev-period').addEventListener('click', () => {
      if (_month === 1) { _month = 12; _year--; } else _month--;
      _page = 0; refresh();
    });
    periodRow.querySelector('#next-period').addEventListener('click', () => {
      if (_month === 12) { _month = 1; _year++; } else _month++;
      _page = 0; refresh();
    });
  } else if (_dateMode === 'year') {
    periodRow.innerHTML = `
      <button class="btn btn-sm btn-secondary" id="prev-period">‹</button>
      <select id="sel-year" style="width:90px">
        ${yearRange().map(y => `<option ${_year === y ? 'selected' : ''}>${y}</option>`).join('')}
      </select>
      <button class="btn btn-sm btn-secondary" id="next-period">›</button>
    `;
    periodRow.querySelector('#sel-year').addEventListener('change',  e => { _year = +e.target.value; _page = 0; refresh(); });
    periodRow.querySelector('#prev-period').addEventListener('click', () => { _year--; _page = 0; refresh(); });
    periodRow.querySelector('#next-period').addEventListener('click', () => { _year++; _page = 0; refresh(); });
  } else if (_dateMode === 'custom') {
    periodRow.innerHTML = `
      <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.875rem">
        From <input type="text" id="range-start" placeholder="Start date" autocomplete="off" style="width:130px">
      </label>
      <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.875rem">
        To <input type="text" id="range-end" placeholder="End date" autocomplete="off" style="width:130px">
      </label>
      <button class="btn btn-sm btn-primary" id="apply-range">Apply</button>
    `;
    periodRow.querySelector('#apply-range').addEventListener('click', () => {
      _customStart = periodRow.querySelector('#range-start').value;
      _customEnd   = periodRow.querySelector('#range-end').value;
      _page = 0; refresh();
    });
    flatpickr(periodRow.querySelector('#range-start'), {
      dateFormat: 'Y-m-d', locale: { firstDayOfWeek: 1 }, defaultDate: _customStart || null,
    });
    flatpickr(periodRow.querySelector('#range-end'), {
      dateFormat: 'Y-m-d', locale: { firstDayOfWeek: 1 }, defaultDate: _customEnd || null,
    });
  }
  const dateArea = document.createElement('div');
  dateArea.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:1rem';
  dateArea.appendChild(dateTabs);
  if (_dateMode !== 'all') dateArea.appendChild(periodRow);

  const filterBar = document.createElement('div');
  filterBar.className = 'filter-bar';
  filterBar.innerHTML = `
    <select id="filter-cat">
      <option value="">All categories</option>
      ${data.categories.map(c => `<option value="${escHtml(c.id)}" ${_filterCategoryId === c.id ? 'selected' : ''}>${escHtml(c.name)}</option>`).join('')}
    </select>
    <div class="label-search-wrapper">
      <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input type="text" id="filter-label" value="${escHtml(_filterLabel)}" placeholder="Filter by label (wildcards ok)">
    </div>
    <div class="seg-group filter-bar-toggle">
      <button class="btn btn-sm ${_viewMode === 'flat'        ? 'btn-primary' : 'btn-secondary'}" data-mode="flat">Flat</button>
      <button class="btn btn-sm ${_viewMode === 'by-category' ? 'btn-primary' : 'btn-secondary'}" data-mode="by-category">By category</button>
      <button class="btn btn-sm ${_viewMode === 'by-label'    ? 'btn-primary' : 'btn-secondary'}" data-mode="by-label">By label</button>
    </div>
  `;

  const controlsCard = document.createElement('div');
  controlsCard.className = 'controls-card';
  controlsCard.appendChild(dateArea);
  controlsCard.appendChild(filterBar);
  _container.appendChild(controlsCard);

  filterBar.querySelector('#filter-cat').addEventListener('change', e => {
    _filterCategoryId = e.target.value || null;
    _page = 0;
    refresh();
  });

  filterBar.querySelector('#filter-label').addEventListener('input', e => {
    const pos = e.target.selectionStart;
    _filterLabel = e.target.value;
    _page = 0;
    refresh();
    const newInput = _container.querySelector('#filter-label');
    if (newInput) { newInput.focus(); newInput.setSelectionRange(pos, pos); }
  });

  filterBar.querySelectorAll('[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      _viewMode = btn.dataset.mode;
      _page = 0;
      refresh();
    });
  });

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
    .reverse(); // newest first

  const catMap = new Map(data.categories.map(c => [c.id, c]));
  const lblMap = new Map(data.labels.map(l => [l.id, l]));
  const { defaultCurrency } = data.settings;

  if (txs.length > 0) {
    const income   = txs.reduce((s, t) => t.amountInDefault > 0 ? s + t.amountInDefault : s, 0);
    const expenses = txs.reduce((s, t) => t.amountInDefault < 0 ? s + t.amountInDefault : s, 0);
    const net = income + expenses;
    const netCls = net >= 0 ? 'amount-income' : 'amount-expense';
    const netSign = net >= 0 ? '+' : '-';

    const summaryBar = document.createElement('div');
    summaryBar.className = 'summary-bar';
    summaryBar.innerHTML = `
      <div class="summary-bar-item">
        <span class="summary-bar-label">Income</span>
        <span class="summary-bar-value amount-income">+${escHtml(formatAmount(income, defaultCurrency))}</span>
      </div>
      <div class="summary-bar-item">
        <span class="summary-bar-label">Expenses</span>
        <span class="summary-bar-value amount-expense">-${escHtml(formatAmount(Math.abs(expenses), defaultCurrency))}</span>
      </div>
      <div class="summary-bar-item">
        <span class="summary-bar-label">Net</span>
        <span class="summary-bar-value ${netCls}">${netSign}${escHtml(formatAmount(Math.abs(net), defaultCurrency))}</span>
      </div>
    `;
    _container.appendChild(summaryBar);
  }

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
        try {
          loadData(evt.target.result);
          toast('Data loaded successfully', 'success');
          refresh();
        } catch (err) {
          toast(`Load failed: ${err.message}`, 'error');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
    _container.appendChild(emptyCard);
  } else if (txs.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'list-empty';
    empty.textContent = 'No transactions in this period.';
    _container.appendChild(empty);
  } else if (_viewMode === 'flat') {
    const pageSlice = txs.slice(_page * PAGE_SIZE, (_page + 1) * PAGE_SIZE);
    renderFlatList(list, pageSlice, catMap, lblMap, defaultCurrency, data);
    if (txs.length > PAGE_SIZE) list.appendChild(buildPaginationBar(txs.length));
  } else if (_viewMode === 'by-category') {
    renderGrouped(list, groupByCategory(txs, data.categories), 'category', catMap, lblMap, defaultCurrency, data);
  } else {
    renderGrouped(list, groupByLabel(txs, data.labels), 'label', catMap, lblMap, defaultCurrency, data);
  }

  if (_viewMode === 'by-label') {
    const note = document.createElement('p');
    note.style.cssText = 'font-size:0.8rem;color:var(--text-muted);margin-bottom:0.5rem';
    note.textContent = 'Transactions with multiple labels appear in each group — totals may overlap.';
    _container.appendChild(note);
  }

  _container.appendChild(list);

  _container.querySelector('#add-tx-btn').addEventListener('click', () => openTxModal(null, data));
  _container.querySelector('#import-csv-btn').addEventListener('click', () => openCsvImport(getData()));
  _container.querySelector('#export-btn').addEventListener('click', () => {
    const json = exportData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spendwich-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
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
          ? `<span class="badge" style="background:#e0e7ff;color:#3730a3">${catIcon} ${escHtml(groupName)}</span>`
          : `<span class="badge" style="background:#ede9fe;color:#5b21b6">${escHtml(groupName)}</span>`;

    const groupHeader = document.createElement('div');
    groupHeader.style.cssText = 'padding:0.6rem 1rem;background:var(--bg);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:0.5rem;cursor:pointer;user-select:none';
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
            ? `<span class="badge" style="background:#ede9fe;color:#5b21b6">${escHtml(sub.name)}</span>`
            : `<span class="badge" style="background:#e0e7ff;color:#3730a3">${escHtml(sub.name)}</span>`;

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
  const lblPills = tx.labelIds.map(id => {
    const lbl = lblMap.get(id);
    return lbl
      ? `<span class="badge" style="background:#ede9fe;color:#5b21b6">${escHtml(lbl.name)}</span>`
      : `<span class="badge badge-deleted">(deleted)</span>`;
  }).join('');

  const amountStr = formatAmount(tx.amount, tx.currency);
  const amountCls = tx.amount >= 0 ? 'amount-income' : 'amount-expense';

  const primaryHtml = tx.description
    ? `<div class="tx-primary">${escHtml(tx.description)}</div>`
    : '';

  const catBadge = cat
    ? `<span class="badge" style="background:#e0e7ff;color:#3730a3">${cat.icon ?? ''} ${escHtml(cat.name)}</span>`
    : catDeleted
      ? `<span class="badge badge-deleted">(deleted category)</span>`
      : '';

  row.innerHTML = `
    <div class="tx-row-content">
      <span class="tx-date">${escHtml(formatTxDate(tx.date))}</span>
      <div class="tx-info">
        ${primaryHtml}
        <div class="tx-meta">
          ${catBadge}
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
  `;

  const sourceTx = tx.isVirtual ? data.transactions.find(t => t.id === tx.sourceId) : tx;
  const occurrenceDate = tx.date;
  if (sourceTx?.recurrence) {
    row.querySelector('.edit-btn').addEventListener('click', () => openRecurringScopeDialog('edit', sourceTx, occurrenceDate, data));
    row.querySelector('.del-btn').addEventListener('click', () => openRecurringScopeDialog('delete', sourceTx, occurrenceDate, data));
  } else {
    row.querySelector('.edit-btn').addEventListener('click', () => openTxModal(sourceTx, data));
    row.querySelector('.del-btn').addEventListener('click', () => confirmDeleteTx(tx));
  }

  return row;
}

function openTxModal(tx, data, saveOverride = null) {
  const isEdit = tx != null;
  const { defaultCurrency } = data.settings;
  let isExpense = tx ? tx.amount < 0 : true;

  const body = document.createElement('div');
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 1rem">
      <div class="form-group" style="grid-column:1/-1">
        <label for="tx-date">Date</label>
        <input type="text" id="tx-date" placeholder="YYYY-MM-DD" autocomplete="off">
      </div>
      <div style="grid-column:1/-1;display:flex;gap:0.25rem;margin-bottom:0.25rem">
        <button type="button" id="tx-expense-btn" class="btn btn-sm">Expense</button>
        <button type="button" id="tx-income-btn"  class="btn btn-sm">Income</button>
      </div>
      <div class="form-group">
        <label for="tx-amount">Amount</label>
        <input type="number" id="tx-amount" step="0.01" min="0" value="${tx ? Math.abs(tx.amount) : ''}">
      </div>
      <div class="form-group">
        <label for="tx-currency">Currency</label>
        <input type="text" id="tx-currency" maxlength="10" value="${escHtml(tx?.currency ?? defaultCurrency)}" placeholder="${escHtml(defaultCurrency)}">
      </div>
      <div class="form-group">
        <label for="tx-exchange">Exchange rate <span id="rate-status" style="font-weight:400;color:var(--text-muted)"></span></label>
        <input type="number" id="tx-exchange" step="0.000001" value="${tx?.exchangeRate ?? 1}">
      </div>
      <div class="form-group">
        <label for="tx-amount-default">Amount in ${escHtml(defaultCurrency)}</label>
        <input type="number" id="tx-amount-default" step="0.01" value="${tx?.amountInDefault ?? ''}">
      </div>
    </div>
    <div class="form-group">
      <label for="tx-desc">Description</label>
      <input type="text" id="tx-desc" value="${escHtml(tx?.description ?? '')}" autocomplete="off">
    </div>
    <div class="form-group">
      <label>Category</label>
      <div id="tx-cat" style="display:flex;flex-wrap:wrap;gap:0.4rem;padding:0.5rem;border:1px solid var(--border);border-radius:var(--radius)">
        ${data.categories.map((c, i) => `
          <label style="display:flex;align-items:center;gap:0.3rem;cursor:pointer;font-size:0.875rem">
            <input type="radio" name="tx-cat" value="${escHtml(c.id)}" ${(tx ? tx.categoryId === c.id : i === 0) ? 'checked' : ''}>
            ${c.icon ?? ''} ${escHtml(c.name)}
          </label>
        `).join('')}
        ${data.categories.length === 0 ? '<span style="color:var(--text-muted);font-size:0.8rem">No categories — go to Categories to create one first.</span>' : ''}
      </div>
    </div>
    <div class="form-group">
      <label>Labels</label>
      <div id="tx-labels" style="display:flex;flex-wrap:wrap;gap:0.4rem;padding:0.5rem;border:1px solid var(--border);border-radius:var(--radius)">
        ${data.labels.map(l => `
          <label style="display:flex;align-items:center;gap:0.3rem;cursor:pointer;font-size:0.875rem">
            <input type="checkbox" value="${escHtml(l.id)}" ${tx?.labelIds?.includes(l.id) ? 'checked' : ''}>
            ${escHtml(l.name)}
          </label>
        `).join('')}
        ${data.labels.length === 0 ? '<span style="color:var(--text-muted);font-size:0.8rem">No labels defined</span>' : ''}
      </div>
    </div>
    <div class="form-group">
      <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer">
        <input type="checkbox" id="tx-recurring" ${tx?.recurrence ? 'checked' : ''}>
        Recurring
      </label>
    </div>
    <div id="recurrence-fields" style="${tx?.recurrence ? '' : 'display:none'}">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 1rem">
        <div class="form-group">
          <label for="tx-freq">Frequency</label>
          <select id="tx-freq">
            ${['daily','weekly','monthly','yearly'].map(f => `<option ${tx?.recurrence?.frequency === f ? 'selected' : ''}>${f}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="tx-interval">Every N</label>
          <input type="number" id="tx-interval" min="1" value="${tx?.recurrence?.interval ?? 1}">
        </div>
      </div>
      <div class="form-group">
        <label for="tx-end">End date (optional)</label>
        <div style="display:flex;gap:0.25rem">
          <input type="text" id="tx-end" placeholder="No end date" autocomplete="off" style="flex:1">
          <button type="button" id="tx-end-clear" class="btn btn-sm btn-secondary" title="Clear end date">×</button>
        </div>
      </div>
    </div>
  `;

  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:0.5rem;justify-content:flex-end';
  footer.innerHTML = `
    <button class="btn btn-secondary cancel-btn">Cancel</button>
    <button class="btn btn-primary save-btn" ${data.categories.length === 0 ? 'disabled' : ''}>${isEdit ? 'Save' : 'Add'}</button>
  `;

  const { close, dialog } = openModal({ title: isEdit ? 'Edit transaction' : 'New transaction', body, footer });

  const fpDate = flatpickr(body.querySelector('#tx-date'), {
    dateFormat: 'Y-m-d',
    locale: { firstDayOfWeek: 1 },
    defaultDate: tx?.date ?? new Date().toISOString().slice(0, 10),
    appendTo: dialog,
    onChange: () => updateRate(),
  });

  const fpEnd = flatpickr(body.querySelector('#tx-end'), {
    dateFormat: 'Y-m-d',
    locale: { firstDayOfWeek: 1 },
    defaultDate: tx?.recurrence?.endDate || null,
    appendTo: dialog,
  });

  body.querySelector('#tx-end-clear').addEventListener('click', () => fpEnd.clear());

  // Auto-fetch exchange rate on currency/date change
  async function updateRate() {
    const curr = body.querySelector('#tx-currency').value.trim().toUpperCase();
    const date = body.querySelector('#tx-date').value;
    if (!curr || !date || curr === defaultCurrency) {
      body.querySelector('#tx-exchange').value = 1;
      syncAmountDefault();
      return;
    }
    body.querySelector('#rate-status').textContent = '(fetching…)';
    const rate = await fetchRate(curr, defaultCurrency, date);
    body.querySelector('#rate-status').textContent = rate ? '' : '(unavailable)';
    if (rate) {
      body.querySelector('#tx-exchange').value = rate;
      syncAmountDefault();
    }
  }

  function syncAmountDefault() {
    const absAmt = parseFloat(body.querySelector('#tx-amount').value);
    const rate = parseFloat(body.querySelector('#tx-exchange').value);
    if (!isNaN(absAmt) && !isNaN(rate)) {
      const signed = isExpense ? -Math.abs(absAmt) : Math.abs(absAmt);
      body.querySelector('#tx-amount-default').value = convertAmount(signed, rate);
    }
  }

  function updateToggle() {
    body.querySelector('#tx-expense-btn').className = 'btn btn-sm ' + (isExpense ? 'btn-expense' : 'btn-secondary');
    body.querySelector('#tx-income-btn').className  = 'btn btn-sm ' + (isExpense ? 'btn-secondary' : 'btn-income');
  }

  updateToggle();

  body.querySelector('#tx-expense-btn').addEventListener('click', () => {
    isExpense = true; updateToggle(); syncAmountDefault();
  });
  body.querySelector('#tx-income-btn').addEventListener('click', () => {
    isExpense = false; updateToggle(); syncAmountDefault();
  });

  body.querySelector('#tx-currency').addEventListener('change', updateRate);
  body.querySelector('#tx-amount').addEventListener('input', () => {
    const el = body.querySelector('#tx-amount');
    if (el.valueAsNumber < 0) {
      el.value = Math.abs(el.valueAsNumber);
      isExpense = !isExpense;
      updateToggle();
    }
    syncAmountDefault();
  });
  body.querySelector('#tx-exchange').addEventListener('input', syncAmountDefault);

  body.querySelector('#tx-recurring').addEventListener('change', e => {
    body.querySelector('#recurrence-fields').style.display = e.target.checked ? '' : 'none';
  });

  footer.querySelector('.cancel-btn').addEventListener('click', close);
  footer.querySelector('.save-btn').addEventListener('click', () => {
    const date = body.querySelector('#tx-date').value;
    const absAmt = parseFloat(body.querySelector('#tx-amount').value);
    const amount = isExpense ? -Math.abs(absAmt) : Math.abs(absAmt);
    const currency = body.querySelector('#tx-currency').value.trim().toUpperCase();
    const exchangeRate = parseFloat(body.querySelector('#tx-exchange').value) || 1;
    const amountInDefault = parseFloat(body.querySelector('#tx-amount-default').value) || amount;
    const description = body.querySelector('#tx-desc').value.trim();
    const categoryId = body.querySelector('#tx-cat input[name="tx-cat"]:checked')?.value || null;
    const labelIds = [...body.querySelectorAll('#tx-labels input:checked')].map(cb => cb.value);

    if (!date || isNaN(amount) || !currency || !categoryId) {
      toast('Please fill in date, amount, currency, and category', 'error');
      return;
    }

    let recurrence = null;
    if (body.querySelector('#tx-recurring').checked) {
      recurrence = {
        frequency: body.querySelector('#tx-freq').value,
        interval: parseInt(body.querySelector('#tx-interval').value) || 1,
        endDate: body.querySelector('#tx-end').value || null,
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
  setTimeout(() => body.querySelector('#tx-amount').focus(), 50);
}

function openRecurringScopeDialog(action, sourceTx, occurrenceDate, data) {
  const body = document.createElement('div');
  body.innerHTML = `
    <p style="margin-bottom:1rem;color:var(--text-muted);font-size:0.875rem">Which occurrences should be ${action === 'edit' ? 'updated' : 'deleted'}?</p>
    <div style="display:flex;flex-direction:column;gap:0.75rem">
      <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer">
        <input type="radio" name="scope" value="occurrence" checked> Only this occurrence (${escHtml(occurrenceDate)})
      </label>
      <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer">
        <input type="radio" name="scope" value="from-here"> This and all future occurrences
      </label>
      <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer">
        <input type="radio" name="scope" value="all"> All occurrences in the series
      </label>
    </div>
  `;

  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:0.5rem;justify-content:flex-end';
  footer.innerHTML = `
    <button class="btn btn-secondary cancel-btn">Cancel</button>
    <button class="btn ${action === 'delete' ? 'btn-danger' : 'btn-primary'} confirm-btn">${action === 'edit' ? 'Edit' : 'Delete'}</button>
  `;

  const { close } = openModal({ title: action === 'edit' ? 'Edit recurring transaction' : 'Delete recurring transaction', body, footer });
  footer.querySelector('.cancel-btn').addEventListener('click', close);
  footer.querySelector('.confirm-btn').addEventListener('click', () => {
    const scope = body.querySelector('input[name="scope"]:checked').value;
    close();

    if (action === 'delete') {
      if (scope === 'occurrence') {
        deleteOccurrenceAt(sourceTx.id, occurrenceDate);
        toast('Occurrence deleted', 'success');
      } else if (scope === 'from-here') {
        truncateSeries(sourceTx.id, occurrenceDate);
        toast('Transactions deleted', 'success');
      } else {
        deleteTransaction(sourceTx.id);
        toast('Transaction deleted', 'success');
      }
      _page = 0;
      refresh();
    } else {
      if (scope === 'occurrence') {
        openTxModal({ ...sourceTx, date: occurrenceDate, recurrence: null }, data,
          fields => overrideOccurrence(sourceTx.id, occurrenceDate, fields));
      } else if (scope === 'from-here') {
        openTxModal({ ...sourceTx, date: occurrenceDate }, data,
          fields => splitSeries(sourceTx.id, occurrenceDate, fields));
      } else {
        openTxModal(sourceTx, data);
      }
    }
  });
}

function confirmDeleteTx(tx) {
  const body = document.createElement('p');
  body.textContent = `Delete this transaction from ${tx.date}? This cannot be undone.`;

  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:0.5rem;justify-content:flex-end';
  footer.innerHTML = `
    <button class="btn btn-secondary cancel-btn">Cancel</button>
    <button class="btn btn-danger confirm-btn">Delete</button>
  `;

  const { close } = openModal({ title: 'Delete transaction', body, footer });
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

  const { close } = openModal({ title: 'Import CSV', body, footer });
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

function months() {
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
}

function yearRange() {
  const now = new Date().getFullYear();
  const years = [];
  for (let y = now - 10; y <= now + 2; y++) years.push(y);
  return years;
}

