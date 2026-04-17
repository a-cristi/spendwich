import { expandAndFilter, groupByCategory, groupByLabel } from './filters.js';

function summarise(transactions, categories, labels) {
  let income = 0;
  let expenses = 0;
  for (const tx of transactions) {
    if (tx.amountInDefault > 0) income += tx.amountInDefault;
    else expenses += tx.amountInDefault;
  }
  const byCategory = [...groupByCategory(transactions, categories)].map(([id, g]) => ({
    categoryId: id,
    categoryName: g.category ? g.category.name : null,
    total: g.total,
    count: g.transactions.length,
  }));
  const byLabel = [...groupByLabel(transactions, labels)].map(([id, g]) => ({
    labelId: id,
    labelName: g.label ? g.label.name : null,
    total: g.total,
    count: g.transactions.length,
  }));
  return { income, expenses, net: income + expenses, byCategory, byLabel, transactions };
}

export function monthlyReport(data, year, month) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  const txs = expandAndFilter(data.transactions, { windowEnd: end }).filter(
    tx => tx.date >= start.toISOString().slice(0, 10) && tx.date <= end.toISOString().slice(0, 10),
  );
  return summarise(txs, data.categories, data.labels);
}

export function yearlyReport(data, year) {
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const report = monthlyReport(data, year, m);
    months.push({ month: m, income: report.income, expenses: report.expenses, net: report.net });
  }

  const end = new Date(Date.UTC(year, 11, 31));
  const txs = expandAndFilter(data.transactions, { windowEnd: end }).filter(
    tx => tx.date.startsWith(String(year)),
  );
  const summary = summarise(txs, data.categories, data.labels);

  return { months, byCategory: summary.byCategory, byLabel: summary.byLabel, total: { income: summary.income, expenses: summary.expenses, net: summary.net } };
}

export function customRangeReport(data, startDate, endDate) {
  const end = new Date(endDate + 'T00:00:00Z');
  const txs = expandAndFilter(data.transactions, { windowEnd: end }).filter(
    tx => tx.date >= startDate && tx.date <= endDate,
  );
  return summarise(txs, data.categories, data.labels);
}

export function allTimeReport(data) {
  const txs = expandAndFilter(data.transactions, { windowEnd: new Date() });
  return summarise(txs, data.categories, data.labels);
}

export function categoryTrendReport(data, categoryId, from, to, granularity) {
  const end = new Date(to + 'T00:00:00Z');
  const txs = expandAndFilter(data.transactions, { categoryId, windowEnd: end })
    .filter(tx => tx.date >= from && tx.date <= to);

  const buckets = new Map();
  for (const tx of txs) {
    const key = bucketKey(tx.date, granularity);
    const b = buckets.get(key) || { total: 0, count: 0 };
    b.total += tx.amountInDefault;
    b.count++;
    buckets.set(key, b);
  }

  const results = [];
  const cursor = new Date(from + 'T00:00:00Z');
  const endD = new Date(to + 'T00:00:00Z');
  while (cursor <= endD) {
    const key = bucketKey(cursor.toISOString().slice(0, 10), granularity);
    if (results.length === 0 || results[results.length - 1].period !== key) {
      const b = buckets.get(key) || { total: 0, count: 0 };
      results.push({ period: key, total: b.total, count: b.count });
    }
    if (granularity === 'daily') {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    } else if (granularity === 'monthly') {
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    } else {
      cursor.setUTCMonth(cursor.getUTCMonth() + 3);
    }
  }
  return results;
}

