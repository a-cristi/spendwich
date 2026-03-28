import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthlyReport, yearlyReport, customRangeReport, allTimeReport, cashFlowReport, categoryTrendReport, detectSpikes, incomeTrendReport } from '../src/reports.js';
import { emptyData } from '../src/schema.js';

function makeData(txs = [], cats = [], lbls = []) {
  return { ...emptyData(), transactions: txs, categories: cats, labels: lbls };
}

function makeTx(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    date: '2026-01-15',
    amount: -10,
    currency: 'USD',
    amountInDefault: -10,
    exchangeRate: 1,
    categoryId: null,
    labelIds: [],
    description: '',
    recurrence: null,
    ...overrides,
  };
}

test('monthlyReport: income, expenses, net', () => {
  const txs = [
    makeTx({ date: '2026-01-10', amountInDefault: 500 }),
    makeTx({ date: '2026-01-15', amountInDefault: -200 }),
    makeTx({ date: '2026-01-20', amountInDefault: -50 }),
  ];
  const r = monthlyReport(makeData(txs), 2026, 1);
  assert.equal(r.income, 500);
  assert.equal(r.expenses, -250);
  assert.equal(r.net, 250);
});

test('monthlyReport: excludes transactions outside month', () => {
  const txs = [
    makeTx({ date: '2026-01-15', amountInDefault: -10 }),
    makeTx({ date: '2026-02-01', amountInDefault: -20 }),
  ];
  const r = monthlyReport(makeData(txs), 2026, 1);
  assert.equal(r.transactions.length, 1);
  assert.equal(r.expenses, -10);
});

test('monthlyReport: expands recurrences within month only', () => {
  const txs = [makeTx({
    date: '2025-11-15',
    amountInDefault: -30,
    recurrence: { frequency: 'monthly', interval: 1, endDate: null },
  })];
  const r = monthlyReport(makeData(txs), 2026, 1);
  const dates = r.transactions.map(t => t.date);
  assert.ok(dates.includes('2026-01-15'), 'should include Jan virtual');
  assert.ok(!dates.includes('2025-11-15'), 'should not include original outside month');
  assert.ok(!dates.includes('2026-02-15'), 'should not include Feb virtual');
});

test('monthlyReport: byCategory breakdown', () => {
  const cats = [{ id: 'cat-1', name: 'Food', icon: '🏷️' }];
  const txs = [
    makeTx({ date: '2026-01-10', amountInDefault: -40, categoryId: 'cat-1' }),
    makeTx({ date: '2026-01-20', amountInDefault: -60, categoryId: 'cat-1' }),
  ];
  const r = monthlyReport(makeData(txs, cats), 2026, 1);
  const foodGroup = r.byCategory.find(b => b.categoryId === 'cat-1');
  assert.ok(foodGroup);
  assert.equal(foodGroup.total, -100);
  assert.equal(foodGroup.categoryName, 'Food');
});

test('yearlyReport: aggregates 12 months', () => {
  const txs = [
    makeTx({ date: '2026-01-15', amountInDefault: -100 }),
    makeTx({ date: '2026-06-15', amountInDefault: -200 }),
    makeTx({ date: '2026-12-15', amountInDefault: 500 }),
  ];
  const r = yearlyReport(makeData(txs), 2026);
  assert.equal(r.months.length, 12);
  assert.equal(r.total.income, 500);
  assert.equal(r.total.expenses, -300);
  assert.equal(r.total.net, 200);
});

test('yearlyReport: months have correct income/expenses', () => {
  const txs = [
    makeTx({ date: '2026-03-10', amountInDefault: -75 }),
  ];
  const r = yearlyReport(makeData(txs), 2026);
  const march = r.months.find(m => m.month === 3);
  assert.equal(march.expenses, -75);
  assert.equal(march.income, 0);
});

test('customRangeReport: covers arbitrary date range', () => {
  const txs = [
    makeTx({ date: '2026-01-05', amountInDefault: -10 }),
    makeTx({ date: '2026-02-15', amountInDefault: -20 }),
    makeTx({ date: '2026-03-01', amountInDefault: -30 }),
  ];
  const r = customRangeReport(makeData(txs), '2026-01-01', '2026-02-28');
  assert.equal(r.transactions.length, 2);
  assert.equal(r.expenses, -30);
});

test('customRangeReport: boundary dates are inclusive', () => {
  const txs = [
    makeTx({ date: '2026-01-01', amountInDefault: -5 }),
    makeTx({ date: '2026-01-31', amountInDefault: -10 }),
  ];
  const r = customRangeReport(makeData(txs), '2026-01-01', '2026-01-31');
  assert.equal(r.transactions.length, 2);
});

