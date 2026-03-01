import { getData, addTransaction, updateTransaction, deleteTransaction, importBulk } from '../../store.js';
import { expandAndFilter, groupByCategory, groupByLabel } from '../../filters.js';
import { fetchRate, convertAmount } from '../../currency.js';
import { importTransactions } from '../../csv.js';
import { openModal } from '../modal.js';
import { toast } from '../toast.js';

let _container = null;
let _viewMode = 'flat'; // flat | by-category | by-label
let _filterCategoryId = null;
let _filterLabel = '';

export function render(container) {
  _container = container;
  refresh();
}

function refresh() {
  const data = getData();
  const today = new Date();
  today.setUTCHours(23, 59, 59, 999);

  _container.innerHTML = '';

  // Header
  const header = document.createElement('div');
  header.className = 'page-header';
  header.innerHTML = `
    <h1>Transactions</h1>
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
      <button class="btn btn-secondary" id="import-csv-btn">Import CSV</button>
      <button class="btn btn-primary" id="add-tx-btn">+ Add</button>
    </div>
  `;
  _container.appendChild(header);

  // Filters + view toggle
  const filterBar = document.createElement('div');
  filterBar.style.cssText = 'display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem;align-items:center';
  filterBar.innerHTML = `
    <select id="filter-cat" style="flex:0 1 180px">
      <option value="">All categories</option>
      ${data.categories.map(c => `<option value="${escHtml(c.id)}" ${_filterCategoryId === c.id ? 'selected' : ''}>${escHtml(c.name)}</option>`).join('')}
    </select>
    <input type="text" id="filter-label" value="${escHtml(_filterLabel)}" placeholder="Label filter (glob ok)" style="flex:0 1 180px">
    <div style="display:flex;gap:0.25rem;margin-left:auto">
      <button class="btn btn-sm ${_viewMode === 'flat' ? 'btn-primary' : 'btn-secondary'}" data-mode="flat">Flat</button>
      <button class="btn btn-sm ${_viewMode === 'by-category' ? 'btn-primary' : 'btn-secondary'}" data-mode="by-category">By category</button>
      <button class="btn btn-sm ${_viewMode === 'by-label' ? 'btn-primary' : 'btn-secondary'}" data-mode="by-label">By label</button>
    </div>
  `;
  _container.appendChild(filterBar);

  filterBar.querySelector('#filter-cat').addEventListener('change', e => {
    _filterCategoryId = e.target.value || null;
    refresh();
  });

  filterBar.querySelector('#filter-label').addEventListener('input', e => {
    _filterLabel = e.target.value;
    refresh();
  });

  filterBar.querySelectorAll('[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      _viewMode = btn.dataset.mode;
      refresh();
    });
  });

  // Build filtered transaction list
  const filterOpts = { windowEnd: today, labels: data.labels };
  if (_filterCategoryId) filterOpts.categoryId = _filterCategoryId;
  if (_filterLabel.trim()) filterOpts.labelPattern = _filterLabel.trim();

  const txs = expandAndFilter(data.transactions, filterOpts).reverse(); // newest first

  const catMap = new Map(data.categories.map(c => [c.id, c]));
  const lblMap = new Map(data.labels.map(l => [l.id, l]));
  const { defaultCurrency } = data.settings;

  // Render list
  const list = document.createElement('div');
  list.className = 'list';

  if (txs.length === 0) {
    list.innerHTML = '<div class="list-empty">No transactions yet. Add one or import a CSV.</div>';
  } else if (_viewMode === 'flat') {
    renderFlatList(list, txs, catMap, lblMap, defaultCurrency, data);
  } else if (_viewMode === 'by-category') {
    renderGrouped(list, groupByCategory(txs, data.categories), 'category', catMap, lblMap, defaultCurrency, data);
  } else {
    renderGrouped(list, groupByLabel(txs, data.labels), 'label', catMap, lblMap, defaultCurrency, data);
  }

  _container.appendChild(list);

  _container.querySelector('#add-tx-btn').addEventListener('click', () => openTxModal(null, data));
  _container.querySelector('#import-csv-btn').addEventListener('click', () => openCsvImport(data));
}

function renderFlatList(list, txs, catMap, lblMap, defaultCurrency, data) {
  for (const tx of txs) {
    list.appendChild(buildTxRow(tx, catMap, lblMap, defaultCurrency, data));
  }
}

