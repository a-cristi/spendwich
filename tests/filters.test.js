import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesGlob, expandAndFilter, groupByCategory, groupByLabel } from '../src/filters.js';

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

function d(str) { return new Date(str + 'T00:00:00Z'); }

// --- matchesGlob ---

test('matchesGlob: exact match without wildcard', () => {
  assert.equal(matchesGlob('food', 'food'), true);
  assert.equal(matchesGlob('food', 'drink'), false);
});

test('matchesGlob: * matches any chars', () => {
  assert.equal(matchesGlob('*-hotel', 'Paris-hotel'), true);
  assert.equal(matchesGlob('*-hotel', 'London-hotel'), true);
  assert.equal(matchesGlob('*-hotel', 'taxi'), false);
});

test('matchesGlob: leading and trailing wildcard', () => {
  assert.equal(matchesGlob('*work*', 'framework'), true);
  assert.equal(matchesGlob('*work*', 'works'), true);
  assert.equal(matchesGlob('*work*', 'nothing'), false);
});

test('matchesGlob: wildcard only matches everything', () => {
  assert.equal(matchesGlob('*', 'anything'), true);
  assert.equal(matchesGlob('*', ''), true);
});

// --- expandAndFilter ---

test('expandAndFilter with no filters returns all originals + virtuals', () => {
  const tx1 = makeTx({ date: '2026-01-01' });
  const tx2 = makeTx({ date: '2026-01-02', recurrence: { frequency: 'monthly', interval: 1, endDate: null } });
  const result = expandAndFilter([tx1, tx2], { windowEnd: d('2026-03-31') });
  assert.ok(result.length >= 3); // tx1, tx2 original, tx2 virtual Feb, tx2 virtual Mar
  assert.ok(result.some(t => t.date === '2026-01-01'));
  assert.ok(result.some(t => t.date === '2026-02-02'));
});

test('expandAndFilter filters by categoryId', () => {
  const tx1 = makeTx({ categoryId: 'cat-a' });
  const tx2 = makeTx({ categoryId: 'cat-b' });
  const result = expandAndFilter([tx1, tx2], { categoryId: 'cat-a', windowEnd: d('2026-12-31') });
  assert.equal(result.length, 1);
  assert.equal(result[0].categoryId, 'cat-a');
});

test('expandAndFilter filters by labelPattern using label name', () => {
  const labels = [
    { id: 'id-1', name: 'work' },
    { id: 'id-2', name: 'home' },
  ];
  const tx1 = makeTx({ labelIds: ['id-1'] });
  const tx2 = makeTx({ labelIds: ['id-2'] });
  const result = expandAndFilter([tx1, tx2], { labelPattern: 'work', labels, windowEnd: d('2026-12-31') });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].labelIds, ['id-1']);
});

test('expandAndFilter label glob wildcard matches label names', () => {
  const labels = [
    { id: 'id-1', name: 'Paris-hotel' },
    { id: 'id-2', name: 'taxi' },
  ];
  const tx1 = makeTx({ labelIds: ['id-1'] });
  const tx2 = makeTx({ labelIds: ['id-2'] });
  const result = expandAndFilter([tx1, tx2], { labelPattern: '*-hotel', labels, windowEnd: d('2026-12-31') });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].labelIds, ['id-1']);
});

test('expandAndFilter result is sorted by date ascending', () => {
  const tx1 = makeTx({ date: '2026-03-01' });
  const tx2 = makeTx({ date: '2026-01-01' });
  const tx3 = makeTx({ date: '2026-02-01' });
  const result = expandAndFilter([tx1, tx2, tx3], { windowEnd: d('2026-12-31') });
  assert.equal(result[0].date, '2026-01-01');
  assert.equal(result[1].date, '2026-02-01');
  assert.equal(result[2].date, '2026-03-01');
});

// --- groupByCategory ---

test('groupByCategory produces correct totals', () => {
  const cats = [{ id: 'cat-1', name: 'Food', color: '#f00' }];
  const txs = [
    makeTx({ categoryId: 'cat-1', amountInDefault: -10 }),
    makeTx({ categoryId: 'cat-1', amountInDefault: -20 }),
    makeTx({ categoryId: null, amountInDefault: -5 }),
  ];
  const groups = groupByCategory(txs, cats);
  assert.ok(groups.has('cat-1'));
  assert.ok(groups.has(null));
  assert.equal(groups.get('cat-1').total, -30);
  assert.equal(groups.get(null).total, -5);
  assert.equal(groups.get('cat-1').category.name, 'Food');
  assert.equal(groups.get(null).category, null);
});

// --- groupByLabel ---

test('groupByLabel produces correct totals', () => {
  const lbls = [{ id: 'lbl-1', name: 'work' }];
  const txs = [
    makeTx({ labelIds: ['lbl-1'], amountInDefault: -15 }),
    makeTx({ labelIds: [], amountInDefault: -5 }),
  ];
  const groups = groupByLabel(txs, lbls);
  assert.ok(groups.has('lbl-1'));
  assert.ok(groups.has(null));
  assert.equal(groups.get('lbl-1').total, -15);
  assert.equal(groups.get(null).total, -5);
  assert.equal(groups.get('lbl-1').label.name, 'work');
});

test('groupByLabel handles transaction with multiple labels', () => {
  const lbls = [
    { id: 'lbl-a', name: 'a' },
    { id: 'lbl-b', name: 'b' },
  ];
  const txs = [makeTx({ labelIds: ['lbl-a', 'lbl-b'], amountInDefault: -10 })];
  const groups = groupByLabel(txs, lbls);
  assert.equal(groups.get('lbl-a').total, -10);
  assert.equal(groups.get('lbl-b').total, -10);
});
