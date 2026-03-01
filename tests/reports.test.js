import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthlyReport, yearlyReport, customRangeReport } from '../src/reports.js';
import { emptyData } from '../src/schema.js';

function makeData(txs = [], cats = []) {
  return { ...emptyData(), transactions: txs, categories: cats };
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
  const cats = [{ id: 'cat-1', name: 'Food', color: '#f00' }];
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