function renderGrouped(list, groups, groupType, catMap, lblMap, defaultCurrency, data) {
  for (const [key, group] of groups) {
    const groupName = groupType === 'category'
      ? (group.category?.name ?? '(uncategorized)')
      : (group.label?.name ?? '(no label)');
    const isDeleted = groupType === 'category'
      ? (key !== null && !group.category)
      : (key !== null && !group.label);

    const groupHeader = document.createElement('div');
    groupHeader.style.cssText = 'padding:0.6rem 1rem;background:var(--bg);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:0.5rem;cursor:pointer;user-select:none';
    groupHeader.innerHTML = `
      <span style="font-weight:600;font-size:0.875rem">${escHtml(groupName)}</span>
      ${isDeleted ? '<span class="badge badge-deleted">(deleted)</span>' : ''}
      <span style="margin-left:auto;font-size:0.875rem;font-weight:600" class="${group.total >= 0 ? 'amount-income' : 'amount-expense'}">${formatAmount(group.total, defaultCurrency)}</span>
      <span class="toggle-icon">▼</span>
    `;

    const groupRows = document.createElement('div');
    groupRows.style.display = 'none';
    for (const tx of [...group.transactions].reverse()) {
      groupRows.appendChild(buildTxRow(tx, catMap, lblMap, defaultCurrency, data));
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

function buildTxRow(tx, catMap, lblMap, defaultCurrency, data) {
  const row = document.createElement('div');
  row.className = 'list-row';
  row.style.flexWrap = 'wrap';

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

  row.innerHTML = `
    <span style="color:var(--text-muted);font-size:0.8rem;min-width:90px">${escHtml(tx.date)}</span>
    <span style="flex:1;min-width:120px">
      ${tx.description ? `<span style="font-weight:500">${escHtml(tx.description)}</span>` : ''}
      <div style="display:flex;flex-wrap:wrap;gap:0.25rem;margin-top:0.2rem">
        ${cat ? `<span class="badge" style="background:#e0e7ff;color:#3730a3">${escHtml(cat.name)}</span>` : ''}
        ${catDeleted ? '<span class="badge badge-deleted">(deleted category)</span>' : ''}
        ${lblPills}
        ${tx.isVirtual ? '<span class="badge badge-recurring">↻ recurring</span>' : ''}
      </div>
    </span>
    <span class="${amountCls}" style="font-weight:600;min-width:80px;text-align:right">${amountStr}</span>
    <div style="display:flex;gap:0.25rem">
      <button class="btn btn-sm btn-secondary edit-btn">Edit</button>
      ${!tx.isVirtual ? '<button class="btn btn-sm btn-danger del-btn">Del</button>' : ''}
    </div>
  `;

  const editTarget = tx.isVirtual ? data.transactions.find(t => t.id === tx.sourceId) : tx;
  row.querySelector('.edit-btn').addEventListener('click', () => openTxModal(editTarget, data));
  if (!tx.isVirtual) {
    row.querySelector('.del-btn').addEventListener('click', () => confirmDeleteTx(tx));
  }

  return row;
}

function openTxModal(tx, data) {
  const isEdit = tx !== null;
  const { defaultCurrency } = data.settings;

  const body = document.createElement('div');
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 1rem">
      <div class="form-group" style="grid-column:1/-1">
        <label for="tx-date">Date</label>
        <input type="date" id="tx-date" value="${tx?.date ?? new Date().toISOString().slice(0, 10)}">
      </div>
      <div class="form-group">
        <label for="tx-amount">Amount (negative = expense)</label>
        <input type="number" id="tx-amount" step="0.01" value="${tx?.amount ?? ''}">
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
      <label for="tx-cat">Category</label>
      <select id="tx-cat">
        <option value="">— none —</option>
        ${data.categories.map(c => `<option value="${escHtml(c.id)}" ${tx?.categoryId === c.id ? 'selected' : ''}>${escHtml(c.name)}</option>`).join('')}
      </select>
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
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 1rem">
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
        <div class="form-group">
          <label for="tx-end">End date (optional)</label>
          <input type="date" id="tx-end" value="${tx?.recurrence?.endDate ?? ''}">
        </div>
      </div>
    </div>
  `;

  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:0.5rem;justify-content:flex-end';
  footer.innerHTML = `
    <button class="btn btn-secondary cancel-btn">Cancel</button>
    <button class="btn btn-primary save-btn">${isEdit ? 'Save' : 'Add'}</button>
  `;

  const { close } = openModal({ title: isEdit ? 'Edit transaction' : 'New transaction', body, footer });

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
    const amount = parseFloat(body.querySelector('#tx-amount').value);
    const rate = parseFloat(body.querySelector('#tx-exchange').value);
    if (!isNaN(amount) && !isNaN(rate)) {
      body.querySelector('#tx-amount-default').value = convertAmount(amount, rate);
    }
  }

  body.querySelector('#tx-currency').addEventListener('change', updateRate);
  body.querySelector('#tx-date').addEventListener('change', updateRate);
  body.querySelector('#tx-amount').addEventListener('input', syncAmountDefault);
  body.querySelector('#tx-exchange').addEventListener('input', syncAmountDefault);

  body.querySelector('#tx-recurring').addEventListener('change', e => {
    body.querySelector('#recurrence-fields').style.display = e.target.checked ? '' : 'none';
  });

  footer.querySelector('.cancel-btn').addEventListener('click', close);
  footer.querySelector('.save-btn').addEventListener('click', () => {
    const date = body.querySelector('#tx-date').value;
    const amount = parseFloat(body.querySelector('#tx-amount').value);
    const currency = body.querySelector('#tx-currency').value.trim().toUpperCase();
    const exchangeRate = parseFloat(body.querySelector('#tx-exchange').value) || 1;
    const amountInDefault = parseFloat(body.querySelector('#tx-amount-default').value) || amount;
    const description = body.querySelector('#tx-desc').value.trim();
    const categoryId = body.querySelector('#tx-cat').value || null;
    const labelIds = [...body.querySelectorAll('#tx-labels input:checked')].map(cb => cb.value);

    if (!date || isNaN(amount) || !currency) {
      toast('Please fill in date, amount, and currency', 'error');
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

    if (isEdit) {
      updateTransaction(tx.id, fields);
      toast('Transaction updated', 'success');
    } else {
      addTransaction(fields);
      toast('Transaction added', 'success');
    }
    close();
    refresh();
  });

  if (!isEdit) updateRate();
  setTimeout(() => body.querySelector('#tx-amount').focus(), 50);
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
    refresh();
  });
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

function formatAmount(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
