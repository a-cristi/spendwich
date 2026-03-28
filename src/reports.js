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

export function detectSpikes(values, sensitivity = 2.0) {
  if (values.length < 3) return [];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squareDiffs = values.map(v => Math.pow(v - mean, 2));
  const stdDev = Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / values.length);
  if (stdDev === 0) return [];
  return values
    .map((val, i) => (val > mean + sensitivity * stdDev ? i : -1))
    .filter(i => i !== -1);
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
