import { getData } from '../../store.js';
import { monthlyReport, yearlyReport, customRangeReport, allTimeReport, cashFlowReport } from '../../reports.js';
import { escHtml } from '../utils.js';
import { isDark, onThemeChange } from '../theme.js';

let _container = null;
let _mode = 'monthly'; // monthly | yearly | cashflow | compare | custom | all

onThemeChange(() => { if (_container) refresh(); });
let _breakdown = 'category'; // category | label
let _breakdownTab = 'expenses'; // expenses | income
let _pctOfIncome = false;
let _year = new Date().getFullYear();
let _month = new Date().getMonth() + 1;
let _customStart = '';
let _customEnd = '';
let _cashFlowRange = 12; // 6 | 12 | 24

const _now = new Date();
const _thisYear = _now.getFullYear();
const _thisMonth = _now.getMonth() + 1;
const _prevMonth = _thisMonth === 1 ? 12 : _thisMonth - 1;
const _prevYear = _thisMonth === 1 ? _thisYear - 1 : _thisYear;
let _compareA = { year: _prevYear, month: _prevMonth };
let _compareB = { year: _thisYear, month: _thisMonth };

let _chartInstances = [];
let _fpInstances = [];

export function render(container) {
  _container = container;
  refresh();
}

function refresh() {
  _chartInstances.forEach(c => c.destroy());
  _chartInstances = [];
  _fpInstances.forEach(fp => fp.destroy());
  _fpInstances = [];
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
  const { defaultCurrency } = data.settings;

  if (_mode === 'cashflow') {
    const today = new Date();
    const to = today.toISOString().slice(0, 10);
    const fromDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (_cashFlowRange - 1), 1));
    const from = fromDate.toISOString().slice(0, 10);
    const cfData = cashFlowReport(data, from, to);
    renderCashFlowReport(cfData, defaultCurrency, main);
    return;
  }

  if (_mode === 'compare') {
    const rA = monthlyReport(data, _compareA.year, _compareA.month);
    const rB = monthlyReport(data, _compareB.year, _compareB.month);
    renderCompareReport(rA, rB, _compareA, _compareB, defaultCurrency, data, main);
    return;
  }

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
  const reportModes = [
    ['monthly', 'Monthly'],
    ['yearly', 'Yearly'],
    ['cashflow', 'Cash Flow'],
    ['compare', 'Compare'],
    ['custom', 'Custom range'],
    ['all', 'All time'],
  ];
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

  if (_mode === 'cashflow') {
    const rangeGroup = document.createElement('div');
    rangeGroup.className = 'seg-group';
    rangeGroup.style.cssText = 'flex:1;margin-top:0.5rem';
    for (const [val, label] of [[6, '6 mo'], [12, '12 mo'], [24, '24 mo']]) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm ' + (_cashFlowRange === val ? 'btn-primary' : 'btn-secondary');
      btn.style.cssText = 'flex:1;justify-content:center';
      btn.textContent = label;
      btn.addEventListener('click', () => { _cashFlowRange = val; refresh(); });
      rangeGroup.appendChild(btn);
    }
    dateRow.appendChild(rangeGroup);
  } else if (_mode === 'compare') {
    const compareNav = document.createElement('div');
    compareNav.style.cssText = 'display:flex;flex-direction:column;gap:0.75rem;width:100%;margin-top:0.5rem';
    compareNav.appendChild(buildMonthPicker('Period A', _compareA, v => { _compareA = v; refresh(); }));
    compareNav.appendChild(buildMonthPicker('Period B', _compareB, v => { _compareB = v; refresh(); }));
    dateRow.appendChild(compareNav);
  } else if (_mode !== 'all') {
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
      _fpInstances.push(flatpickr(periodNav.querySelector('#range-start'), {
        dateFormat: 'Y-m-d',
        locale: { firstDayOfWeek: 1 },
        defaultDate: _customStart || null,
      }));
      _fpInstances.push(flatpickr(periodNav.querySelector('#range-end'), {
        dateFormat: 'Y-m-d',
        locale: { firstDayOfWeek: 1 },
        defaultDate: _customEnd || null,
      }));
    }

    dateRow.appendChild(periodNav);
  }
  periodSect.appendChild(dateRow);
  sidebar.appendChild(periodSect);

  // --- Section 2: View (hidden for cashflow/compare modes) ---
  if (_mode !== 'cashflow' && _mode !== 'compare') {
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

    // Expenses / Income tab toggle
    const tabGroup = document.createElement('div');
    tabGroup.className = 'seg-group';
    tabGroup.style.cssText = 'width:100%;margin-top:0.5rem';

    const tabExp = document.createElement('button');
    tabExp.className = 'btn btn-sm ' + (_breakdownTab === 'expenses' ? 'btn-primary' : 'btn-secondary');
    tabExp.style.cssText = 'flex:1;justify-content:center';
    tabExp.textContent = 'Expenses';
    tabExp.addEventListener('click', () => { _breakdownTab = 'expenses'; _pctOfIncome = false; refresh(); });

    const tabInc = document.createElement('button');
    tabInc.className = 'btn btn-sm ' + (_breakdownTab === 'income' ? 'btn-primary' : 'btn-secondary');
    tabInc.style.cssText = 'flex:1;justify-content:center';
    tabInc.textContent = 'Income';
    tabInc.addEventListener('click', () => { _breakdownTab = 'income'; _pctOfIncome = false; refresh(); });

    tabGroup.appendChild(tabExp);
    tabGroup.appendChild(tabInc);
    viewSect.appendChild(tabGroup);

    sidebar.appendChild(viewSect);
  }

  return sidebar;
}

