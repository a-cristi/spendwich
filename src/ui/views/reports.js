import { getData } from '../../store.js';
import { monthlyReport, yearlyReport, customRangeReport } from '../../reports.js';
import { escHtml } from '../utils.js';

let _container = null;
let _mode = 'monthly'; // monthly | yearly | custom
let _breakdown = 'category'; // category | label
let _year = new Date().getFullYear();
let _month = new Date().getMonth() + 1;
let _customStart = '';
let _customEnd = '';
let _chartInstances = [];

export function render(container) {
  _container = container;
  refresh();
}

function refresh() {
  _chartInstances.forEach(c => c.destroy());
  _chartInstances = [];
  _container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'page-header';
  header.innerHTML = '<h1>Reports</h1>';
  _container.appendChild(header);

  // Mode tabs
  const tabs = document.createElement('div');
  tabs.className = 'seg-group';
  tabs.style.cssText = 'margin-bottom:1.5rem';
  tabs.innerHTML = `
    <button class="btn btn-sm ${_mode === 'monthly' ? 'btn-primary' : 'btn-secondary'}" data-mode="monthly">Monthly</button>
    <button class="btn btn-sm ${_mode === 'yearly' ? 'btn-primary' : 'btn-secondary'}" data-mode="yearly">Yearly</button>
    <button class="btn btn-sm ${_mode === 'custom' ? 'btn-primary' : 'btn-secondary'}" data-mode="custom">Custom range</button>
  `;
  tabs.querySelectorAll('[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => { _mode = btn.dataset.mode; refresh(); });
  });
  _container.appendChild(tabs);

  // Period selector
  const periodRow = document.createElement('div');
  periodRow.style.cssText = 'display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;margin-bottom:1.5rem';

  if (_mode === 'monthly') {
    periodRow.innerHTML = `
      <button class="btn btn-sm btn-secondary" id="prev-period">‹</button>
      <select id="sel-month" style="width:140px">
        ${months().map((m, i) => `<option value="${i+1}" ${_month === i+1 ? 'selected' : ''}>${m}</option>`).join('')}
      </select>
      <select id="sel-year" style="width:90px">
        ${yearRange().map(y => `<option ${_year === y ? 'selected' : ''}>${y}</option>`).join('')}
      </select>
      <button class="btn btn-sm btn-secondary" id="next-period">›</button>
    `;
    periodRow.querySelector('#sel-month').addEventListener('change', e => { _month = +e.target.value; refresh(); });
    periodRow.querySelector('#sel-year').addEventListener('change', e => { _year = +e.target.value; refresh(); });
    periodRow.querySelector('#prev-period').addEventListener('click', () => {
      if (_month === 1) { _month = 12; _year--; } else _month--;
      refresh();
    });
    periodRow.querySelector('#next-period').addEventListener('click', () => {
      if (_month === 12) { _month = 1; _year++; } else _month++;
      refresh();
    });
  } else if (_mode === 'yearly') {
    periodRow.innerHTML = `
      <button class="btn btn-sm btn-secondary" id="prev-period">‹</button>
      <select id="sel-year" style="width:90px">
        ${yearRange().map(y => `<option ${_year === y ? 'selected' : ''}>${y}</option>`).join('')}
      </select>
      <button class="btn btn-sm btn-secondary" id="next-period">›</button>
    `;
    periodRow.querySelector('#sel-year').addEventListener('change', e => { _year = +e.target.value; refresh(); });
    periodRow.querySelector('#prev-period').addEventListener('click', () => { _year--; refresh(); });
    periodRow.querySelector('#next-period').addEventListener('click', () => { _year++; refresh(); });
  } else {
    periodRow.innerHTML = `
      <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.875rem">
        From <input type="text" id="range-start" placeholder="Start date" autocomplete="off" style="width:145px">
      </label>
      <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.875rem">
        To <input type="text" id="range-end" placeholder="End date" autocomplete="off" style="width:145px">
      </label>
      <button class="btn btn-sm btn-primary" id="apply-range">Apply</button>
    `;
    periodRow.querySelector('#apply-range').addEventListener('click', () => {
      _customStart = periodRow.querySelector('#range-start').value;
      _customEnd = periodRow.querySelector('#range-end').value;
      refresh();
    });
  }

  _container.appendChild(periodRow);

  if (_mode === 'custom') {
    flatpickr(periodRow.querySelector('#range-start'), {
      dateFormat: 'Y-m-d',
      locale: { firstDayOfWeek: 1 },
      defaultDate: _customStart || null,
    });
    flatpickr(periodRow.querySelector('#range-end'), {
      dateFormat: 'Y-m-d',
      locale: { firstDayOfWeek: 1 },
      defaultDate: _customEnd || null,
    });
  }

  // Compute report
  const data = getData();
  let report;
  try {
    if (_mode === 'monthly') {
      report = monthlyReport(data, _year, _month);
    } else if (_mode === 'yearly') {
      report = yearlyReport(data, _year);
    } else {
      if (!_customStart || !_customEnd) {
        _container.appendChild(Object.assign(document.createElement('p'), { className: 'placeholder', textContent: 'Select a date range and click Apply.' }));
        return;
      }
      report = customRangeReport(data, _customStart, _customEnd);
    }
  } catch (e) {
    const errEl = document.createElement('p');
    errEl.style.color = 'var(--expense)';
    errEl.textContent = e.message;
    _container.appendChild(errEl);
    return;
  }

  const { defaultCurrency } = data.settings;

  // Breakdown toggle
  const breakdownRow = document.createElement('div');
  breakdownRow.className = 'seg-group';
  breakdownRow.style.cssText = 'margin-bottom:1.5rem';
  breakdownRow.innerHTML = `
    <button class="btn btn-sm ${_breakdown === 'category' ? 'btn-primary' : 'btn-secondary'}" data-bd="category">By category</button>
    <button class="btn btn-sm ${_breakdown === 'label' ? 'btn-primary' : 'btn-secondary'}" data-bd="label">By label</button>
  `;
  breakdownRow.querySelectorAll('[data-bd]').forEach(btn => {
    btn.addEventListener('click', () => { _breakdown = btn.dataset.bd; refresh(); });
  });
  _container.appendChild(breakdownRow);

  if (_mode === 'yearly') {
    renderYearlyReport(report, defaultCurrency, data);
  } else {
    renderSummaryReport(report, defaultCurrency, data);
  }
}

