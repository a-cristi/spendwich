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