function buildMonthPicker(labelText, value, onChange) {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:0.25rem';

  const lbl = document.createElement('span');
  lbl.style.cssText = 'font-size:0.75rem;color:var(--text-muted);font-weight:600';
  lbl.textContent = labelText;
  wrap.appendChild(lbl);

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:0.5rem';

  const monthSel = document.createElement('select');
  monthSel.style.cssText = 'flex:2;min-width:0';
  for (let i = 1; i <= 12; i++) {
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = MONTHS[i - 1]; opt.selected = i === value.month;
    monthSel.appendChild(opt);
  }

  const yearSel = document.createElement('select');
  yearSel.style.cssText = 'flex:1;min-width:0';
  for (const y of yearRange()) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y; opt.selected = y === value.year;
    yearSel.appendChild(opt);
  }

  function onPickerChange() { onChange({ year: +yearSel.value, month: +monthSel.value }); }
  monthSel.addEventListener('change', onPickerChange);
  yearSel.addEventListener('change', onPickerChange);

  row.appendChild(monthSel);
  row.appendChild(yearSel);
  wrap.appendChild(row);
  return wrap;
}

function filterItems(items) {
  return items.filter(b => _breakdownTab === 'expenses' ? b.total < 0 : b.total > 0);
}

function renderSummaryReport(report, currency, data, container) {
  const netCls = report.net >= 0 ? 'amount-income' : 'amount-expense';
  const netSign = report.net >= 0 ? '+' : '-';
  const bar = document.createElement('div');
  bar.className = 'summary-bar';
  bar.innerHTML = `
    <div class="summary-bar-item">
      <span class="summary-bar-label">Income</span>
      <span class="summary-bar-value amount-income">+${escHtml(fmt(report.income, currency))}</span>
    </div>
    <div class="summary-bar-item">
      <span class="summary-bar-label">Expenses</span>
      <span class="summary-bar-value amount-expense">-${escHtml(fmt(Math.abs(report.expenses), currency))}</span>
    </div>
    <div class="summary-bar-item">
      <span class="summary-bar-label">Net</span>
      <span class="summary-bar-value ${netCls}">${netSign}${escHtml(fmt(Math.abs(report.net), currency))}</span>
    </div>
  `;
  container.appendChild(bar);

  const isCat = _breakdown === 'category';
  const rawItems = isCat ? report.byCategory : report.byLabel;
  const items = filterItems(rawItems);
  const nameKey = isCat ? 'categoryName' : 'labelName';
  const fallback = isCat ? '(uncategorized)' : '(no label)';
  const catsByName = isCat ? new Map(data.categories.map(c => [c.name, c])) : null;

  if (items.some(b => b.total !== 0)) {
    const chartWrap = document.createElement('div');
    chartWrap.className = 'card';
    chartWrap.style.cssText = 'padding:1.25rem;margin-bottom:1.5rem';
    chartWrap.innerHTML = '<canvas></canvas>';
    container.appendChild(chartWrap);
    const pieLabelColor = isDark() ? '#9896b8' : '#78716c';
    _chartInstances.push(new Chart(chartWrap.querySelector('canvas').getContext('2d'), {
      type: 'pie',
      data: buildPieChartData(items, nameKey, fallback, catsByName),
      options: {
        responsive: true,
        aspectRatio: 2.5,
        plugins: { legend: { display: true, position: 'right', labels: { color: pieLabelColor } } },
      },
    }));
  }

  if (items.length > 0) {
    renderPctToggle(container, report.income);
    renderBreakdownTable(items, nameKey, fallback, currency, container, _pctOfIncome ? report.income : 0);
  } else {
    container.appendChild(Object.assign(document.createElement('p'), { className: 'placeholder', textContent: 'No transactions in this period.' }));
  }
}

