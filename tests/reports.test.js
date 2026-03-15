import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthlyReport, yearlyReport, customRangeReport, allTimeReport, cashFlowReport } from '../src/reports.js';
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
