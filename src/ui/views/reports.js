import { getData } from '../../store.js';
import { monthlyReport, yearlyReport, customRangeReport, allTimeReport } from '../../reports.js';
import { escHtml } from '../utils.js';

let _container = null;
let _mode = 'monthly'; // monthly | yearly | custom | all
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

  const layout = document.createElement('div');
  layout.className = 'view-layout';
  _container.appendChild(layout);

  layout.appendChild(buildReportsSidebar());

  const main = document.createElement('div');
  main.className = 'view-main';
  layout.appendChild(main);

  const data = getData();
  let report;
  try {
    if (_mode === 'monthly') {
      report = monthlyReport(data, _year, _month);
    } else if (_mode === 'yearly') {
      report = yearlyReport(data, _year);
    } else if (_mode === 'all') {
      report = allTimeReport(data);
    } else {
      if (!_customStart || !_customEnd) {
        main.appendChild(Object.assign(document.createElement('p'), {
          className: 'placeholder',
          textContent: 'Select a date range and click Apply.',
        }));
        return;
      }
      report = customRangeReport(data, _customStart, _customEnd);
    }
  } catch (e) {
    const errEl = document.createElement('p');
    errEl.style.color = 'var(--expense)';
    errEl.textContent = e.message;
    main.appendChild(errEl);
    return;
  }

  const { defaultCurrency } = data.settings;
  if (_mode === 'yearly') {
    renderYearlyReport(report, defaultCurrency, data, main);
  } else {
    renderSummaryReport(report, defaultCurrency, data, main);
  }
}

function buildReportsSidebar() {
  const sidebar = document.createElement('div');
  sidebar.className = 'view-sidebar';

  // --- Section 1: Period ---
  const periodSect = document.createElement('div');
  periodSect.className = 'view-sidebar-section';

  const periodLabel = document.createElement('span');
  periodLabel.className = 'view-sidebar-label';
  periodLabel.textContent = 'Period';
  periodSect.appendChild(periodLabel);

  const modeNav = document.createElement('div');
  modeNav.className = 'view-mode-nav';
  const reportModes = [['monthly', 'Monthly'], ['yearly', 'Yearly'], ['custom', 'Custom range'], ['all', 'All time']];
  for (const [rm, label] of reportModes) {
    const btn = document.createElement('button');
    btn.className = 'view-mode-btn' + (_mode === rm ? ' active' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => { _mode = rm; refresh(); });
    modeNav.appendChild(btn);
  }
  periodSect.appendChild(modeNav);

  const dateRow = document.createElement('div');
  dateRow.className = 'view-date-row';

  const modeSelect = document.createElement('select');
  modeSelect.className = 'view-mode-select';
  for (const [rm, label] of reportModes) {
    const opt = document.createElement('option');
    opt.value = rm; opt.textContent = label; opt.selected = _mode === rm;
    modeSelect.appendChild(opt);
  }
  modeSelect.addEventListener('change', e => { _mode = e.target.value; refresh(); });
  dateRow.appendChild(modeSelect);

  if (_mode !== 'all') {
    const periodNav = document.createElement('div');

    if (_mode === 'monthly') {
      periodNav.style.flex = '1';
      const MONTHS = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];
      const monthRow = document.createElement('div');
      monthRow.style.cssText = 'display:flex;gap:0.5rem';
      const monthSel = document.createElement('select');
      monthSel.style.cssText = 'flex:2;min-width:0';
      for (let i = 1; i <= 12; i++) {
        const opt = document.createElement('option');
        opt.value = i; opt.textContent = MONTHS[i - 1]; opt.selected = i === _month;
        monthSel.appendChild(opt);
      }
      const yearSel = document.createElement('select');
      yearSel.style.cssText = 'flex:1;min-width:0';
      for (const y of yearRange()) {
        const opt = document.createElement('option');
        opt.value = y; opt.textContent = y; opt.selected = y === _year;
        yearSel.appendChild(opt);
      }
      function onMonthYearChange() { _month = +monthSel.value; _year = +yearSel.value; refresh(); }
      monthSel.addEventListener('change', onMonthYearChange);
      yearSel.addEventListener('change', onMonthYearChange);
      monthRow.appendChild(monthSel);
      monthRow.appendChild(yearSel);
      periodNav.appendChild(monthRow);
    } else if (_mode === 'yearly') {
      periodNav.style.cssText = 'display:flex;align-items:center;gap:0.5rem;flex:1';
      periodNav.innerHTML = `
        <button class="btn btn-sm btn-secondary" id="prev-period">‹</button>
        <select id="sel-year" style="flex:1">
          ${yearRange().map(y => `<option ${_year === y ? 'selected' : ''}>${y}</option>`).join('')}
        </select>
        <button class="btn btn-sm btn-secondary" id="next-period">›</button>`;
      periodNav.querySelector('#sel-year').addEventListener('change', e => { _year = +e.target.value; refresh(); });
      periodNav.querySelector('#prev-period').addEventListener('click', () => { _year--; refresh(); });
      periodNav.querySelector('#next-period').addEventListener('click', () => { _year++; refresh(); });
    } else {
      periodNav.style.cssText = 'display:flex;flex-direction:column;gap:0.5rem;width:100%';
      periodNav.innerHTML = `
        <label style="font-size:0.875rem">From
          <input type="text" id="range-start" placeholder="Start date" autocomplete="off" style="display:block;margin-top:0.2rem;width:100%">
        </label>
        <label style="font-size:0.875rem">To
          <input type="text" id="range-end" placeholder="End date" autocomplete="off" style="display:block;margin-top:0.2rem;width:100%">
        </label>
        <button class="btn btn-sm btn-primary" id="apply-range" style="width:100%">Apply</button>`;
      periodNav.querySelector('#apply-range').addEventListener('click', () => {
        _customStart = periodNav.querySelector('#range-start').value;
        _customEnd = periodNav.querySelector('#range-end').value;
        refresh();
      });
      flatpickr(periodNav.querySelector('#range-start'), {
        dateFormat: 'Y-m-d',
        locale: { firstDayOfWeek: 1 },
        defaultDate: _customStart || null,
      });
      flatpickr(periodNav.querySelector('#range-end'), {
        dateFormat: 'Y-m-d',
        locale: { firstDayOfWeek: 1 },
        defaultDate: _customEnd || null,
      });
    }

    dateRow.appendChild(periodNav);
  }
  periodSect.appendChild(dateRow);
  sidebar.appendChild(periodSect);

  // --- Section 2: View ---
  const viewSect = document.createElement('div');
  viewSect.className = 'view-sidebar-section';

  const viewLabel = document.createElement('span');
  viewLabel.className = 'view-sidebar-label';
  viewLabel.textContent = 'View';
  viewSect.appendChild(viewLabel);

  const bdGroup = document.createElement('div');
  bdGroup.className = 'seg-group';
  bdGroup.style.width = '100%';

  const bdCat = document.createElement('button');
  bdCat.className = 'btn btn-sm ' + (_breakdown === 'category' ? 'btn-primary' : 'btn-secondary');
  bdCat.style.cssText = 'flex:1;justify-content:center';
  bdCat.textContent = 'By category';
  bdCat.addEventListener('click', () => { _breakdown = 'category'; refresh(); });

  const bdLbl = document.createElement('button');
  bdLbl.className = 'btn btn-sm ' + (_breakdown === 'label' ? 'btn-primary' : 'btn-secondary');
  bdLbl.style.cssText = 'flex:1;justify-content:center';
  bdLbl.textContent = 'By label';
  bdLbl.addEventListener('click', () => { _breakdown = 'label'; refresh(); });

  bdGroup.appendChild(bdCat);
  bdGroup.appendChild(bdLbl);
  viewSect.appendChild(bdGroup);
  sidebar.appendChild(viewSect);

  return sidebar;
}