function renderYearlyReport(report, currency, data, container) {
  const totalNetCls = report.total.net >= 0 ? 'amount-income' : 'amount-expense';
  const totalNetSign = report.total.net >= 0 ? '+' : '-';
  const totalBar = document.createElement('div');
  totalBar.className = 'summary-bar';
  totalBar.innerHTML = `
    <div class="summary-bar-item">
      <span class="summary-bar-label">Income</span>
      <span class="summary-bar-value amount-income">+${escHtml(fmt(report.total.income, currency))}</span>
    </div>
    <div class="summary-bar-item">
      <span class="summary-bar-label">Expenses</span>
      <span class="summary-bar-value amount-expense">-${escHtml(fmt(Math.abs(report.total.expenses), currency))}</span>
    </div>
    <div class="summary-bar-item">
      <span class="summary-bar-label">Net</span>
      <span class="summary-bar-value ${totalNetCls}">${totalNetSign}${escHtml(fmt(Math.abs(report.total.net), currency))}</span>
    </div>
  `;
  container.appendChild(totalBar);

  const chartWrap = document.createElement('div');
  chartWrap.className = 'card';
  chartWrap.style.cssText = 'padding:1.25rem;margin-bottom:1.5rem';
  chartWrap.innerHTML = '<canvas height="120"></canvas>';
  container.appendChild(chartWrap);

  const dark = isDark();
  const incomeColor  = dark ? '#4ade80' : '#15803d88';
  const incomeEdge   = dark ? '#4ade80' : '#15803d';
  const expenseColor = dark ? '#f87171' : '#b91c1c88';
  const expenseEdge  = dark ? '#f87171' : '#b91c1c';
  const gridColor    = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
  const labelColor   = dark ? '#9896b8' : '#78716c';
  _chartInstances.push(new Chart(chartWrap.querySelector('canvas').getContext('2d'), {
    type: 'bar',
    data: {
      labels: months(),
      datasets: [
        {
          label: 'Income',
          data: report.months.map(m => m.income),
          backgroundColor: incomeColor,
          borderColor: incomeEdge,
          borderWidth: 1,
        },
        {
          label: 'Expenses',
          data: report.months.map(m => Math.abs(m.expenses)),
          backgroundColor: expenseColor,
          borderColor: expenseEdge,
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true, labels: { color: labelColor } } },
      scales: {
        y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: labelColor } },
        x: { grid: { color: gridColor }, ticks: { color: labelColor } },
      },
    },
  }));

  const isCat = _breakdown === 'category';
  const rawItems = isCat ? report.byCategory : report.byLabel;
  const items = filterItems(rawItems);
  const nameKey = isCat ? 'categoryName' : 'labelName';
  const fallback = isCat ? '(uncategorized)' : '(no label)';
  const catsByName = isCat ? new Map(data.categories.map(c => [c.name, c])) : null;

  if (items.some(b => b.total !== 0)) {
    const pieWrap = document.createElement('div');
    pieWrap.className = 'card';
    pieWrap.style.cssText = 'padding:1.25rem;margin-bottom:1.5rem';
    pieWrap.innerHTML = '<canvas></canvas>';
    container.appendChild(pieWrap);
    const pieLabelColorY = isDark() ? '#9896b8' : '#78716c';
    _chartInstances.push(new Chart(pieWrap.querySelector('canvas').getContext('2d'), {
      type: 'pie',
      data: buildPieChartData(items, nameKey, fallback, catsByName),
      options: {
        responsive: true,
        aspectRatio: 2.5,
        plugins: { legend: { display: true, position: 'right', labels: { color: pieLabelColorY } } },
      },
    }));
  }

  if (items.length > 0) {
    renderPctToggle(container, report.total.income);
    renderBreakdownTable(items, nameKey, fallback, currency, container, _pctOfIncome ? report.total.income : 0);
  }
}