export function labelTrendReport(data, labelId, from, to, granularity) {
  const end = new Date(to + 'T00:00:00Z');
  const txs = expandAndFilter(data.transactions, { windowEnd: end })
    .filter(tx => tx.date >= from && tx.date <= to)
    .filter(tx => labelId === null ? tx.labelIds.length === 0 : tx.labelIds.includes(labelId));

  const buckets = new Map();
  for (const tx of txs) {
    const key = bucketKey(tx.date, granularity);
    const b = buckets.get(key) || { total: 0, count: 0 };
    b.total += tx.amountInDefault;
    b.count++;
    buckets.set(key, b);
  }

  const results = [];
  const cursor = new Date(from + 'T00:00:00Z');
  const endD = new Date(to + 'T00:00:00Z');
  while (cursor <= endD) {
    const key = bucketKey(cursor.toISOString().slice(0, 10), granularity);
    if (results.length === 0 || results[results.length - 1].period !== key) {
      const b = buckets.get(key) || { total: 0, count: 0 };
      results.push({ period: key, total: b.total, count: b.count });
    }
    if (granularity === 'daily') cursor.setUTCDate(cursor.getUTCDate() + 1);
    else if (granularity === 'monthly') cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 3);
  }
  return results;
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function detectSpikes(values, sensitivity = 2.0, granularity = 'monthly') {
  const W = granularity === 'daily' ? 21 : 6;
  const MIN_SERIES = 5; // hard gate: fewer non-zero values than this → no detection (not enough evidence)
  const MIN_WINDOW = 3; // non-zero priors required for rolling path; fewer → global fallback
  const FLOOR = 5;

  const allNonZero = values.filter(v => v != null && v > 0);
  if (allNonZero.length < MIN_SERIES) return [];

  // Precompute sums for O(1) leave-one-out stats in the global fallback path.
  // Excluding the current value from its own baseline prevents self-contamination
  // (a spike can otherwise inflate the global mean/stdDev and suppress itself).
  const gN = allNonZero.length;
  const gSum = allNonZero.reduce((a, b) => a + b, 0);
  const gSumSq = allNonZero.reduce((a, b) => a + b * b, 0);

  const spikes = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || v <= 0) continue;

    const window = [];
    for (let j = i - 1; j >= 0 && window.length < W; j--) {
      if (values[j] != null && values[j] > 0) window.unshift(values[j]);
    }

    if (window.length < MIN_WINDOW) {
      // Leave-one-out global baseline: exclude v so it cannot inflate its own threshold.
      const en = gN - 1;
      const eMean = (gSum - v) / en;
      const eVariance = (gSumSq - v * v) / en - eMean * eMean;
      const eStdDev = eVariance > 0 ? Math.sqrt(eVariance) : 0;
      if (eStdDev > 0) {
        if (v > eMean + sensitivity * eStdDev) spikes.push(i);
      } else if (eMean >= FLOOR && v > eMean * 1.5) {
        spikes.push(i);
      }
      continue;
    }

    const base = median(window);
    const spread = median(window.map(x => Math.abs(x - base)));

    if (spread > 0) {
      if (v > base + sensitivity * spread * 1.4826) spikes.push(i);
    } else if (base >= FLOOR && v > base * 1.5) {
      spikes.push(i);
    }
  }

  return spikes;
}

// Daily granularity is used for single-month drill-downs (≤31 data points). The
// rolling MAD window never fills enough to form a reliable baseline at that scale —
// ordinary shopping variation triggers false positives. Monthly and quarterly
// aggregates have enough history for the algorithm to be meaningful.
export function shouldDetectSpikes(granularity) {
  return granularity !== 'daily';
}