function renderSummaryReport(report, currency, data, container) {
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
  container.appendChild(cards);

  const isCat = _breakdown === 'category';
  const items = isCat ? report.byCategory : report.byLabel;
  const nameKey = isCat ? 'categoryName' : 'labelName';
  const fallback = isCat ? '(uncategorized)' : '(no label)';
  const catsByName = isCat ? new Map(data.categories.map(c => [c.name, c])) : null;

  if (items.some(b => b.total !== 0)) {
    const chartWrap = document.createElement('div');
    chartWrap.className = 'card';
    chartWrap.style.cssText = 'padding:1.25rem;margin-bottom:1.5rem';
    chartWrap.innerHTML = '<canvas></canvas>';
    container.appendChild(chartWrap);
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

  if (items.length > 0) {
    renderBreakdownTable(items, nameKey, fallback, currency, container);
  } else {
    container.appendChild(Object.assign(document.createElement('p'), { className: 'placeholder', textContent: 'No transactions in this period.' }));
  }
}

function renderYearlyReport(report, currency, data, container) {
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
  container.appendChild(cards);

  const chartWrap = document.createElement('div');
  chartWrap.className = 'card';
  chartWrap.style.cssText = 'padding:1.25rem;margin-bottom:1.5rem';
  chartWrap.innerHTML = '<canvas height="120"></canvas>';
  container.appendChild(chartWrap);

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
    container.appendChild(pieWrap);
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
    renderBreakdownTable(items, nameKey, fallback, currency, container);
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

function renderBreakdownTable(items, nameKey, fallback, currency, container) {
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

  container.appendChild(section);
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