function renderPctToggle(container, income) {
  if (_breakdownTab !== 'expenses') return;
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:0.6rem;margin-bottom:0.75rem';

  const track = document.createElement('button');
  track.setAttribute('role', 'switch');
  track.setAttribute('aria-checked', String(_pctOfIncome));
  track.title = '% of income';
  track.style.cssText = `
    width:2rem;height:1.125rem;border-radius:999px;border:none;cursor:pointer;padding:0;
    background:${_pctOfIncome ? 'var(--primary)' : 'var(--border)'};
    position:relative;transition:background 0.15s;flex-shrink:0;
  `;
  const thumb = document.createElement('span');
  thumb.style.cssText = `
    position:absolute;top:2px;width:0.75rem;height:0.75rem;border-radius:50%;
    background:#fff;transition:left 0.15s;
    left:${_pctOfIncome ? 'calc(100% - 0.875rem)' : '2px'};
  `;
  track.appendChild(thumb);
  track.addEventListener('click', () => { _pctOfIncome = !_pctOfIncome; refresh(); });

  const lbl = document.createElement('span');
  lbl.style.cssText = 'font-size:0.8125rem;color:var(--text-muted)';
  lbl.textContent = '% of income';

  row.appendChild(track);
  row.appendChild(lbl);
  container.appendChild(row);
}

function renderCashFlowReport(cfData, currency, container) {
  if (cfData.length === 0) {
    container.appendChild(Object.assign(document.createElement('p'), { className: 'placeholder', textContent: 'No data available.' }));
    return;
  }

  const totalIncome = cfData.reduce((s, m) => s + m.income, 0);
  const totalExpenses = cfData.reduce((s, m) => s + m.expenses, 0);
  const totalNet = totalIncome + totalExpenses;
  const netCls = totalNet >= 0 ? 'amount-income' : 'amount-expense';
  const netSign = totalNet >= 0 ? '+' : '-';

  const bar = document.createElement('div');
  bar.className = 'summary-bar';
  bar.innerHTML = `
    <div class="summary-bar-item">
      <span class="summary-bar-label">Income</span>
      <span class="summary-bar-value amount-income">+${escHtml(fmt(totalIncome, currency))}</span>
    </div>
    <div class="summary-bar-item">
      <span class="summary-bar-label">Expenses</span>
      <span class="summary-bar-value amount-expense">-${escHtml(fmt(Math.abs(totalExpenses), currency))}</span>
    </div>
    <div class="summary-bar-item">
      <span class="summary-bar-label">Net</span>
      <span class="summary-bar-value ${netCls}">${netSign}${escHtml(fmt(Math.abs(totalNet), currency))}</span>
    </div>
  `;
  container.appendChild(bar);

  const chartWrap = document.createElement('div');
  chartWrap.className = 'card';
  chartWrap.style.cssText = 'padding:1.25rem;margin-bottom:1.5rem';
  chartWrap.innerHTML = '<canvas height="140"></canvas>';
  container.appendChild(chartWrap);

  const dark = isDark();
  const incomeColor  = dark ? '#4ade8088' : '#15803d88';
  const incomeEdge   = dark ? '#4ade80' : '#15803d';
  const expenseColor = dark ? '#f8717188' : '#b91c1c88';
  const expenseEdge  = dark ? '#f87171' : '#b91c1c';
  const netLineColor = dark ? '#818cf8' : '#5055d8';
  const gridColor    = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
  const labelColor   = dark ? '#9896b8' : '#78716c';

  const labels = cfData.map(m =>
    new Date(m.month + '-01T00:00:00Z').toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' })
  );

  _chartInstances.push(new Chart(chartWrap.querySelector('canvas').getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Income',
          data: cfData.map(m => m.income),
          backgroundColor: incomeColor,
          borderColor: incomeEdge,
          borderWidth: 1,
          order: 2,
        },
        {
          label: 'Expenses',
          data: cfData.map(m => Math.abs(m.expenses)),
          backgroundColor: expenseColor,
          borderColor: expenseEdge,
          borderWidth: 1,
          order: 2,
        },
        {
          label: 'Net balance',
          type: 'line',
          data: cfData.map(m => m.cumulative),
          borderColor: netLineColor,
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: netLineColor,
          tension: 0.3,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      onClick: (_, elements) => {
        if (elements.length > 0) {
          window.location.hash = '#transactions';
        }
      },
      plugins: { legend: { display: true, labels: { color: labelColor } } },
      scales: {
        y: { beginAtZero: false, grid: { color: gridColor }, ticks: { color: labelColor } },
        x: { grid: { color: gridColor }, ticks: { color: labelColor } },
      },
    },
  }));
}