test('monthlyReport: byLabel breakdown', () => {
  const lbls = [{ id: 'lbl-1', name: 'work' }];
  const txs = [
    makeTx({ date: '2026-01-10', amountInDefault: -30, labelIds: ['lbl-1'] }),
    makeTx({ date: '2026-01-20', amountInDefault: -20, labelIds: ['lbl-1'] }),
    makeTx({ date: '2026-01-25', amountInDefault: -5, labelIds: [] }),
  ];
  const r = monthlyReport(makeData(txs, [], lbls), 2026, 1);
  const workGroup = r.byLabel.find(b => b.labelId === 'lbl-1');
  assert.ok(workGroup);
  assert.equal(workGroup.total, -50);
  assert.equal(workGroup.labelName, 'work');
  assert.equal(workGroup.count, 2);
  const noLabel = r.byLabel.find(b => b.labelId === null);
  assert.ok(noLabel);
  assert.equal(noLabel.total, -5);
});

test('allTimeReport: returns all transactions regardless of date', () => {
  const txs = [
    makeTx({ date: '2020-01-01', amountInDefault: 500 }),
    makeTx({ date: '2025-12-31', amountInDefault: -200 }),
  ];
  const r = allTimeReport(makeData(txs));
  assert.strictEqual(r.income, 500);
  assert.strictEqual(r.expenses, -200);
  assert.strictEqual(r.net, 300);
  assert.strictEqual(r.transactions.length, 2);
});

test('cashFlowReport: empty data returns empty array', () => {
  const r = cashFlowReport(makeData(), '2026-01-01', '2026-01-31');
  assert.deepEqual(r, [{ month: '2026-01', income: 0, expenses: 0, net: 0, cumulative: 0 }]);
});

test('cashFlowReport: from > to returns empty array', () => {
  const r = cashFlowReport(makeData(), '2026-02-01', '2026-01-01');
  assert.deepEqual(r, []);
});

test('cashFlowReport: single month has correct values', () => {
  const txs = [
    makeTx({ date: '2026-03-10', amountInDefault: 1000 }),
    makeTx({ date: '2026-03-20', amountInDefault: -400 }),
  ];
  const [entry] = cashFlowReport(makeData(txs), '2026-03-01', '2026-03-31');
  assert.equal(entry.month, '2026-03');
  assert.equal(entry.income, 1000);
  assert.equal(entry.expenses, -400);
  assert.equal(entry.net, 600);
  assert.equal(entry.cumulative, 600);
});

test('cashFlowReport: cumulative accumulates across months', () => {
  const txs = [
    makeTx({ date: '2026-01-15', amountInDefault: -100 }),
    makeTx({ date: '2026-02-15', amountInDefault: -200 }),
  ];
  const r = cashFlowReport(makeData(txs), '2026-01-01', '2026-02-28');
  assert.equal(r.length, 2);
  assert.equal(r[0].cumulative, -100);
  assert.equal(r[1].cumulative, -300);
});

test('report transactions are sorted by date', () => {
  const txs = [
    makeTx({ date: '2026-01-20', amountInDefault: -5 }),
    makeTx({ date: '2026-01-05', amountInDefault: -5 }),
    makeTx({ date: '2026-01-10', amountInDefault: -5 }),
  ];
  const r = monthlyReport(makeData(txs), 2026, 1);
  const dates = r.transactions.map(t => t.date);
  assert.deepEqual(dates, ['2026-01-05', '2026-01-10', '2026-01-20']);
});

// --- categoryTrendReport ---

test('categoryTrendReport monthly: groups by month with gap-filling', () => {
  const cat = { id: 'cat-1', name: 'Streaming', icon: '🍿' };
  const txs = [
    makeTx({ date: '2026-01-10', amountInDefault: -15, categoryId: 'cat-1' }),
    makeTx({ date: '2026-01-20', amountInDefault: -10, categoryId: 'cat-1' }),
    makeTx({ date: '2026-03-05', amountInDefault: -20, categoryId: 'cat-1' }),
  ];
  const r = categoryTrendReport(makeData(txs, [cat]), 'cat-1', '2026-01-01', '2026-03-31', 'monthly');
  assert.equal(r.length, 3);
  assert.equal(r[0].period, '2026-01');
  assert.equal(r[0].total, -25);
  assert.equal(r[0].count, 2);
  assert.equal(r[1].period, '2026-02');
  assert.equal(r[1].total, 0);
  assert.equal(r[1].count, 0);
  assert.equal(r[2].period, '2026-03');
  assert.equal(r[2].total, -20);
  assert.equal(r[2].count, 1);
});

