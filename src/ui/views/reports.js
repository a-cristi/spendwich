import { getData } from '../../store.js';
import { monthlyReport, yearlyReport, customRangeReport, allTimeReport, cashFlowReport, categoryTrendReport, detectSpikes, incomeTrendReport } from '../../reports.js';
import { escHtml } from '../utils.js';
import { isDark, onThemeChange } from '../theme.js';

let _container = null;
let _reportType = 'summary'; // summary | compare
let _mode = 'monthly';       // monthly | yearly | custom | all  (period, summary only)
let _compareMode = 'monthly'; // monthly | yearly  (compare only)

onThemeChange(() => { if (_container) refresh(); });
let _breakdown = 'category'; // category | label
let _breakdownTab = 'expenses'; // expenses | income
let _year = new Date().getFullYear();
let _month = 0; // 0 = "Last month" (rolling); 1–12 = calendar month
let _customStart = '';
let _customEnd = '';

const _now = new Date();
const _thisYear = _now.getFullYear();
const _thisMonth = _now.getMonth() + 1;
const _prevMonth = _thisMonth === 1 ? 12 : _thisMonth - 1;
const _prevYear = _thisMonth === 1 ? _thisYear - 1 : _thisYear;
let _compareA = { year: _prevYear, month: _prevMonth };
let _compareB = { year: _thisYear, month: _thisMonth };

let _trendCategoryId = null;
let _trendCategoryName = '';
let _trendCategoryIcon = '';
let _trendPctMode = false;

let _chartInstances = [];
let _fpInstances = [];

export function render(container) {
  _container = container;
  const overflowMenu = document.querySelector('.nav-overflow-menu');
  if (overflowMenu) { overflowMenu.innerHTML = ''; overflowMenu.classList.remove('active'); }
  const overflowTrigger = document.querySelector('.nav-overflow-trigger');
  if (overflowTrigger) overflowTrigger.style.display = 'none';
  refresh();
}