function renderSummaryReport(report, currency, data) {
  // Summary cards
  const cards = document.createElement('div');
  cards.className = 'summary-cards';
  cards.innerHTML = `
    <div class="summary-card summary-card-income">
      <div class="label">Income</div>
      <div class="value amount-income">${fmt(report.income, currency)}</div>
    </div>
    <div class="summary-card summary-card-expense">
      <div class="label">Expenses</div>
      <div class="value amount-expense">${fmt(Math.abs(report.expenses), currency)}</div>
    </div>
    <div class="summary-card ${report.net >= 0 ? 'summary-card-net-pos' : 'summary-card-net-neg'}">
      <div class="label">Net</div>
      <div class="value ${report.net >= 0 ? 'amount-income' : 'amount-expense'}">${fmt(report.net, currency)}</div>
    </div>
  `;
  _container.appendChild(cards);

  const isCat = _breakdown === 'category';
  const items = isCat ? report.byCategory : report.byLabel;
  const nameKey = isCat ? 'categoryName' : 'labelName';
  const fallback = isCat ? '(uncategorized)' : '(no label)';
  const catsByName = isCat ? new Map(data.categories.map(c => [c.name, c])) : null;

  // Pie chart
  if (items.some(b => b.total !== 0)) {
    const chartWrap = document.createElement('div');
    chartWrap.className = 'card';
    chartWrap.style.cssText = 'padding:1.25rem;margin-bottom:1.5rem';
    chartWrap.innerHTML = '<canvas></canvas>';
    _container.appendChild(chartWrap);
    _chartInstances.push(new Chart(chartWrap.querySelector('canvas').getContext('2d'), {
      type: 'pie',
      data: buildPieChartData(items, nameKey, fallback, catsByName),
      options: {
        responsive: true,
        aspectRatio: 2.5,
        plugins: { legend: { display: true, position: 'right' } },
      },
    }));
  }

  // Breakdown table
  if (items.length > 0) {
    renderBreakdownTable(items, nameKey, fallback, currency);
  } else {
    _container.appendChild(Object.assign(document.createElement('p'), { className: 'placeholder', textContent: 'No transactions in this period.' }));
  }
}