function renderCompareReport(rA, rB, specA, specB, currency, data, container) {
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const labelA = `${MONTHS_SHORT[specA.month - 1]} ${specA.year}`;
  const labelB = `${MONTHS_SHORT[specB.month - 1]} ${specB.year}`;

  // Two-column summary
  const summaryWrap = document.createElement('div');
  summaryWrap.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1.5rem';

  for (const [r, label, isPrimary] of [[rA, labelA, false], [rB, labelB, true]]) {
    const netCls = r.net >= 0 ? 'amount-income' : 'amount-expense';
    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = `padding:1rem;${isPrimary ? 'border-color:var(--primary)' : ''}`;
    card.innerHTML = `
      <div style="font-size:0.75rem;font-weight:600;color:${isPrimary ? 'var(--primary)' : 'var(--text-muted)'};margin-bottom:0.5rem">${escHtml(label)}</div>
      <div style="font-size:0.8125rem;color:var(--text-muted)">Income</div>
      <div class="amount-income" style="font-weight:600;margin-bottom:0.25rem">${escHtml(fmt(r.income, currency))}</div>
      <div style="font-size:0.8125rem;color:var(--text-muted)">Expenses</div>
      <div class="amount-expense" style="font-weight:600;margin-bottom:0.25rem">${escHtml(fmt(Math.abs(r.expenses), currency))}</div>
      <div style="font-size:0.8125rem;color:var(--text-muted)">Net</div>
      <div class="${netCls}" style="font-weight:600">${escHtml(fmt(r.net, currency))}</div>
    `;
    summaryWrap.appendChild(card);
  }
  container.appendChild(summaryWrap);

  const isCat = _breakdown === 'category';
  const nameKey = isCat ? 'categoryName' : 'labelName';
  const diff = diffBreakdown(rA.byCategory, rB.byCategory, nameKey);

  if (diff.length === 0) {
    container.appendChild(Object.assign(document.createElement('p'), { className: 'placeholder', textContent: 'No expense data to compare.' }));
    return;
  }

  // Grouped bar chart — top 8 categories
  const chartItems = diff.slice(0, 8);
  const chartWrap = document.createElement('div');
  chartWrap.className = 'card';
  chartWrap.style.cssText = 'padding:1.25rem;margin-bottom:1.5rem';
  chartWrap.innerHTML = '<canvas height="140"></canvas>';
  container.appendChild(chartWrap);

  const dark = isDark();
  const colorA   = dark ? '#9896b8' : '#a5b4fc';
  const colorB   = dark ? '#818cf8' : '#5055d8';
  const gridColor  = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
  const labelColor = dark ? '#9896b8' : '#78716c';

  const catsByName = isCat ? new Map(data.categories.map(c => [c.name, c])) : null;
  const chartLabels = chartItems.map(d => {
    const icon = catsByName?.get(d.name)?.icon;
    return icon ? `${icon} ${d.name}` : (d.name ?? '(uncategorized)');
  });

  _chartInstances.push(new Chart(chartWrap.querySelector('canvas').getContext('2d'), {
    type: 'bar',
    data: {
      labels: chartLabels,
      datasets: [
        { label: labelA, data: chartItems.map(d => Math.abs(d.amtA)), backgroundColor: colorA },
        { label: labelB, data: chartItems.map(d => Math.abs(d.amtB)), backgroundColor: colorB },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true, labels: { color: labelColor } } },
      scales: {
        y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: labelColor } },
        x: { grid: { color: gridColor }, ticks: { color: labelColor } },
      },
    },
  }));

  // Delta table
  const section = document.createElement('div');
  section.className = 'card';
  section.style.overflow = 'hidden';

  const title = document.createElement('div');
  title.style.cssText = 'padding:0.75rem 1rem;border-bottom:1px solid var(--border);font-weight:600;font-size:0.875rem';
  title.textContent = 'By category';
  section.appendChild(title);

  const tableWrap = document.createElement('div');
  tableWrap.style.cssText = 'overflow-x:auto';
  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.8125rem';

  const thead = document.createElement('thead');
  thead.innerHTML = `<tr style="color:var(--text-muted);border-bottom:1px solid var(--border)">
    <th style="text-align:left;padding:0.5rem 1rem;font-weight:600">Category</th>
    <th style="text-align:right;padding:0.5rem 0.75rem;font-weight:600">${escHtml(labelA)}</th>
    <th style="text-align:right;padding:0.5rem 0.75rem;font-weight:600">${escHtml(labelB)}</th>
    <th style="text-align:right;padding:0.5rem 1rem;font-weight:600">Δ</th>
  </tr>`;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const d of diff) {
    const icon = catsByName?.get(d.name)?.icon ?? '';
    let delta;
    let deltaCls = '';
    if (d.amtA === 0) {
      delta = 'new';
      deltaCls = 'color:var(--text-muted)';
    } else if (d.amtB === 0) {
      delta = 'gone';
      deltaCls = 'color:var(--text-muted)';
    } else {
      const pct = Math.round((Math.abs(d.amtB) - Math.abs(d.amtA)) / Math.abs(d.amtA) * 100);
      delta = (pct >= 0 ? '+' : '') + pct + '%';
      deltaCls = pct > 0 ? 'color:#b91c1c;font-weight:600' : 'color:#15803d;font-weight:600';
    }
    const tr = document.createElement('tr');
    tr.style.cssText = 'border-top:1px solid var(--border)';
    tr.innerHTML = `
      <td style="padding:0.5rem 1rem">${icon ? icon + ' ' : ''}${escHtml(d.name ?? '(uncategorized)')}</td>
      <td class="amount-expense" style="text-align:right;padding:0.5rem 0.75rem">${d.amtA !== 0 ? escHtml(fmt(Math.abs(d.amtA), currency)) : '—'}</td>
      <td class="amount-expense" style="text-align:right;padding:0.5rem 0.75rem">${d.amtB !== 0 ? escHtml(fmt(Math.abs(d.amtB), currency)) : '—'}</td>
      <td style="text-align:right;padding:0.5rem 1rem;${deltaCls}">${escHtml(delta)}</td>
    `;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  section.appendChild(tableWrap);
  container.appendChild(section);
}