function refresh() {
  _chartInstances.forEach(c => c.destroy());
  _chartInstances = [];
  _fpInstances.forEach(fp => fp.destroy());
  _fpInstances = [];
  _container.innerHTML = '';

  const refreshNow = new Date();
  const _todayYear = refreshNow.getUTCFullYear();
  const _todayMonth = refreshNow.getUTCMonth() + 1;
  const _todayDay = refreshNow.getUTCDate();
  const _todayStr = refreshNow.toISOString().slice(0, 10);
  const _isRollingMonth = _mode === 'monthly' && _month === 0;
  const _isYTD = _mode === 'yearly' && _year === _todayYear;

  const fmtPeriodDate = s => new Date(s + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  let periodSubtitle;
  if (_mode === 'monthly' && _isRollingMonth) {
    const fromStr = rollingMonthStart(_todayYear, _todayMonth, _todayDay).toISOString().slice(0, 10);
    periodSubtitle = `${fmtPeriodDate(fromStr)} – ${fmtPeriodDate(_todayStr)}`;
  } else if (_mode === 'monthly' && _month >= 1) {
    periodSubtitle = `${monthsFull()[_month - 1]} ${_year}`;
  } else if (_mode === 'yearly' && _isYTD) {
    periodSubtitle = `Jan 1 – ${fmtPeriodDate(_todayStr)}`;
  } else if (_mode === 'yearly') {
    periodSubtitle = `${_year}`;
  } else if (_mode === 'custom' && _customStart && _customEnd) {
    periodSubtitle = `${fmtPeriodDate(_customStart)} – ${fmtPeriodDate(_customEnd)}`;
  } else {
    periodSubtitle = 'Understand your spending patterns';
  }

  const cardPeriodLabel = _mode === 'all' ? 'all time' : periodSubtitle;

  const header = document.createElement('div');
  header.className = 'page-header';
  header.innerHTML = `<div class="page-title-block"><h1>Reports</h1><p class="page-subtitle">${escHtml(periodSubtitle)}</p></div>`;
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

  if (_trendCategoryId !== null) {
    renderCategoryTrend(data, defaultCurrency, main);
    return;
  }

  if (_reportType === 'compare') {
    let rA, rB;
    if (_compareMode === 'yearly') {
      const yA = yearlyReport(data, _compareA.year);
      const yB = yearlyReport(data, _compareB.year);
      rA = { income: yA.total.income, expenses: yA.total.expenses, net: yA.total.net, byCategory: yA.byCategory, byLabel: yA.byLabel };
      rB = { income: yB.total.income, expenses: yB.total.expenses, net: yB.total.net, byCategory: yB.byCategory, byLabel: yB.byLabel };
    } else {
      rA = monthlyReport(data, _compareA.year, _compareA.month);
      rB = monthlyReport(data, _compareB.year, _compareB.month);
    }
    renderCompareReport(rA, rB, _compareA, _compareB, defaultCurrency, data, main);
    return;
  }

  let report;
  try {
    if (_mode === 'monthly') {
      report = _isRollingMonth
        ? customRangeReport(data, rollingMonthStart(_todayYear, _todayMonth, _todayDay).toISOString().slice(0, 10), _todayStr)
        : monthlyReport(data, _year, _month);
    } else if (_mode === 'yearly') {
      report = _isYTD
        ? customRangeReport(data, `${_year}-01-01`, _todayStr)
        : yearlyReport(data, _year);
    } else if (_mode === 'all') {
      report = allTimeReport(data);
    } else {
      if (!_customStart || !_customEnd) {
        main.appendChild(Object.assign(document.createElement('p'), {
          className: 'placeholder',
          textContent: 'Select a date range.',
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

  if (_mode === 'yearly' && !_isYTD) {
    renderYearlyReport(report, defaultCurrency, data, main, cardPeriodLabel);
  } else {
    renderSummaryReport(report, defaultCurrency, data, main, cardPeriodLabel);
  }
}

function buildViewTabToggles() {
  const tabGroup = document.createElement('div');
  tabGroup.className = 'seg-group';
  tabGroup.style.width = '100%';
  const tabExp = document.createElement('button');
  tabExp.className = 'btn btn-sm ' + (_breakdownTab === 'expenses' ? 'btn-primary' : 'btn-secondary');
  tabExp.style.cssText = 'flex:1;justify-content:center';
  tabExp.textContent = 'Expenses';
  tabExp.addEventListener('click', () => { _breakdownTab = 'expenses'; refresh(); });
  const tabInc = document.createElement('button');
  tabInc.className = 'btn btn-sm ' + (_breakdownTab === 'income' ? 'btn-primary' : 'btn-secondary');
  tabInc.style.cssText = 'flex:1;justify-content:center';
  tabInc.textContent = 'Income';
  tabInc.addEventListener('click', () => { _breakdownTab = 'income'; refresh(); });
  tabGroup.appendChild(tabExp);
  tabGroup.appendChild(tabInc);
  return tabGroup;
}

function makeSection(labelText) {
  const sect = document.createElement('div');
  sect.className = 'view-sidebar-section';
  const lbl = document.createElement('span');
  lbl.className = 'view-sidebar-label';
  lbl.textContent = labelText;
  sect.appendChild(lbl);
  return sect;
}

function makeSegGroup(items, activeKey, onClick) {
  const group = document.createElement('div');
  group.className = 'seg-group';
  group.style.width = '100%';
  for (const [key, label] of items) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-sm ' + (activeKey === key ? 'btn-primary' : 'btn-secondary');
    btn.style.cssText = 'flex:1;justify-content:center';
    btn.textContent = label;
    btn.addEventListener('click', () => onClick(key));
    group.appendChild(btn);
  }
  return group;
}

function buildReportsSidebar() {
  const sidebar = document.createElement('div');
  sidebar.className = 'view-sidebar';

  // --- Section: Report type ---
  const reportSect = makeSection('Report');
  reportSect.appendChild(makeSegGroup(
    [['summary', 'Summary'], ['compare', 'Compare']],
    _reportType,
    rt => { _reportType = rt; _trendCategoryId = null; _trendPctMode = false; refresh(); }
  ));
  sidebar.appendChild(reportSect);

  if (_reportType === 'compare') {
    // --- Section: Compare mode ---
    const compareSect = makeSection('Compare');
    compareSect.appendChild(makeSegGroup(
      [['monthly', 'Month'], ['yearly', 'Year']],
      _compareMode,
      cm => {
        if (_compareMode === cm) return;
        _compareMode = cm;
        if (cm === 'yearly') {
          _compareA = { year: _thisYear - 1 };
          _compareB = { year: _thisYear };
        } else {
          _compareA = { year: _prevYear, month: _prevMonth };
          _compareB = { year: _thisYear, month: _thisMonth };
        }
        refresh();
      }
    ));
    sidebar.appendChild(compareSect);

    // --- Section: Period A ---
    const sectA = makeSection('Period A');
    if (_compareMode === 'yearly') {
      sectA.appendChild(buildYearPicker(_compareA.year, y => { _compareA = { year: y }; refresh(); }));
    } else {
      sectA.appendChild(buildMonthPicker(_compareA, v => { _compareA = v; refresh(); }));
    }
    sidebar.appendChild(sectA);

    // --- Section: Period B ---
    const sectB = makeSection('Period B');
    if (_compareMode === 'yearly') {
      sectB.appendChild(buildYearPicker(_compareB.year, y => { _compareB = { year: y }; refresh(); }));
    } else {
      sectB.appendChild(buildMonthPicker(_compareB, v => { _compareB = v; refresh(); }));
    }
    sidebar.appendChild(sectB);

    return sidebar;
  }

  // --- Section: Period ---
  const periodSect = makeSection('Period');

  const periodModes = [['monthly', 'Month'], ['yearly', 'Year'], ['custom', 'Custom'], ['all', 'All time']];
  const modeNav = document.createElement('div');
  modeNav.className = 'view-mode-nav';
  for (const [rm, label] of periodModes) {
    const btn = document.createElement('button');
    btn.className = 'view-mode-btn' + (_mode === rm ? ' active' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => { _mode = rm; refresh(); });
    modeNav.appendChild(btn);
  }
  periodSect.appendChild(modeNav);

  const modeSelect = document.createElement('select');
  modeSelect.className = 'view-mode-select';
  for (const [rm, label] of periodModes) {
    const opt = document.createElement('option');
    opt.value = rm; opt.textContent = label; opt.selected = _mode === rm;
    modeSelect.appendChild(opt);
  }
  modeSelect.addEventListener('change', e => { _mode = e.target.value; refresh(); });
  periodSect.appendChild(modeSelect);

  if (_mode !== 'all') {
    if (_mode === 'monthly') {
      const MONTHS = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];
      const monthRow = document.createElement('div');
      monthRow.style.cssText = 'display:flex;gap:0.5rem';
      const monthSel = document.createElement('select');
      monthSel.style.flex = '1';
      const rollingOpt = document.createElement('option');
      rollingOpt.value = '0';
      rollingOpt.textContent = 'Last month';
      rollingOpt.selected = _month === 0;
      monthSel.appendChild(rollingOpt);
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
      function onMonthYearChange() { _month = +monthSel.value; _year = +yearSel.value; refresh(); }
      monthSel.addEventListener('change', onMonthYearChange);
      yearSel.addEventListener('change', onMonthYearChange);
      monthRow.appendChild(monthSel);
      monthRow.appendChild(yearSel);
      periodSect.appendChild(monthRow);
      if (_month === 0) {
        const hint = document.createElement('div');
        hint.style.cssText = 'font-size:0.7rem;color:var(--text-muted);margin-top:0.25rem';
        const smNow = new Date();
        const fromStr = rollingMonthStart(smNow.getUTCFullYear(), smNow.getUTCMonth() + 1, smNow.getUTCDate()).toISOString().slice(0, 10);
        const toStr = smNow.toISOString().slice(0, 10);
        const fmtD = s => new Date(s + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
        hint.textContent = `${fmtD(fromStr)} – ${fmtD(toStr)}`;
        periodSect.appendChild(hint);
      }
    } else if (_mode === 'yearly') {
      const yearRow = document.createElement('div');
      yearRow.style.cssText = 'display:flex;align-items:center;gap:0.5rem';
      yearRow.innerHTML = `
        <button class="btn btn-sm btn-secondary" id="prev-period">‹</button>
        <select id="sel-year" style="flex:1">
          ${yearRange().map(y => `<option ${_year === y ? 'selected' : ''}>${y}</option>`).join('')}
        </select>
        <button class="btn btn-sm btn-secondary" id="next-period">›</button>`;
      yearRow.querySelector('#sel-year').addEventListener('change', e => { _year = +e.target.value; refresh(); });
      yearRow.querySelector('#prev-period').addEventListener('click', () => { _year--; refresh(); });
      yearRow.querySelector('#next-period').addEventListener('click', () => { _year++; refresh(); });
      const syNow = new Date().getUTCFullYear();
      if (_year >= syNow) {
        yearRow.querySelector('#next-period').disabled = true;
      }
      periodSect.appendChild(yearRow);
      if (_year === syNow) {
        const hint = document.createElement('div');
        hint.style.cssText = 'font-size:0.7rem;color:var(--text-muted);margin-top:0.25rem';
        const todayLabel = new Date().toISOString().slice(0, 10);
        const fmtD = s => new Date(s + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
        hint.textContent = `Jan 1 – ${fmtD(todayLabel)}`;
        periodSect.appendChild(hint);
      }
    } else {
      const dateWrap = document.createElement('div');
      dateWrap.style.cssText = 'display:flex;gap:0.5rem;width:100%';
      dateWrap.innerHTML = `
        <label style="font-size:0.875rem;flex:1">From
          <input type="text" id="range-start" placeholder="Start date" autocomplete="off" readonly inputmode="none" style="display:block;margin-top:0.2rem;width:100%">
        </label>
        <label style="font-size:0.875rem;flex:1">To
          <input type="text" id="range-end" placeholder="End date" autocomplete="off" readonly inputmode="none" style="display:block;margin-top:0.2rem;width:100%">
        </label>
      `;
      const startEl = dateWrap.querySelector('#range-start');
      const endEl = dateWrap.querySelector('#range-end');
      _fpInstances.push(flatpickr(startEl, {
        dateFormat: 'Y-m-d',
        locale: { firstDayOfWeek: 1 },
        defaultDate: _customStart || null,
        onChange: ([d], dateStr) => {
          if (!d) return;
          _customStart = dateStr;
          if (endEl.value) refresh();
        },
      }));
      _fpInstances.push(flatpickr(endEl, {
        dateFormat: 'Y-m-d',
        locale: { firstDayOfWeek: 1 },
        defaultDate: _customEnd || null,
        onChange: ([d], dateStr) => {
          if (!d) return;
          _customEnd = dateStr;
          if (startEl.value) refresh();
        },
      }));
      periodSect.appendChild(dateWrap);
    }
  }
  sidebar.appendChild(periodSect);

  // --- Section: View (hidden during trend drill-down) ---
  if (_trendCategoryId !== null) return sidebar;
  const viewSect = makeSection('View');
  viewSect.appendChild(makeSegGroup(
    [['category', 'Category'], ['label', 'Label']],
    _breakdown,
    bd => { _breakdown = bd; refresh(); }
  ));
  viewSect.appendChild(buildViewTabToggles());
  sidebar.appendChild(viewSect);

  return sidebar;
}

function buildMonthPicker(value, onChange) {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:0.5rem';

  const monthSel = document.createElement('select');
  monthSel.style.flex = '1';
  for (let i = 1; i <= 12; i++) {
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = MONTHS[i - 1]; opt.selected = i === value.month;
    monthSel.appendChild(opt);
  }

  const yearSel = document.createElement('select');
  yearSel.style.flex = '1';
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
  return row;
}

function buildYearPicker(value, onChange) {
  const yearSel = document.createElement('select');
  yearSel.style.width = '100%';
  for (const y of yearRange()) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y; opt.selected = y === value;
    yearSel.appendChild(opt);
  }
  yearSel.addEventListener('change', () => onChange(+yearSel.value));
  return yearSel;
}

function filterItems(items) {
  return items.filter(b => _breakdownTab === 'expenses' ? b.total < 0 : b.total > 0);
}

function buildSummaryCards(income, expenses, net, currency, periodLabel) {
  const netCardCls = net >= 0 ? 'summary-card-net-pos' : 'summary-card-net-neg';
  const netValueCls = net === 0 ? '' : (net > 0 ? 'amount-income' : 'amount-expense');
  const netSign = net >= 0 ? '+' : '-';
  const cards = document.createElement('div');
  cards.className = 'summary-cards';
  cards.innerHTML = `
    <div class="summary-card summary-card-income">
      <div class="label">Income</div>
      <div class="value">+${escHtml(fmt(income, currency))}</div>
      <div class="sublabel">${escHtml(periodLabel)}</div>
    </div>
    <div class="summary-card summary-card-expense">
      <div class="label">Expenses</div>
      <div class="value">${escHtml(fmt(Math.abs(expenses), currency))}</div>
      <div class="sublabel">${escHtml(periodLabel)}</div>
    </div>
    <div class="summary-card ${netCardCls}">
      <div class="label">Net</div>
      <div class="value ${netValueCls}">${netSign}${escHtml(fmt(Math.abs(net), currency))}</div>
      <div class="sublabel">${net >= 0 ? 'positive balance' : 'negative balance'}</div>
    </div>
  `;
  return cards;
}

function renderSummaryReport(report, currency, data, container, periodLabel) {
  container.appendChild(buildSummaryCards(report.income, report.expenses, report.net, currency, periodLabel));

  // Cash flow chart for multi-month periods
  if (_mode === 'custom' && _customStart && _customEnd && _customStart.slice(0, 7) !== _customEnd.slice(0, 7)) {
    const cfRaw = cashFlowReport(data, _customStart, _customEnd);
    const cfData = cfRaw.map(m => ({ income: m.income, expenses: m.expenses, cumulative: m.cumulative }));
    const cfLabels = cfRaw.map(m => new Date(m.month + '-01T00:00:00Z').toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' }));
    renderCashFlowChart(cfData, cfLabels, currency, container);
  } else if (_mode === 'all' && report.transactions.length > 0) {
    const from = report.transactions[0].date.slice(0, 7) + '-01';
    const to = new Date().toISOString().slice(0, 10);
    const cfRaw = cashFlowReport(data, from, to);
    const cfData = cfRaw.map(m => ({ income: m.income, expenses: m.expenses, cumulative: m.cumulative }));
    const cfLabels = cfRaw.map(m => new Date(m.month + '-01T00:00:00Z').toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' }));
    renderCashFlowChart(cfData, cfLabels, currency, container);
  } else if (_mode === 'yearly' && _year === new Date().getUTCFullYear() && report.transactions.length > 0) {
    const ytdTo = new Date().toISOString().slice(0, 10);
    const cfRaw = cashFlowReport(data, `${_year}-01-01`, ytdTo);
    const cfData = cfRaw.map(m => ({ income: m.income, expenses: m.expenses, cumulative: m.cumulative }));
    const cfLabels = cfRaw.map(m => new Date(m.month + '-01T00:00:00Z').toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' }));
    renderCashFlowChart(cfData, cfLabels, currency, container);
  }

  renderChartAndBreakdown(report, data, currency, container);
}

function renderYearlyReport(report, currency, data, container, periodLabel) {
  container.appendChild(buildSummaryCards(report.total.income, report.total.expenses, report.total.net, currency, periodLabel));

  let cum = 0;
  const cfData = report.months.map(m => ({
    income: m.income,
    expenses: m.expenses,
    cumulative: (cum += m.net),
  }));
  renderCashFlowChart(cfData, months(), currency, container);

  renderChartAndBreakdown(report, data, currency, container);
}

function renderCashFlowChart(cfData, labels, currency, container) {
  if (cfData.length === 0) return;

  const chartWrap = document.createElement('div');
  chartWrap.className = 'card';
  chartWrap.style.cssText = 'padding:1.25rem;margin-bottom:1.5rem';

  const title = document.createElement('div');
  title.style.cssText = 'font-size:0.75rem;color:var(--text-muted);margin-bottom:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.5px';
  title.textContent = 'Cumulative Net';
  chartWrap.appendChild(title);

  const canvas = document.createElement('canvas');
  canvas.height = 140;
  chartWrap.appendChild(canvas);
  container.appendChild(chartWrap);

  const dark = isDark();
  const lineColor = dark ? '#818cf8' : '#5055d8';
  const labelColor = dark ? '#9896b8' : '#78716c';

  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 140);
  gradient.addColorStop(0, dark ? 'rgba(129,140,248,0.2)' : 'rgba(80,85,216,0.15)');
  gradient.addColorStop(1, dark ? 'rgba(129,140,248,0)' : 'rgba(80,85,216,0)');

  _chartInstances.push(new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Net balance',
        data: cfData.map(m => m.cumulative),
        borderColor: lineColor,
        backgroundColor: gradient,
        fill: true,
        borderWidth: 2.5,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: lineColor,
        pointBorderColor: 'transparent',
        pointHoverRadius: 6,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: labelColor, font: { size: 11 } } },
        y: { display: false },
      },
    },
  }));
}


function renderCompareReport(rA, rB, specA, specB, currency, data, container) {
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const labelA = specA.month ? `${MONTHS_SHORT[specA.month - 1]} ${specA.year}` : `${specA.year}`;
  const labelB = specB.month ? `${MONTHS_SHORT[specB.month - 1]} ${specB.year}` : `${specB.year}`;

  // Two-column summary
  const summaryWrap = document.createElement('div');
  summaryWrap.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-top:0.75rem;margin-bottom:1rem';

  for (const [r, label, isPrimary] of [[rA, labelA, false], [rB, labelB, true]]) {
    const netCls = r.net >= 0 ? 'amount-income' : 'amount-expense';
    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = `padding:1rem;${isPrimary ? 'border-color:var(--primary)' : ''}`;
    card.innerHTML = `
      <div style="font-size:0.75rem;font-weight:600;color:${isPrimary ? 'var(--primary)' : 'var(--text-muted)'};margin-bottom:0.5rem">${escHtml(label)}</div>
      <div style="font-size:0.8125rem;color:var(--text-muted)">Income</div>
      <div class="${r.income !== 0 ? 'amount-income' : ''}" style="font-weight:600;margin-bottom:0.25rem;${r.income === 0 ? 'color:var(--text-muted)' : ''}">${escHtml(fmt(r.income, currency))}</div>
      <div style="font-size:0.8125rem;color:var(--text-muted)">Expenses</div>
      <div class="${r.expenses !== 0 ? 'amount-expense' : ''}" style="font-weight:600;margin-bottom:0.25rem;${r.expenses === 0 ? 'color:var(--text-muted)' : ''}">${escHtml(fmt(Math.abs(r.expenses), currency))}</div>
      <div style="font-size:0.8125rem;color:var(--text-muted)">Net</div>
      <div class="${r.net !== 0 ? netCls : ''}" style="font-weight:600;${r.net === 0 ? 'color:var(--text-muted)' : ''}">${escHtml(fmt(r.net, currency))}</div>
    `;
    summaryWrap.appendChild(card);
  }
  container.appendChild(summaryWrap);

  // Savings rate header
  const rateA = rA.income > 0 ? rA.net / rA.income * 100 : null;
  const rateB = rB.income > 0 ? rB.net / rB.income * 100 : null;
  const rateDelta = rateA !== null && rateB !== null ? rateB - rateA : null;

  const savingsCard = document.createElement('div');
  savingsCard.className = 'card savings-rate-card';
  savingsCard.style.cssText = 'padding:1rem;margin-bottom:1.5rem;border-color:var(--primary);border-width:1px';

  const fmtRate = r => r !== null && r !== undefined ? (r >= 0 ? '+' : '') + r.toFixed(1) + '%' : 'N/A';
  const rateCls = r => r === null || r === undefined || r === 0 ? '' : (r > 0 ? 'amount-income' : 'amount-expense');

  savingsCard.innerHTML = `
    <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.75rem;font-weight:600">Net Savings Rate</div>
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <div class="${rateCls(rateA)}" style="font-size:1.25rem;font-weight:800">${fmtRate(rateA)}</div>
        <div style="font-size:0.7rem;color:var(--text-muted)">${escHtml(labelA)}</div>
      </div>
      <div style="padding:0.25rem 0.5rem;border-radius:1rem;font-size:0.7rem;font-weight:700;background:var(--surface-hover);color:${rateDelta !== null && rateDelta !== undefined && rateDelta >= 0 ? 'var(--income)' : 'var(--expense)'}">${rateDelta !== null && rateDelta !== undefined ? (rateDelta >= 0 ? '+' : '') + Math.round(rateDelta) + 'pp' : '—'}</div>
      <div style="text-align:right">
        <div class="${rateCls(rateB)}" style="font-size:1.25rem;font-weight:800">${fmtRate(rateB)}</div>
        <div style="font-size:0.7rem;color:var(--text-muted)">${escHtml(labelB)}</div>
      </div>
    </div>
  `;
  container.appendChild(savingsCard);

  // Allocation shift cards
  const isCat = _breakdown === 'category';
  const nameKey = isCat ? 'categoryName' : 'labelName';
  const diff = diffBreakdown(rA.byCategory, rB.byCategory, nameKey, rA.income, rB.income);

  if (diff.length === 0) {
    container.appendChild(Object.assign(document.createElement('p'), { className: 'placeholder', textContent: 'No expense data to compare.' }));
    return;
  }

  const catsByName = isCat ? new Map(data.categories.map(c => [c.name, c])) : null;

  // Section header
  const sectionHeader = document.createElement('div');
  sectionHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem';
  sectionHeader.innerHTML = `
    <div style="font-weight:600;font-size:0.875rem">Allocation Shifts</div>
    <div style="font-size:0.7rem;color:var(--text-muted)" title="Sorted by largest change in % of incomeome share">sorted by Δ income share</div>
  `;
  container.appendChild(sectionHeader);

  const shiftList = document.createElement('div');
  shiftList.className = 'card';
  shiftList.style.cssText = 'padding:0;overflow:hidden';
  container.appendChild(shiftList);

  const noIncA = rA.income === 0 ? ' · no income' : '';
  const noIncB = rB.income === 0 ? ' · no income' : '';
  const colHeader = document.createElement('div');
  colHeader.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;padding:0.5rem 1rem;border-bottom:1px solid var(--border);background:var(--surface-hover)';
  colHeader.innerHTML = `
    <div style="font-size:0.65rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px">${escHtml(labelA + noIncA)}</div>
    <div style="font-size:0.65rem;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:0.5px">${escHtml(labelB + noIncB)}</div>
  `;
  shiftList.appendChild(colHeader);

  for (let i = 0; i < diff.length; i++) {
    const d = diff[i];
    const icon = catsByName?.get(d.name)?.icon ?? '';
    const displayName = d.name ?? '(uncategorized)';

    // Shift text: percentage-point change (pp), not a relative % change
    const fmtPp = v => { const r = Math.round(v); return r === 0 ? v.toFixed(1) : String(r); };
    let shiftText = '', shiftColor = 'var(--text-muted)';
    if (d.shift !== null && d.shift !== undefined) {
      shiftText = (d.shift >= 0 ? '+' : '') + fmtPp(d.shift) + 'pp';
      shiftColor = d.shift > 0 ? 'var(--expense)' : 'var(--income)';
    } else if (d.pctB !== null && d.pctB !== undefined) {
      shiftText = '+' + fmtPp(d.pctB) + 'pp';
      shiftColor = 'var(--expense)';
    } else if (d.pctA !== null && d.pctA !== undefined) {
      shiftText = '-' + fmtPp(d.pctA) + 'pp';
      shiftColor = 'var(--income)';
    }

    const row = document.createElement('div');
    row.style.cssText = `padding:1rem;${i % 2 === 0 ? 'background:var(--surface-hover);' : ''}${i < diff.length - 1 ? 'border-bottom:1px solid var(--border)' : ''}`;

    const nameBadge = d.amtA === 0 ? ` <span style="font-size:0.6rem;background:var(--primary);color:#fff;padding:2px 5px;border-radius:4px;font-weight:700;vertical-align:middle">NEW</span>` : '';
    const goneBadge = d.amtB === 0 ? ` <span style="font-size:0.6rem;background:var(--border);color:var(--text-muted);padding:2px 5px;border-radius:4px;font-weight:700;vertical-align:middle">GONE</span>` : '';

    const pctAText = d.pctA !== null && d.pctA !== undefined ? d.pctA.toFixed(1) + '% of income' : '';
    const pctBText = d.pctB !== null && d.pctB !== undefined ? d.pctB.toFixed(1) + '% of income' : '';

    const iconCircle = `<span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:var(--border);font-size:0.9rem;flex-shrink:0;margin-right:0.5rem">${icon || escHtml(displayName.charAt(0).toUpperCase())}</span>`;
    row.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
        <div style="display:flex;align-items:center;min-width:0">${iconCircle}<span style="font-weight:700;font-size:0.9375rem">${escHtml(displayName)}${nameBadge}${goneBadge}</span></div>
        <div style="font-size:0.85rem;font-weight:800;color:${shiftColor};flex-shrink:0;margin-left:0.75rem">${escHtml(shiftText)}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
        <div style="${d.amtA === 0 ? 'opacity:0.35;filter:grayscale(1)' : ''}">
          <div style="font-weight:700;font-size:0.875rem" class="amount-expense">${d.amtA !== 0 ? escHtml(fmt(Math.abs(d.amtA), currency)) : '—'}</div>
          ${d.amtA !== 0 && pctAText ? `<div style="font-size:0.7rem;color:var(--text-muted)">${pctAText}</div>` : d.amtA === 0 ? '<div style="font-size:0.7rem;color:var(--text-muted)">0% of income</div>' : ''}
        </div>
        <div style="${d.amtB === 0 ? 'opacity:0.35;filter:grayscale(1)' : ''}">
          <div style="font-weight:700;font-size:0.875rem" class="amount-expense">${d.amtB !== 0 ? escHtml(fmt(Math.abs(d.amtB), currency)) : '—'}</div>
          ${d.amtB !== 0 && pctBText ? `<div style="font-size:0.7rem;color:var(--text-muted)">${pctBText}</div>` : d.amtB === 0 ? '<div style="font-size:0.7rem;color:var(--text-muted)">0% of income</div>' : ''}
        </div>
      </div>
    `;
    shiftList.appendChild(row);
  }
}

function diffBreakdown(itemsA, itemsB, nameKey, incomeA, incomeB) {
  const mapA = new Map(itemsA.filter(x => x.total < 0).map(x => [x[nameKey], x.total]));
  const mapB = new Map(itemsB.filter(x => x.total < 0).map(x => [x[nameKey], x.total]));
  const names = new Set([...mapA.keys(), ...mapB.keys()]);
  return [...names]
    .map(name => {
      const amtA = mapA.get(name) ?? 0;
      const amtB = mapB.get(name) ?? 0;
      const pctA = incomeA > 0 ? Math.abs(amtA) / incomeA * 100 : null;
      const pctB = incomeB > 0 ? Math.abs(amtB) / incomeB * 100 : null;
      const shift = pctA !== null && pctA !== undefined && pctB !== null && pctB !== undefined ? pctB - pctA : null;
      return { name, amtA, amtB, pctA, pctB, shift };
    })
    .sort((a, b) => {
      if (a.shift !== null && a.shift !== undefined && b.shift !== null && b.shift !== undefined) return Math.abs(b.shift) - Math.abs(a.shift);
      return Math.abs(b.amtB) - Math.abs(a.amtB);
    });
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
  const borderColor = dark ? '#1d1c2b' : '#fff';
  return {
    labels: items.map(b => {
      const name = b[nameKey] ?? fallback;
      const icon = catsByName?.get(name)?.icon;
      return icon ? `${icon} ${name}` : name;
    }),
    datasets: [{
      data: items.map(b => Math.abs(b.total)),
      backgroundColor: items.map((_, i) => colors[i % colors.length]),
      borderColor,
      borderWidth: 1,
    }],
  };
}

function renderChartAndBreakdown(report, data, currency, container) {
  const isCat = _breakdown === 'category';
  const rawItems = isCat ? report.byCategory : (report.byLabel ?? []);
  const items = filterItems(rawItems);
  const nameKey = isCat ? 'categoryName' : 'labelName';
  const fallback = isCat ? '(uncategorized)' : '(no label)';
  const catsByName = isCat ? new Map(data.categories.map(c => [c.name, c])) : null;

  if (items.length === 0 || !items.some(b => b.total !== 0)) {
    container.appendChild(Object.assign(document.createElement('p'), { className: 'placeholder', textContent: 'No transactions in this period.' }));
    return;
  }

  const dark = isDark();
  const colors = dark ? PIE_COLORS_DARK : PIE_COLORS_LIGHT;
  const sorted = [...items].filter(b => b.total !== 0).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  const totalAbs = sorted.reduce((s, b) => s + Math.abs(b.total), 0);

  const card = document.createElement('div');
  card.className = 'card';
  card.style.cssText = 'padding:1.25rem;margin-bottom:1.5rem';

  const chartWrap = document.createElement('div');
  chartWrap.style.cssText = 'max-width:320px;margin:0 auto';
  const canvas = document.createElement('canvas');
  chartWrap.appendChild(canvas);
  card.appendChild(chartWrap);

  _chartInstances.push(new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: buildPieChartData(sorted, nameKey, fallback, catsByName),
    options: {
      responsive: true,
      cutout: '55%',
      plugins: { legend: { display: false } },
    },
  }));

  const list = document.createElement('div');
  list.style.cssText = 'margin-top:1.25rem';
  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i];
    const name = b[nameKey] ?? fallback;
    const icon = isCat ? (catsByName.get(name)?.icon ?? '') : '';
    const pct = totalAbs > 0 ? Math.round(Math.abs(b.total) / totalAbs * 100) : 0;
    const color = colors[i % colors.length];
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;padding:0.625rem 0;border-bottom:1px solid var(--border)';
    if (i === sorted.length - 1) row.style.borderBottom = 'none';
    row.innerHTML = `
      <span style="width:12px;height:12px;border-radius:3px;background:${color};flex-shrink:0;margin-right:0.75rem"></span>
      <span style="flex:1;min-width:0">
        <span style="display:block">${icon ? icon + ' ' : ''}${escHtml(name)}</span>
        <span style="display:block;font-size:0.75rem;color:var(--text-muted)">${b.count} transaction${b.count !== 1 ? 's' : ''} &bull; ${pct}%</span>
      </span>
      <span class="${b.total >= 0 ? 'amount-income' : 'amount-expense'}" style="font-weight:600;flex-shrink:0">${fmt(b.total, currency)}</span>
      ${isCat ? '<span style="flex-shrink:0;margin-left:0.5rem;color:var(--text-muted);font-size:0.9rem">›</span>' : ''}
    `;
    if (isCat && b.categoryId) {
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        _trendCategoryId = b.categoryId;
        _trendCategoryName = name;
        _trendCategoryIcon = icon;
        _trendPctMode = false;
        refresh();
      });
    }
    list.appendChild(row);
  }
  card.appendChild(list);
  container.appendChild(card);
}

function trendDateRange(data, categoryId) {
  if (_mode === 'monthly') {
    if (_month === 0) {
      const tn = new Date();
      const start = rollingMonthStart(tn.getUTCFullYear(), tn.getUTCMonth() + 1, tn.getUTCDate());
      return { from: start.toISOString().slice(0, 10), to: tn.toISOString().slice(0, 10), granularity: 'daily' };
    }
    const start = new Date(Date.UTC(_year, _month - 1, 1));
    const end = new Date(Date.UTC(_year, _month, 0));
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10), granularity: 'daily' };
  }
  if (_mode === 'yearly') {
    const tn = new Date();
    if (_year === tn.getUTCFullYear()) {
      return { from: `${_year}-01-01`, to: tn.toISOString().slice(0, 10), granularity: 'monthly' };
    }
    return { from: `${_year}-01-01`, to: `${_year}-12-31`, granularity: 'monthly' };
  }
  if (_mode === 'custom' && _customStart && _customEnd) {
    const s = new Date(_customStart + 'T00:00:00Z');
    const e = new Date(_customEnd + 'T00:00:00Z');
    const spanMonths = (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + e.getUTCMonth() - s.getUTCMonth();
    return { from: _customStart, to: _customEnd, granularity: spanMonths === 0 ? 'daily' : spanMonths >= 36 ? 'quarterly' : 'monthly' };
  }
  // all time
  const catTxs = data.transactions.filter(t => t.categoryId === categoryId);
  const earliest = catTxs.length > 0 ? catTxs.reduce((min, t) => t.date < min ? t.date : min, catTxs[0].date) : new Date().toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const s = new Date(earliest + 'T00:00:00Z');
  const e = new Date(today + 'T00:00:00Z');
  const spanMonths = (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + e.getUTCMonth() - s.getUTCMonth();
  return { from: earliest, to: today, granularity: spanMonths >= 36 ? 'quarterly' : 'monthly' };
}

function trendPeriodLabel(from, to, granularity) {
  const MONTHS = months();
  if (granularity === 'daily') {
    const df = new Date(from + 'T00:00:00Z');
    const dt = new Date(to + 'T00:00:00Z');
    if (df.getUTCMonth() === dt.getUTCMonth() && df.getUTCFullYear() === dt.getUTCFullYear()) {
      return `${monthsFull()[df.getUTCMonth()]} ${df.getUTCFullYear()}`;
    }
    const fmtD = s => new Date(s + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    return `${fmtD(from)} – ${fmtD(to)}`;
  }
  const sf = new Date(from + 'T00:00:00Z');
  const st = new Date(to + 'T00:00:00Z');
  const fullCalYear = sf.getUTCFullYear() === st.getUTCFullYear() && sf.getUTCMonth() === 0 && st.getUTCMonth() === 11;
  if (fullCalYear) return `${sf.getUTCFullYear()}`;
  if (sf.getUTCFullYear() === st.getUTCFullYear()) return `${MONTHS[sf.getUTCMonth()]} – ${MONTHS[st.getUTCMonth()]} ${sf.getUTCFullYear()}`;
  return `${MONTHS[sf.getUTCMonth()]} ${sf.getUTCFullYear()} – ${MONTHS[st.getUTCMonth()]} ${st.getUTCFullYear()}`;
}

function trendChartLabel(period, granularity) {
  if (granularity === 'daily') return period.slice(8);
  if (granularity === 'quarterly') return period.replace('-', " '").replace(/^(\d{4})/, (_, y) => y.slice(2));
  const m = parseInt(period.slice(5, 7), 10);
  const y = period.slice(2, 4);
  return `${months()[m - 1]} '${y}`;
}

function prevPeriodRange(from, to) {
  let prevFrom, prevTo, label, subtitle;
  if (_mode === 'monthly') {
    if (_month === 0) {
      const s = new Date(from + 'T00:00:00Z');
      const spanMs = new Date(to + 'T00:00:00Z') - s;
      prevFrom = new Date(s - spanMs).toISOString().slice(0, 10);
      prevTo = new Date(s.getTime() - 86400000).toISOString().slice(0, 10);
      label = 'vs. prev. period';
      const pf = new Date(prevFrom + 'T00:00:00Z');
      const pt = new Date(prevTo + 'T00:00:00Z');
      subtitle = `${months()[pf.getUTCMonth()]} ${pf.getUTCDate()} – ${months()[pt.getUTCMonth()]} ${pt.getUTCDate()}`;
    } else {
      const d = new Date(Date.UTC(_year, _month - 2, 1));
      prevFrom = d.toISOString().slice(0, 10);
      prevTo = new Date(Date.UTC(_year, _month - 1, 0)).toISOString().slice(0, 10);
      label = `vs. ${months()[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
      const pd = new Date(prevFrom + 'T00:00:00Z');
      subtitle = `Compared to ${months()[pd.getUTCMonth()]} ${pd.getUTCFullYear()}`;
    }
  } else if (_mode === 'yearly') {
    prevFrom = `${_year - 1}-01-01`;
    prevTo = `${_year - 1}-12-31`;
    label = `vs. ${_year - 1}`;
    subtitle = `Compared to ${_year - 1}`;
  } else {
    const s = new Date(from + 'T00:00:00Z');
    const spanMs = new Date(to + 'T00:00:00Z') - s;
    prevFrom = new Date(s - spanMs).toISOString().slice(0, 10);
    prevTo = new Date(s.getTime() - 86400000).toISOString().slice(0, 10);
    label = `vs. prev. period`;
    const pf = new Date(prevFrom + 'T00:00:00Z');
    const pt = new Date(prevTo + 'T00:00:00Z');
    subtitle = `Compared to ${months()[pf.getUTCMonth()]} ${pf.getUTCFullYear()} – ${months()[pt.getUTCMonth()]} ${pt.getUTCFullYear()}`;
  }
  return { prevFrom, prevTo, label, subtitle };
}

// Golden Rule: current period in progress → compare avg/elapsed vs avg/elapsed (fair
// apples-to-apples); past period → full total vs full total (no slicing needed).
function computeDynamicComparison(data, categoryId, from, to, granularity, currentTotal, elapsedCount) {
  const { prevFrom, prevTo, label, subtitle } = prevPeriodRange(from, to);
  const todayStr = new Date().toISOString().slice(0, 10);
  const prevTrend = categoryTrendReport(data, categoryId, prevFrom, prevTo, granularity);

  if (from <= todayStr && todayStr <= to) {
    const prevElapsed = Math.min(elapsedCount, prevTrend.length);
    const prevTotal = prevTrend.slice(0, prevElapsed).reduce((s, b) => s + b.total, 0);
    const curAvg = currentTotal / elapsedCount;
    const prevAvg = prevElapsed > 0 ? prevTotal / prevElapsed : 0;
    if (prevAvg === 0) return { value: null, label, subtitle: null, unit: '%' };
    const clamped = elapsedCount > prevTrend.length;
    const periodUnit = granularity === 'daily' ? 'day' : granularity === 'monthly' ? 'month' : 'quarter';
    return {
      value: ((curAvg - prevAvg) / Math.abs(prevAvg)) * 100,
      label,
      subtitle: clamped ? `avg/${periodUnit} · full prev. period` : `avg/${periodUnit} · same window`,
      unit: '%',
    };
  }
  const prevTotal = prevTrend.reduce((s, b) => s + b.total, 0);
  if (prevTotal === 0) return { value: null, label, subtitle: null, unit: '%' };
  return { value: ((currentTotal - prevTotal) / Math.abs(prevTotal)) * 100, label, subtitle, unit: '%' };
}

function computePctComparison(data, categoryId, from, to, granularity, currentRawPcts, elapsedCount) {
  const { prevFrom, prevTo, label, subtitle } = prevPeriodRange(from, to);
  const todayStr = new Date().toISOString().slice(0, 10);
  const validCur = currentRawPcts.filter(p => p !== null);
  const curAvg = validCur.length > 0 ? validCur.reduce((a, b) => a + b, 0) / validCur.length : null;

  const prevCat = categoryTrendReport(data, categoryId, prevFrom, prevTo, granularity);
  const prevInc = incomeTrendReport(data, prevFrom, prevTo, granularity);
  const sliceLen = (from <= todayStr && todayStr <= to)
    ? Math.min(elapsedCount, prevCat.length)
    : prevCat.length;
  const validPrev = prevCat.slice(0, sliceLen)
    .map((b, i) => prevInc[i].income > 0 ? Math.abs(b.total) / prevInc[i].income * 100 : Infinity)
    .filter(p => p !== Infinity);
  const prevAvg = validPrev.length > 0 ? validPrev.reduce((a, b) => a + b, 0) / validPrev.length : null;

  if (curAvg === null || prevAvg === null) return { value: null, label, subtitle: null, unit: 'pp' };
  return { value: curAvg - prevAvg, label, subtitle, unit: 'pp' };
}

function makeHatchPattern(ctx, dark) {
  const s = 8;
  const pc = document.createElement('canvas');
  pc.width = s; pc.height = s;
  const pctx = pc.getContext('2d');
  pctx.strokeStyle = dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)';
  pctx.lineWidth = 1;
  pctx.beginPath();
  pctx.moveTo(0, s); pctx.lineTo(s, 0);
  pctx.stroke();
  return ctx.createPattern(pc, 'repeat');
}

function renderCategoryTrend(data, currency, container) {
  const { from, to, granularity } = trendDateRange(data, _trendCategoryId);
  const trendData = categoryTrendReport(data, _trendCategoryId, from, to, granularity);

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayMonthStr = todayStr.slice(0, 7);
  const todayQuarterStr = (() => {
    const d = new Date(todayStr + 'T00:00:00Z');
    return `${d.getUTCFullYear()}-Q${Math.ceil((d.getUTCMonth() + 1) / 3)}`;
  })();
  const isFuturePeriod = p =>
    granularity === 'daily' ? p > todayStr :
    granularity === 'monthly' ? p > todayMonthStr : p > todayQuarterStr;
  const elapsedCount = Math.max(trendData.filter(b => !isFuturePeriod(b.period) || b.count > 0).length, 1);

  // --- Header with back button ---
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem;flex-wrap:wrap;gap:0.5rem';
  const left = document.createElement('div');
  left.style.cssText = 'display:flex;align-items:center;gap:0.75rem';
  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn-sm btn-secondary';
  backBtn.innerHTML = '←';
  backBtn.title = 'Back to breakdown';
  backBtn.setAttribute('aria-label', 'Back to breakdown');
  backBtn.addEventListener('click', () => { _trendCategoryId = null; _trendPctMode = false; refresh(); });
  left.appendChild(backBtn);
  if (_trendCategoryIcon) {
    const emojiCircle = document.createElement('span');
    emojiCircle.style.cssText = 'width:40px;height:40px;background:var(--surface-hover);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0';
    emojiCircle.textContent = _trendCategoryIcon;
    left.appendChild(emojiCircle);
  }
  const titleEl = document.createElement('span');
  titleEl.style.cssText = 'font-size:1.25rem;font-weight:700';
  titleEl.textContent = `${_trendCategoryName} Trends`;
  left.appendChild(titleEl);
  header.appendChild(left);
  const periodLabel = document.createElement('span');
  periodLabel.style.cssText = 'font-size:0.875rem;color:var(--text-muted);font-weight:500';
  periodLabel.textContent = trendPeriodLabel(from, to, granularity);
  header.appendChild(periodLabel);
  container.appendChild(header);

  if (trendData.length === 0 || trendData.every(b => b.total === 0 && b.count === 0)) {
    container.appendChild(Object.assign(document.createElement('p'), { className: 'placeholder', textContent: 'No transactions for this category in this period.' }));
    return;
  }

  const total = trendData.reduce((s, b) => s + b.total, 0);
  const nonZeroPeriods = trendData.filter(b => b.count > 0).length;
  const isExpenseCat = total < 0;
  const pctMode = _trendPctMode && isExpenseCat;
  const periodWord = granularity === 'daily' ? 'days' : granularity === 'quarterly' ? 'quarters' : 'months';
  const granLabel = granularity === 'daily' ? 'Daily' : granularity === 'quarterly' ? 'Quarterly' : 'Monthly';

  // --- Mode-dependent values (single branch) ---
  let chartData, spikeIndices, ceilingIndices, avgLabel, avgVal, comparison, chartTitleText, tooltipCb, yScale;
  let incomeData, rawPcts, pctCeiling, noIncomeIndices = new Set(), hasOverspend = false;

  const dark = isDark();
  const lineColor = dark ? '#818cf8' : '#5055d8';
  const labelColor = dark ? '#9896b8' : '#78716c';
  const roseColor = dark ? '#fb7185' : '#b91c1c';
  const gridColor = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';

  if (pctMode) {
    incomeData = incomeTrendReport(data, from, to, granularity);
    if (incomeData.every(b => b.income === 0)) {
      const wrap = document.createElement('div');
      wrap.className = 'card';
      wrap.style.cssText = 'padding:1.25rem';
      const hdr = document.createElement('div');
      hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem';
      const title = document.createElement('div');
      title.style.cssText = 'font-size:0.75rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px';
      title.textContent = (granularity === 'daily' ? 'Daily' : granularity === 'quarterly' ? 'Quarterly' : 'Monthly') + ' % of Income';
      hdr.appendChild(title);
      const seg = document.createElement('div');
      seg.className = 'seg-group';
      for (const [lbl, val] of [['Value', false], ['% Inc', true]]) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm' + (val === _trendPctMode ? ' btn-primary' : ' btn-secondary');
        btn.textContent = lbl;
        btn.addEventListener('click', () => { _trendPctMode = val; refresh(); });
        seg.appendChild(btn);
      }
      hdr.appendChild(seg);
      wrap.appendChild(hdr);
      wrap.appendChild(Object.assign(document.createElement('p'), {
        className: 'placeholder',
        textContent: 'No income recorded in this period — % of Income view is unavailable.',
      }));
      container.appendChild(wrap);
      return;
    }
    rawPcts = trendData.map((b, i) => {
      const inc = incomeData[i].income;
      return inc > 0 ? Math.abs(b.total) / inc * 100 : null;
    });
    rawPcts = rawPcts.map((p, i) => isFuturePeriod(trendData[i].period) ? null : p);
    noIncomeIndices = new Set(rawPcts.map((p, i) =>
      (p === null && Math.abs(trendData[i].total) > 0) ? i : -1
    ).filter(i => i !== -1));
    const finitePcts = rawPcts.filter(p => p !== null);
    const maxPct = finitePcts.length > 0 ? Math.max(...finitePcts) : 0;
    hasOverspend = finitePcts.some(p => p > 100);
    const steps = [2, 5, 10, 15, 20, 30, 50, 75, 100, 150, 200];
    const stepCeil = steps.find(s => s >= maxPct * 1.15) || Math.ceil(maxPct * 1.15 / 50) * 50;
    pctCeiling = hasOverspend ? Math.max(stepCeil, 100) : stepCeil;
    chartData = rawPcts.map(p => p === null ? null : Math.min(p, pctCeiling));
    ceilingIndices = new Set(rawPcts.map((p, i) => (p !== null && p > pctCeiling) ? i : -1).filter(i => i !== -1));
    const forSpikes = rawPcts.map(p => p === null ? 0 : Math.min(p, pctCeiling));
    spikeIndices = new Set([...detectSpikes(forSpikes), ...ceilingIndices]);

    const avgPct = finitePcts.length > 0 ? finitePcts.reduce((a, b) => a + b, 0) / finitePcts.length : 0;
    avgLabel = `Avg. ${granLabel} % of Inc.`;
    avgVal = `${avgPct.toFixed(1)}%`;
    comparison = computePctComparison(data, _trendCategoryId, from, to, granularity, rawPcts, elapsedCount);
    chartTitleText = `${granLabel} % of Income`;
    tooltipCb = ctx => {
      const idx = ctx.dataIndex;
      if (ctx.datasetIndex === 1) {
        return `${fmt(Math.abs(trendData[idx].total), currency)} · No income this period`;
      }
      if (ceilingIndices.has(idx)) {
        return `${fmt(Math.abs(trendData[idx].total), currency)} (Funded by Savings)`;
      }
      const pctVal = rawPcts[idx].toFixed(1) + '%';
      return spikeIndices.has(idx) ? `${pctVal} (Spike)` : pctVal;
    };
    yScale = { position: 'right', min: 0, max: pctCeiling, border: { display: false },
      grid: { color: gridColor, drawTicks: false },
      ticks: { color: labelColor, font: { size: 10 }, maxTicksLimit: 3, padding: 8, callback: v => v + '%' },
      ...(hasOverspend && { afterBuildTicks: axis => {
        axis.ticks = [{ value: 0 }, { value: 100 }, ...(pctCeiling !== 100 ? [{ value: pctCeiling }] : [])];
      } }),
    };
  } else {
    chartData = trendData.map(b => Math.abs(b.total));
    ceilingIndices = new Set();
    // Spike detection must run on raw values before nulling future periods — nulling
    // first would reduce the dataset and distort the mean/stddev baseline.
    spikeIndices = new Set(detectSpikes(chartData));
    chartData = chartData.map((v, i) => (isFuturePeriod(trendData[i].period) && trendData[i].count === 0) ? null : v);
    const avg = total !== 0 ? total / elapsedCount : 0;
    avgLabel = `Avg. ${granLabel}`;
    avgVal = escHtml(fmt(Math.abs(avg), currency));
    comparison = computeDynamicComparison(data, _trendCategoryId, from, to, granularity, total, elapsedCount);
    chartTitleText = `${granLabel} Spending`;
    tooltipCb = ctx => {
      const val = fmt(ctx.parsed.y, currency);
      return spikeIndices.has(ctx.dataIndex) ? `${val} (Spike)` : val;
    };
    yScale = { position: 'right', border: { display: false },
      grid: { color: gridColor, drawTicks: false },
      ticks: { color: labelColor, font: { size: 10 }, maxTicksLimit: 3, padding: 8, callback: v => fmtCompact(v, currency) },
      grace: '10%', beginAtZero: true };
  }

  // --- Insight cards (branch-free) ---
  const totalCardClass = isExpenseCat ? 'summary-card-expense' : 'summary-card-income';
  const grid = document.createElement('div');
  grid.className = 'summary-cards';
  grid.style.marginBottom = '1.25rem';
  grid.innerHTML = `
    <div class="summary-card">
      <div class="label">${avgLabel}</div>
      <div class="value" style="color:var(--primary)">${avgVal}</div>
      <div class="sublabel">Based on ${elapsedCount} ${periodWord}</div>
    </div>
    <div class="summary-card">
      <div class="label">${escHtml(comparison.label)}</div>
      ${comparison.value !== null
        ? `<div class="value" style="color:var(--primary)">${comparison.value > 0 ? '↑' : '↓'} ${Math.abs(comparison.value).toFixed(1)}${comparison.unit}</div>
           <div class="sublabel">${escHtml(comparison.subtitle)}</div>`
        : '<div class="value" style="color:var(--text-muted)">No History</div><div class="sublabel">&nbsp;</div>'}
    </div>
    <div class="summary-card ${totalCardClass}">
      <div class="label">Total in Period</div>
      <div class="value">${escHtml(fmt(Math.abs(total), currency))}</div>
      <div class="sublabel">${nonZeroPeriods} active ${periodWord}</div>
    </div>
  `;
  container.appendChild(grid);

  // --- Chart card ---
  const chartWrap = document.createElement('div');
  chartWrap.className = 'card';
  chartWrap.style.cssText = 'padding:1.25rem';

  const chartHeader = document.createElement('div');
  chartHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem';
  const chartTitle = document.createElement('div');
  chartTitle.style.cssText = 'font-size:0.75rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px';
  chartTitle.textContent = chartTitleText;
  chartHeader.appendChild(chartTitle);

  if (isExpenseCat) {
    const seg = document.createElement('div');
    seg.className = 'seg-group';
    for (const [label, val] of [['Value', false], ['% Inc', true]]) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm' + (val === _trendPctMode ? ' btn-primary' : ' btn-secondary');
      btn.textContent = label;
      btn.addEventListener('click', () => { _trendPctMode = val; refresh(); });
      seg.appendChild(btn);
    }
    chartHeader.appendChild(seg);
  }
  chartWrap.appendChild(chartHeader);

  const canvas = document.createElement('canvas');
  canvas.height = 180;
  chartWrap.appendChild(canvas);
  container.appendChild(chartWrap);

  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 180);
  gradient.addColorStop(0, dark ? 'rgba(129,140,248,0.2)' : 'rgba(80,85,216,0.15)');
  gradient.addColorStop(1, dark ? 'rgba(129,140,248,0)' : 'rgba(80,85,216,0)');

  const labels = trendData.map(b => trendChartLabel(b.period, granularity));
  const defaultRadius = trendData.length > 60 ? 0 : 4;
  const pointRadii = chartData.map((v, i) => {
    if (noIncomeIndices.has(i)) return 0;
    if (v === 0 || v === null) return 0;
    return spikeIndices.has(i) ? 7 : defaultRadius;
  });
  const pointColors = chartData.map((_, i) => {
    if (noIncomeIndices.has(i)) return 'transparent';
    if (ceilingIndices.has(i)) return roseColor;
    if (!spikeIndices.has(i)) return lineColor;
    return trendData[i].total < 0 ? roseColor : (dark ? '#4ade80' : '#15803d');
  });

  const datasets = [{
    label: pctMode ? '% of Income' : 'Spending',
    data: chartData, borderColor: lineColor, backgroundColor: gradient,
    fill: true, borderWidth: 2.5, tension: 0.4,
    pointRadius: pointRadii, pointBackgroundColor: pointColors,
    pointBorderColor: 'transparent', pointHoverRadius: 6,
  }];

  _chartInstances.push(new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: tooltipCb } },
        annotation: { annotations: (() => {
          const a = {};
          if (pctMode) for (const idx of noIncomeIndices) {
            a[`noInc${idx}`] = { type: 'box', xMin: idx - 0.5, xMax: idx + 0.5,
              backgroundColor: makeHatchPattern(ctx, dark),
              borderWidth: 0,
              label: { display: granularity !== 'daily', content: 'NO INCOME', rotation: -90,
                color: dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.20)',
                font: { size: 8, weight: '700' }, backgroundColor: 'transparent', position: 'center' } };
          }
          if (pctMode && hasOverspend) {
            a['incomeLimit'] = { type: 'line', yMin: 100, yMax: 100,
              borderColor: dark ? 'rgba(251,113,133,0.45)' : 'rgba(185,28,28,0.35)',
              borderWidth: 1, borderDash: [5, 4],
              label: { display: true, content: '= income', position: 'end', xAdjust: -4,
                color: dark ? '#fb7185' : '#b91c1c',
                font: { size: 9, weight: '700' }, backgroundColor: 'transparent',
                padding: { top: 0, bottom: 2 } } };
          }
          return a;
        })() },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: labelColor, font: { size: 11 }, maxTicksLimit: granularity === 'daily' ? 10 : undefined } },
        y: yScale,
      },
    },
  }));
}

function fmt(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function fmtCompact(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(amount);
  } catch {
    return amount >= 1000 ? `${(amount / 1000).toFixed(1)}K` : String(Math.round(amount));
  }
}

function months() {
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
}

function monthsFull() {
  return ['January','February','March','April','May','June','July','August','September','October','November','December'];
}

function yearRange() {
  const now = new Date().getFullYear();
  const years = [];
  for (let y = now - 10; y <= now + 2; y++) years.push(y);
  return years;
}

function rollingMonthStart(year, month, day) {
  const prevMonthLastDay = new Date(Date.UTC(year, month - 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, prevMonthLastDay);
  return new Date(Date.UTC(year, month - 2, clampedDay + 1));
}