function renderYearlyReport(report, currency, data) {
  // Totals
  const cards = document.createElement('div');
  cards.className = 'summary-cards';
  cards.innerHTML = `
    <div class="summary-card summary-card-income">
      <div class="label">Total income</div>
      <div class="value amount-income">${fmt(report.total.income, currency)}</div>
    </div>
    <div class="summary-card summary-card-expense">
      <div class="label">Total expenses</div>
      <div class="value amount-expense">${fmt(Math.abs(report.total.expenses), currency)}</div>
    </div>
    <div class="summary-card ${report.total.net >= 0 ? 'summary-card-net-pos' : 'summary-card-net-neg'}">
      <div class="label">Net</div>
      <div class="value ${report.total.net >= 0 ? 'amount-income' : 'amount-expense'}">${fmt(report.total.net, currency)}</div>
    </div>
  `;
  _container.appendChild(cards);

  // Monthly chart
  const chartWrap = document.createElement('div');
  chartWrap.className = 'card';
  chartWrap.style.cssText = 'padding:1.25rem;margin-bottom:1.5rem';
  chartWrap.innerHTML = '<canvas height="120"></canvas>';
  _container.appendChild(chartWrap);

  _chartInstances.push(new Chart(chartWrap.querySelector('canvas').getContext('2d'), {
    type: 'bar',
    data: {
      labels: months(),
      datasets: [
        {
          label: 'Income',
          data: report.months.map(m => m.income),
          backgroundColor: '#15803d88',
          borderColor: '#15803d',
          borderWidth: 1,
        },
        {
          label: 'Expenses',
          data: report.months.map(m => Math.abs(m.expenses)),
          backgroundColor: '#b91c1c88',
          borderColor: '#b91c1c',
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
      scales: { y: { beginAtZero: true } },
    },
  }));

  // Breakdown pie + table
  const isCat = _breakdown === 'category';
  const items = isCat ? report.byCategory : report.byLabel;
  const nameKey = isCat ? 'categoryName' : 'labelName';
  const fallback = isCat ? '(uncategorized)' : '(no label)';
  const catsByName = isCat ? new Map(data.categories.map(c => [c.name, c])) : null;

  if (items.some(b => b.total !== 0)) {
    const pieWrap = document.createElement('div');
    pieWrap.className = 'card';
    pieWrap.style.cssText = 'padding:1.25rem;margin-bottom:1.5rem';
    pieWrap.innerHTML = '<canvas></canvas>';
    _container.appendChild(pieWrap);
    _chartInstances.push(new Chart(pieWrap.querySelector('canvas').getContext('2d'), {
      type: 'pie',
      data: buildPieChartData(items, nameKey, fallback, catsByName),
      options: {
        responsive: true,
        aspectRatio: 2.5,
        plugins: { legend: { display: true, position: 'right' } },
      },
    }));
  }

  if (items.length > 0) {
    renderBreakdownTable(items, nameKey, fallback, currency);
  }
}

const PIE_COLORS = [
  '#6366f1', // indigo  — matches --primary
  '#0d9488', // teal
  '#f59e0b', // amber
  '#db2777', // pink
  '#16a34a', // green
  '#9333ea', // purple
  '#ea580c', // orange
  '#2563eb', // blue
  '#ca8a04', // yellow-dark
  '#dc2626', // red
  '#0891b2', // cyan
  '#be185d', // rose
];

function buildPieChartData(items, nameKey, fallback, catsByName) {
  const sorted = [...items].filter(b => b.total !== 0).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  return {
    labels: sorted.map(b => {
      const name = b[nameKey] ?? fallback;
      const icon = catsByName?.get(name)?.icon;
      return icon ? `${icon} ${name}` : name;
    }),
    datasets: [{
      data: sorted.map(b => Math.abs(b.total)),
      backgroundColor: sorted.map((_, i) => PIE_COLORS[i % PIE_COLORS.length]),
      borderWidth: 1,
    }],
  };
}

function renderBreakdownTable(items, nameKey, fallback, currency) {
  const section = document.createElement('div');
  section.className = 'card';
  section.style.overflow = 'hidden';

  const title = document.createElement('div');
  title.style.cssText = 'padding:0.75rem 1rem;border-bottom:1px solid var(--border);font-weight:600;font-size:0.875rem';
  title.textContent = nameKey === 'categoryName' ? 'By category' : 'By label';
  section.appendChild(title);

  const isCatBreakdown = nameKey === 'categoryName';
  const catsByName = isCatBreakdown
    ? new Map(getData().categories.map(c => [c.name, c]))
    : null;

  const sorted = [...items].sort((a, b) => a.total - b.total);
  for (const b of sorted) {
    const name = b[nameKey] ?? fallback;
    const icon = isCatBreakdown ? (catsByName.get(name)?.icon ?? '') : '';
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `
      <span style="flex:1">${icon ? icon + ' ' : ''}${escHtml(name)}</span>
      <span style="color:var(--text-muted);font-size:0.8rem;margin-right:1rem">${b.count} transaction${b.count !== 1 ? 's' : ''}</span>
      <span class="${b.total >= 0 ? 'amount-income' : 'amount-expense'}" style="font-weight:600">${fmt(b.total, currency)}</span>
    `;
    section.appendChild(row);
  }

  _container.appendChild(section);
}

function fmt(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function months() {
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
}

function yearRange() {
  const now = new Date().getFullYear();
  const years = [];
  for (let y = now - 10; y <= now + 2; y++) years.push(y);
  return years;
}