function diffBreakdown(itemsA, itemsB, nameKey) {
  const mapA = new Map(itemsA.filter(x => x.total < 0).map(x => [x[nameKey], x.total]));
  const mapB = new Map(itemsB.filter(x => x.total < 0).map(x => [x[nameKey], x.total]));
  const names = new Set([...mapA.keys(), ...mapB.keys()]);
  return [...names]
    .map(name => ({ name, amtA: mapA.get(name) ?? 0, amtB: mapB.get(name) ?? 0 }))
    .sort((a, b) => Math.abs(b.amtB) - Math.abs(a.amtB));
}

const PIE_COLORS_LIGHT = [
  '#6366f1', '#0d9488', '#f59e0b', '#db2777', '#16a34a', '#9333ea',
  '#ea580c', '#2563eb', '#ca8a04', '#dc2626', '#0891b2', '#be185d',
];
const PIE_COLORS_DARK = [
  '#a5b4fc', '#2dd4bf', '#fcd34d', '#f472b6', '#4ade80', '#c084fc',
  '#fdba74', '#60a5fa', '#fde047', '#f87171', '#22d3ee', '#fb7185',
];

function buildPieChartData(items, nameKey, fallback, catsByName) {
  const dark = isDark();
  const colors = dark ? PIE_COLORS_DARK : PIE_COLORS_LIGHT;
  const labelColor = dark ? '#9896b8' : '#78716c';
  const borderColor = dark ? '#1d1c2b' : '#fff';
  const sorted = [...items].filter(b => b.total !== 0).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  return {
    labels: sorted.map(b => {
      const name = b[nameKey] ?? fallback;
      const icon = catsByName?.get(name)?.icon;
      return icon ? `${icon} ${name}` : name;
    }),
    datasets: [{
      data: sorted.map(b => Math.abs(b.total)),
      backgroundColor: sorted.map((_, i) => colors[i % colors.length]),
      borderColor,
      borderWidth: 1,
    }],
  };
}

function renderBreakdownTable(items, nameKey, fallback, currency, container, incomeTotal = 0) {
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

  const showPct = incomeTotal > 0 && _pctOfIncome;
  const sorted = [...items].sort((a, b) => a.total - b.total);
  for (const b of sorted) {
    const name = b[nameKey] ?? fallback;
    const icon = isCatBreakdown ? (catsByName.get(name)?.icon ?? '') : '';
    const pct = showPct ? Math.round(Math.abs(b.total) / incomeTotal * 100) : null;
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `
      <span style="flex:1">${icon ? icon + ' ' : ''}${escHtml(name)}</span>
      <span style="color:var(--text-muted);font-size:0.8rem;margin-right:1rem">${b.count} transaction${b.count !== 1 ? 's' : ''}</span>
      ${pct !== null ? `<span style="color:var(--text-muted);font-size:0.8rem;margin-right:0.75rem">${pct}%</span>` : ''}
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
