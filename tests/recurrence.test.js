import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampToMonth, expandRecurring, nextOccurrenceAfter } from '../src/recurrence.js';

function makeTx(overrides = {}) {
  return {
    id: 'tx-1',
    date: '2026-01-15',
    amount: -10,
    currency: 'USD',
    amountInDefault: -10,
    exchangeRate: 1,
    categoryId: null,
    labelIds: [],
    description: '',
    recurrence: { frequency: 'monthly', interval: 1, endDate: null },
    ...overrides,
  };
}

function d(str) {
  return new Date(str + 'T00:00:00Z');
}

test('clampToMonth returns correct date for valid day', () => {
  const result = clampToMonth(2026, 0, 15);
  assert.equal(result.getUTCDate(), 15);
  assert.equal(result.getUTCMonth(), 0);
});

test('clampToMonth clamps Feb 30 to Feb 28 in non-leap year', () => {
  const result = clampToMonth(2026, 1, 30);
  assert.equal(result.getUTCDate(), 28);
  assert.equal(result.getUTCMonth(), 1);
});

test('clampToMonth clamps Feb 30 to Feb 29 in leap year', () => {
  const result = clampToMonth(2024, 1, 30);
  assert.equal(result.getUTCDate(), 29);
  assert.equal(result.getUTCMonth(), 1);
});

test('clampToMonth clamps Jan 31 to Feb 28', () => {
  const result = clampToMonth(2026, 1, 31);
  assert.equal(result.getUTCDate(), 28);
});

test('expandRecurring returns [] for null recurrence', () => {
  const tx = makeTx({ recurrence: null });
  assert.deepEqual(expandRecurring(tx, d('2026-12-31')), []);
});

test('monthly recurrence produces correct dates', () => {
  const tx = makeTx({ date: '2026-01-15', recurrence: { frequency: 'monthly', interval: 1, endDate: null } });
  const virtuals = expandRecurring(tx, d('2026-04-30'));
  const dates = virtuals.map(v => v.date);
  assert.deepEqual(dates, ['2026-02-15', '2026-03-15', '2026-04-15']);
});

test('monthly recurrence respects endDate', () => {
  const tx = makeTx({ date: '2026-01-15', recurrence: { frequency: 'monthly', interval: 1, endDate: '2026-03-01' } });
  const virtuals = expandRecurring(tx, d('2026-12-31'));
  const dates = virtuals.map(v => v.date);
  assert.deepEqual(dates, ['2026-02-15']);
});

test('monthly recurrence respects windowEnd', () => {
  const tx = makeTx({ date: '2026-01-15' });
  const virtuals = expandRecurring(tx, d('2026-02-28'));
  const dates = virtuals.map(v => v.date);
  assert.deepEqual(dates, ['2026-02-15']);
});

test('monthly interval=2 produces every-other-month dates', () => {
  const tx = makeTx({ date: '2026-01-01', recurrence: { frequency: 'monthly', interval: 2, endDate: null } });
  const virtuals = expandRecurring(tx, d('2026-07-31'));
  const dates = virtuals.map(v => v.date);
  assert.deepEqual(dates, ['2026-03-01', '2026-05-01', '2026-07-01']);
});

test('monthly recurrence clamps day 31 in short months', () => {
  const tx = makeTx({ date: '2026-01-31', recurrence: { frequency: 'monthly', interval: 1, endDate: null } });
  const virtuals = expandRecurring(tx, d('2026-04-30'));
  const dates = virtuals.map(v => v.date);
  assert.deepEqual(dates, ['2026-02-28', '2026-03-31', '2026-04-30']);
});

test('weekly recurrence produces correct dates', () => {
  const tx = makeTx({ date: '2026-01-01', recurrence: { frequency: 'weekly', interval: 1, endDate: null } });
  const virtuals = expandRecurring(tx, d('2026-01-29'));
  const dates = virtuals.map(v => v.date);
  assert.deepEqual(dates, ['2026-01-08', '2026-01-15', '2026-01-22', '2026-01-29']);
});

test('daily recurrence produces correct dates', () => {
  const tx = makeTx({ date: '2026-01-01', recurrence: { frequency: 'daily', interval: 1, endDate: null } });
  const virtuals = expandRecurring(tx, d('2026-01-04'));
  const dates = virtuals.map(v => v.date);
  assert.deepEqual(dates, ['2026-01-02', '2026-01-03', '2026-01-04']);
});

test('yearly recurrence produces correct dates', () => {
  const tx = makeTx({ date: '2024-02-29', recurrence: { frequency: 'yearly', interval: 1, endDate: null } });
  const virtuals = expandRecurring(tx, d('2027-12-31'));
  const dates = virtuals.map(v => v.date);
  assert.deepEqual(dates, ['2025-02-28', '2026-02-28', '2027-02-28']);
});

test('virtual transactions have isVirtual and sourceId', () => {
  const tx = makeTx({ date: '2026-01-01' });
  const virtuals = expandRecurring(tx, d('2026-02-28'));
  assert.equal(virtuals[0].isVirtual, true);
  assert.equal(virtuals[0].sourceId, 'tx-1');
});

test('windowEnd equal to next date is inclusive', () => {
  const tx = makeTx({ date: '2026-01-15' });
  const virtuals = expandRecurring(tx, d('2026-02-15'));
  assert.equal(virtuals.length, 1);
  assert.equal(virtuals[0].date, '2026-02-15');
});

test('nextOccurrenceAfter monthly returns correct next date', () => {
  assert.equal(nextOccurrenceAfter('2026-01-15', { frequency: 'monthly', interval: 1 }), '2026-02-15');
  assert.equal(nextOccurrenceAfter('2026-01-15', { frequency: 'monthly', interval: 2 }), '2026-03-15');
});

test('nextOccurrenceAfter daily with interval=2 returns correct next date', () => {
  assert.equal(nextOccurrenceAfter('2026-01-01', { frequency: 'daily', interval: 2 }), '2026-01-03');
});

test('nextOccurrenceAfter yearly on leap day clamps correctly', () => {
  assert.equal(nextOccurrenceAfter('2024-02-29', { frequency: 'yearly', interval: 1 }), '2025-02-28');
});