test('categoryTrendReport daily: one entry per day', () => {
  const txs = [
    makeTx({ date: '2026-01-01', amountInDefault: -5, categoryId: 'c1' }),
    makeTx({ date: '2026-01-03', amountInDefault: -10, categoryId: 'c1' }),
  ];
  const r = categoryTrendReport(makeData(txs), 'c1', '2026-01-01', '2026-01-03', 'daily');
  assert.equal(r.length, 3);
  assert.equal(r[0].period, '2026-01-01');
  assert.equal(r[0].total, -5);
  assert.equal(r[1].period, '2026-01-02');
  assert.equal(r[1].total, 0);
  assert.equal(r[2].period, '2026-01-03');
  assert.equal(r[2].total, -10);
});

test('categoryTrendReport quarterly: groups into Q1-Q4', () => {
  const txs = [
    makeTx({ date: '2026-02-15', amountInDefault: -30, categoryId: 'c1' }),
    makeTx({ date: '2026-07-10', amountInDefault: -50, categoryId: 'c1' }),
  ];
  const r = categoryTrendReport(makeData(txs), 'c1', '2026-01-01', '2026-09-30', 'quarterly');
  assert.equal(r.length, 3);
  assert.equal(r[0].period, '2026-Q1');
  assert.equal(r[0].total, -30);
  assert.equal(r[1].period, '2026-Q2');
  assert.equal(r[1].total, 0);
  assert.equal(r[2].period, '2026-Q3');
  assert.equal(r[2].total, -50);
});

test('categoryTrendReport filters to specified category only', () => {
  const txs = [
    makeTx({ date: '2026-01-10', amountInDefault: -15, categoryId: 'cat-a' }),
    makeTx({ date: '2026-01-15', amountInDefault: -99, categoryId: 'cat-b' }),
  ];
  const r = categoryTrendReport(makeData(txs), 'cat-a', '2026-01-01', '2026-01-31', 'monthly');
  assert.equal(r.length, 1);
  assert.equal(r[0].total, -15);
  assert.equal(r[0].count, 1);
});

test('categoryTrendReport returns empty array for no matching data', () => {
  const r = categoryTrendReport(makeData([]), 'nonexistent', '2026-01-01', '2026-03-31', 'monthly');
  assert.equal(r.length, 3);
  assert.ok(r.every(b => b.total === 0 && b.count === 0));
});

// --- detectSpikes ---

test('detectSpikes: fewer than 3 values returns empty', () => {
  assert.deepEqual(detectSpikes([10, 20]), []);
});

test('detectSpikes: all identical values returns empty', () => {
  assert.deepEqual(detectSpikes([5, 5, 5, 5]), []);
});

test('detectSpikes: finds obvious spike', () => {
  const values = [10, 12, 11, 10, 50, 11, 10];
  const spikes = detectSpikes(values);
  assert.ok(spikes.includes(4), 'index 4 (value 50) should be a spike');
  assert.equal(spikes.length, 1);
});

test('detectSpikes: sensitivity adjusts threshold', () => {
  const values = [10, 12, 11, 10, 30, 11, 10];
  assert.equal(detectSpikes(values, 1.0).length, 1, 'low sensitivity catches it');
  assert.equal(detectSpikes(values, 5.0).length, 0, 'high sensitivity ignores it');
});

test('detectSpikes: empty array returns empty', () => {
  assert.deepEqual(detectSpikes([]), []);
});

// --- incomeTrendReport ---

test('incomeTrendReport monthly: returns income per month with gap-filling', () => {
  const txs = [
    makeTx({ date: '2026-01-10', amountInDefault: 3000 }),
    makeTx({ date: '2026-01-20', amountInDefault: 500 }),
    makeTx({ date: '2026-03-05', amountInDefault: 3000 }),
  ];
  const r = incomeTrendReport(makeData(txs), '2026-01-01', '2026-03-31', 'monthly');
  assert.equal(r.length, 3);
  assert.equal(r[0].period, '2026-01');
  assert.equal(r[0].income, 3500);
  assert.equal(r[1].period, '2026-02');
  assert.equal(r[1].income, 0);
  assert.equal(r[2].period, '2026-03');
  assert.equal(r[2].income, 3000);
});

test('incomeTrendReport monthly: ignores expense transactions', () => {
  const txs = [
    makeTx({ date: '2026-01-10', amountInDefault: 3000 }),
    makeTx({ date: '2026-01-15', amountInDefault: -200 }),
  ];
  const r = incomeTrendReport(makeData(txs), '2026-01-01', '2026-01-31', 'monthly');
  assert.equal(r[0].income, 3000);
});

test('incomeTrendReport daily: spreads total period income to every day', () => {
  const txs = [
    makeTx({ date: '2026-01-01', amountInDefault: 3000 }),
    makeTx({ date: '2026-01-15', amountInDefault: -200 }),
  ];
  const r = incomeTrendReport(makeData(txs), '2026-01-01', '2026-01-03', 'daily');
  assert.equal(r.length, 3);
  assert.equal(r[0].income, 3000);
  assert.equal(r[1].income, 3000);
  assert.equal(r[2].income, 3000);
});
