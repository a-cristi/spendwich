import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthlyReport, yearlyReport, customRangeReport, allTimeReport, cashFlowReport, categoryTrendReport, labelTrendReport, detectSpikes, incomeTrendReport, computeStabilityLabel } from '../src/reports.js';
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

test('categoryTrendReport daily: single-month range finds transactions on all days', () => {
  const txs = [
    makeTx({ date: '2026-04-01', amountInDefault: -10, categoryId: 'c1' }),
    makeTx({ date: '2026-04-02', amountInDefault: -20, categoryId: 'c1' }),
  ];
  const r = categoryTrendReport(makeData(txs), 'c1', '2026-04-01', '2026-04-30', 'daily');
  assert.equal(r.length, 30);
  assert.equal(r[0].period, '2026-04-01');
  assert.equal(r[0].total, -10);
  assert.equal(r[0].count, 1);
  assert.equal(r[1].period, '2026-04-02');
  assert.equal(r[1].total, -20);
  assert.equal(r[1].count, 1);
  assert.ok(r.slice(2).every(b => b.total === 0 && b.count === 0));
});

// --- labelTrendReport ---

test('labelTrendReport monthly: groups by month with gap-filling', () => {
  const lbl = { id: 'lbl-1', name: 'Coffee' };
  const txs = [
    makeTx({ date: '2026-01-10', amountInDefault: -15, labelIds: ['lbl-1'] }),
    makeTx({ date: '2026-01-20', amountInDefault: -10, labelIds: ['lbl-1'] }),
    makeTx({ date: '2026-03-05', amountInDefault: -20, labelIds: ['lbl-1'] }),
  ];
  const r = labelTrendReport(makeData(txs, [], [lbl]), 'lbl-1', '2026-01-01', '2026-03-31', 'monthly');
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

test('labelTrendReport daily: one entry per day', () => {
  const txs = [
    makeTx({ date: '2026-01-01', amountInDefault: -5, labelIds: ['l1'] }),
    makeTx({ date: '2026-01-03', amountInDefault: -10, labelIds: ['l1'] }),
  ];
  const r = labelTrendReport(makeData(txs, [], [{ id: 'l1', name: 'X' }]), 'l1', '2026-01-01', '2026-01-03', 'daily');
  assert.equal(r.length, 3);
  assert.equal(r[0].period, '2026-01-01');
  assert.equal(r[0].total, -5);
  assert.equal(r[1].period, '2026-01-02');
  assert.equal(r[1].total, 0);
  assert.equal(r[2].total, -10);
});

test('labelTrendReport quarterly: groups into Q1-Q4', () => {
  const txs = [
    makeTx({ date: '2026-02-15', amountInDefault: -30, labelIds: ['l1'] }),
    makeTx({ date: '2026-07-10', amountInDefault: -50, labelIds: ['l1'] }),
  ];
  const r = labelTrendReport(makeData(txs, [], [{ id: 'l1', name: 'X' }]), 'l1', '2026-01-01', '2026-09-30', 'quarterly');
  assert.equal(r.length, 3);
  assert.equal(r[0].period, '2026-Q1');
  assert.equal(r[0].total, -30);
  assert.equal(r[1].period, '2026-Q2');
  assert.equal(r[1].total, 0);
  assert.equal(r[2].total, -50);
});

test('labelTrendReport filters to specified label only', () => {
  const txs = [
    makeTx({ date: '2026-01-10', amountInDefault: -15, labelIds: ['lbl-a'] }),
    makeTx({ date: '2026-01-15', amountInDefault: -99, labelIds: ['lbl-b'] }),
  ];
  const r = labelTrendReport(makeData(txs, [], [{ id: 'lbl-a', name: 'A' }, { id: 'lbl-b', name: 'B' }]), 'lbl-a', '2026-01-01', '2026-01-31', 'monthly');
  assert.equal(r.length, 1);
  assert.equal(r[0].total, -15);
  assert.equal(r[0].count, 1);
});

test('labelTrendReport null labelId returns unlabeled transactions only', () => {
  const txs = [
    makeTx({ date: '2026-01-10', amountInDefault: -15, labelIds: ['lbl-1'] }),
    makeTx({ date: '2026-01-15', amountInDefault: -40, labelIds: [] }),
  ];
  const r = labelTrendReport(makeData(txs, [], [{ id: 'lbl-1', name: 'A' }]), null, '2026-01-01', '2026-01-31', 'monthly');
  assert.equal(r.length, 1);
  assert.equal(r[0].total, -40);
  assert.equal(r[0].count, 1);
});

test('labelTrendReport multi-label tx counted in both labels', () => {
  const txs = [
    makeTx({ date: '2026-01-10', amountInDefault: -50, labelIds: ['l1', 'l2'] }),
  ];
  const lbls = [{ id: 'l1', name: 'A' }, { id: 'l2', name: 'B' }];
  const r1 = labelTrendReport(makeData(txs, [], lbls), 'l1', '2026-01-01', '2026-01-31', 'monthly');
  const r2 = labelTrendReport(makeData(txs, [], lbls), 'l2', '2026-01-01', '2026-01-31', 'monthly');
  assert.equal(r1[0].total, -50);
  assert.equal(r2[0].total, -50);
});

test('labelTrendReport returns zeroed array for no matching data', () => {
  const r = labelTrendReport(makeData([]), 'nonexistent', '2026-01-01', '2026-03-31', 'monthly');
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
  // Series with natural variance so the rolling spread is meaningful
  const values = [8, 14, 12, 10, 20, 11, 10];
  assert.equal(detectSpikes(values, 1.0).length, 1, 'low sensitivity catches it');
  assert.equal(detectSpikes(values, 5.0).length, 0, 'high sensitivity ignores it');
});

test('detectSpikes: empty array returns empty', () => {
  assert.deepEqual(detectSpikes([]), []);
});

test('detectSpikes: trailing-only — past spike does not inflate later baseline', () => {
  // index 2 is a big spike; index 5 should still be caught as a local spike vs the recent calm
  const values = [10, 10, 80, 10, 10, 10, 10, 10, 60, 10];
  const spikes = detectSpikes(values);
  assert.ok(spikes.includes(2), 'index 2 (80) should be flagged');
  assert.ok(spikes.includes(8), 'index 8 (60) should still be flagged vs its calm trailing window');
});

test('detectSpikes: global fallback does not include current value in its own baseline', () => {
  // index 2 has only 2 non-zero priors → global fallback.
  // If 50 is included in global stats: mean=18, stdDev=16, threshold=50 → 50 barely misses (self-suppression bug).
  // With leave-one-out: remaining [10,10,10,10] → mean=10, stdDev=0 → percentage rule: 50 > 10×1.5 → SPIKE.
  assert.ok(detectSpikes([10, 10, 50, 10, 10]).includes(2), '[10,10,50,10,10]: index 2 must be a spike');
});

test('detectSpikes: global fallback applies for first points with < 3 non-zero priors', () => {
  // index 2 has only 2 non-zero priors → global fallback path.
  // Leave-one-out: remaining [10×7] → mean=10, stdDev=0 → percentage rule: 50>15 → SPIKE.
  const values = [10, 10, 50, 10, 10, 10, 10, 10];
  const spikes = detectSpikes(values);
  assert.ok(spikes.includes(2), 'index 2 should be caught via global fallback');
});

test('detectSpikes: series with fewer than 5 non-zero values produces no spikes', () => {
  // Not enough evidence — honest to return nothing rather than a statistically flimsy dot
  assert.deepEqual(detectSpikes([0, 0, 20, 0, 200]), []);
  assert.deepEqual(detectSpikes([10, 10, 10, 80]), []);
});

test('detectSpikes: MAD=0 above floor — flat stable series spikes correctly', () => {
  // All prior values are 12 (MAD=0), base=12 >= FLOOR=5, 30 > 12*1.5=18
  const values = [12, 12, 12, 12, 30];
  const spikes = detectSpikes(values);
  assert.ok(spikes.includes(4), 'index 4 (30) should be flagged via MAD=0 percentage rule');
});

test('detectSpikes: MAD=0 below floor — trivial flat series does not spike', () => {
  // base=2 < FLOOR=5, so percentage rule suppressed
  const values = [2, 2, 2, 2, 4];
  const spikes = detectSpikes(values);
  assert.equal(spikes.length, 0, 'trivial series below floor should produce no spikes');
});

test('detectSpikes: non-zero filtering — zeros excluded from trailing window', () => {
  // 6 non-zero values total (≥ MIN_SERIES=5). The window for the last point skips zeros
  // and compares against actual spend levels [80,90,85,100,90] (median≈90, MAD=5),
  // not a diluted average pulled toward zero by the empty months.
  const values = [0, 80, 0, 90, 0, 85, 0, 100, 0, 90, 0, 0, 400];
  const spikes = detectSpikes(values);
  assert.ok(spikes.includes(12), 'index 12 (400) should be flagged vs non-zero baseline of ~90');
});

test('detectSpikes: daily granularity uses 21-period window', () => {
  // 20 calm values then a spike — rolling window of 21 should still catch it
  const values = Array(20).fill(10).concat([80]);
  const spikes = detectSpikes(values, 2.0, 'daily');
  assert.ok(spikes.includes(20), 'spike at index 20 should be detected with 21-period daily window');
});

test('detectSpikes: monthly granularity uses 6-period window', () => {
  // 6 calm values then a spike — rolling window of 6 should catch it
  const values = [10, 10, 10, 10, 10, 10, 80];
  const spikes = detectSpikes(values, 2.0, 'monthly');
  assert.ok(spikes.includes(6), 'spike at index 6 should be detected with 6-period monthly window');
});

// --- computeStabilityLabel ---

function makeTrend(activeTotals, totalPeriods) {
  // Fill with active periods at the start, gaps at the end
  const buckets = [];
  for (let i = 0; i < totalPeriods; i++) {
    if (i < activeTotals.length) buckets.push({ period: `2025-${String(i + 1).padStart(2, '0')}`, total: -activeTotals[i], count: 1 });
    else buckets.push({ period: `2025-${String(i + 1).padStart(2, '0')}`, total: 0, count: 0 });
  }
  return buckets;
}

test('computeStabilityLabel: too few total periods returns null', () => {
  const td = makeTrend([100, 200, 150], 4); // 4 < MIN_PERIODS=5
  assert.strictEqual(computeStabilityLabel(td, -2000), null);
});

test('computeStabilityLabel: too few active periods returns null', () => {
  const td = makeTrend([100, 300], 8); // only 2 active < MIN_ACTIVE=3
  assert.strictEqual(computeStabilityLabel(td, -2000), null);
});

test('computeStabilityLabel: tiny hobby noise does not flag (materiality gate)', () => {
  // 4 active out of 10 — active values are very small vs total expenses
  const td = makeTrend([5, 8, 3, 20], 10);
  assert.strictEqual(computeStabilityLabel(td, -2000), null, 'MAD too small vs avg period spend');
});

test('computeStabilityLabel: sparse high-variance flags via Path A', () => {
  // 3 active out of 12 (ratio=0.25 < 0.5), high RMAD, material MAD
  const td = makeTrend([50, 800, 120], 12);
  assert.strictEqual(computeStabilityLabel(td, -500), 'erratic');
});

test('computeStabilityLabel: high-activity extreme-variance flags via Path B', () => {
  // 8 active out of 12 (ratio=0.67 < 0.75), bimodal: 4 × $5 routine + 4 × $500 procedure
  // med=252.5, mad=247.5, rmad≈0.98 ≥ RMAD_EXTREME=0.9
  // Note: RMAD for positive values is mathematically bounded at ~1.0; 0.9 is the "very high bar"
  const td = makeTrend([5, 5, 5, 5, 500, 500, 500, 500], 12);
  assert.strictEqual(computeStabilityLabel(td, -2000), 'erratic');
});

test('computeStabilityLabel: dense smooth category does not flag (subscription)', () => {
  // 12 active out of 12 (ratio=1.0 ≥ 0.5 and ≥ 0.75), near-constant values
  const td = makeTrend([300, 305, 295, 302, 298, 301, 299, 303, 297, 304, 296, 300], 12);
  assert.strictEqual(computeStabilityLabel(td, -3600), null, 'stable subscription should not be erratic');
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