export function computeStabilityLabel(trendData, totalExpenses) {
  // Minimum evidence gates — fewer data points → no conclusion
  const MIN_PERIODS = 5;   // total periods in range
  const MIN_ACTIVE  = 3;   // non-zero periods (need dispersion evidence)

  // Path A: sparse + moderate dispersion (classic erratic: car repairs, one-off medical)
  const ACTIVE_RATIO_A = 0.5;  // < 50% of periods active
  const RMAD_BASE      = 0.4;  // RMAD ≥ 40% to qualify

  // Path B: moderately active but extreme dispersion (e.g. $10 routine vs $500 procedure)
  // Note: RMAD for positive values is bounded ~< 1.0 (bimodal max); 0.9 = near-bimodal, very high bar.
  // RMAD_EXTREME = 1.5 was originally intended but is mathematically unreachable for expense amounts.
  const ACTIVE_RATIO_B = 0.75; // < 75% of periods active (wider gate)
  const RMAD_EXTREME   = 0.9;  // RMAD ≥ 90% required (near-bimodal — very high bar)

  // Materiality gate: MAD must be ≥ 5% of average period spend across ALL categories.
  // Prevents tiny hobby categories ($5 variance) from flagging. Scales with the user's budget.
  // Candidates for tuning: lower if users complain of missed flags, raise if too noisy.
  const IMPACT_THRESHOLD = 0.05;

  if (trendData.length < MIN_PERIODS) return null;
  const active = trendData.filter(b => b.count > 0).map(b => Math.abs(b.total));
  if (active.length < MIN_ACTIVE) return null;

  const med = median(active);
  if (med === 0) return null;
  const mad = median(active.map(v => Math.abs(v - med)));
  const rmad = mad / med;

  const avgPeriodExpenses = Math.abs(totalExpenses) / trendData.length;
  if (avgPeriodExpenses === 0) return null;
  if (mad / avgPeriodExpenses < IMPACT_THRESHOLD) return null;

  const activeRatio = active.length / trendData.length;
  const pathA = activeRatio < ACTIVE_RATIO_A && rmad >= RMAD_BASE;
  const pathB = activeRatio < ACTIVE_RATIO_B && rmad >= RMAD_EXTREME;

  return (pathA || pathB) ? 'erratic' : null;
}

export function incomeTrendReport(data, from, to, granularity) {
  const end = new Date(to + 'T00:00:00Z');
  const txs = expandAndFilter(data.transactions, { windowEnd: end })
    .filter(tx => tx.date >= from && tx.date <= to && tx.amountInDefault > 0);

  if (granularity === 'daily') {
    const totalIncome = txs.reduce((s, tx) => s + tx.amountInDefault, 0);
    const results = [];
    const cursor = new Date(from + 'T00:00:00Z');
    const endD = new Date(to + 'T00:00:00Z');
    while (cursor <= endD) {
      results.push({ period: cursor.toISOString().slice(0, 10), income: totalIncome });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return results;
  }

  const buckets = new Map();
  for (const tx of txs) {
    const key = bucketKey(tx.date, granularity);
    buckets.set(key, (buckets.get(key) || 0) + tx.amountInDefault);
  }

  const results = [];
  const cursor = new Date(from + 'T00:00:00Z');
  const endD = new Date(to + 'T00:00:00Z');
  while (cursor <= endD) {
    const key = bucketKey(cursor.toISOString().slice(0, 10), granularity);
    if (results.length === 0 || results[results.length - 1].period !== key) {
      results.push({ period: key, income: buckets.get(key) || 0 });
    }
    if (granularity === 'monthly') cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 3);
  }
  return results;
}

function bucketKey(dateStr, granularity) {
  if (granularity === 'daily') return dateStr;
  const y = dateStr.slice(0, 4);
  const m = parseInt(dateStr.slice(5, 7), 10);
  if (granularity === 'monthly') return `${y}-${String(m).padStart(2, '0')}`;
  return `${y}-Q${Math.ceil(m / 3)}`;
}

export function cashFlowReport(data, from, to) {
  const results = [];
  let cursor = new Date(from + 'T00:00:00Z');
  const endDate = new Date(to + 'T00:00:00Z');
  let cumulative = 0;
  while (cursor <= endDate) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const r = monthlyReport(data, year, month);
    cumulative += r.net;
    results.push({ month: `${year}-${String(month).padStart(2, '0')}`, income: r.income, expenses: r.expenses, net: r.net, cumulative });
    cursor = new Date(Date.UTC(year, month, 1));
  }
  return results;
}
