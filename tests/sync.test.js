import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSameData, normalizeForCompare } from '../src/sync.js';

const base = {
  version: 2,
  settings: { defaultCurrency: 'USD' },
  categories: [{ id: 'cat-1', name: 'Food', icon: '🍔' }],
  labels: [{ id: 'lbl-2', name: 'Work' }, { id: 'lbl-1', name: 'Personal' }],
  transactions: [
    { id: 'tx-2', date: '2024-02-01', amount: -20, currency: 'USD', description: 'B', category: 'cat-1', labels: [], amountInDefault: -20, exchangeRate: 1 },
    { id: 'tx-1', date: '2024-01-01', amount: -10, currency: 'USD', description: 'A', category: 'cat-1', labels: [], amountInDefault: -10, exchangeRate: 1 },
  ],
};
const canonical = JSON.stringify(base, null, 2);

test('isSameData: identical strings → true (fast path)', () => {
  assert.equal(isSameData(canonical, canonical), true);
});

test('isSameData: null inputs → false', () => {
  assert.equal(isSameData(null, canonical), false);
  assert.equal(isSameData(canonical, null), false);
  assert.equal(isSameData(null, null), false);
});

test('isSameData: invalid JSON → false', () => {
  assert.equal(isSameData('{bad', canonical), false);
  assert.equal(isSameData(canonical, '{bad'), false);
});

test('isSameData: different data (amount changed) → false', () => {
  const other = JSON.parse(canonical);
  other.transactions[0].amount = -99;
  assert.equal(isSameData(canonical, JSON.stringify(other)), false);
});

test('isSameData: different data (transaction added) → false', () => {
  const other = JSON.parse(canonical);
  other.transactions.push({ id: 'tx-3', date: '2024-03-01', amount: -5, currency: 'USD', description: 'C', category: 'cat-1', labels: [], amountInDefault: -5, exchangeRate: 1 });
  assert.equal(isSameData(canonical, JSON.stringify(other)), false);
});

test('isSameData: top-level keys in different order → true', () => {
  const reordered = JSON.stringify({
    transactions: base.transactions,
    labels: base.labels,
    categories: base.categories,
    settings: base.settings,
    version: base.version,
  });
  assert.equal(isSameData(canonical, reordered), true);
});

test('isSameData: transaction array in different order → true', () => {
  const other = JSON.parse(canonical);
  other.transactions = [other.transactions[1], other.transactions[0]];
  assert.equal(isSameData(canonical, JSON.stringify(other)), true);
});

test('isSameData: label array in different order → true', () => {
  const other = JSON.parse(canonical);
  other.labels = [other.labels[1], other.labels[0]];
  assert.equal(isSameData(canonical, JSON.stringify(other)), true);
});

test('isSameData: transaction field keys in different order → true', () => {
  const other = JSON.parse(canonical);
  const tx = other.transactions[0];
  other.transactions[0] = {
    description: tx.description, id: tx.id, amount: tx.amount,
    date: tx.date, currency: tx.currency, category: tx.category,
    labels: tx.labels, amountInDefault: tx.amountInDefault, exchangeRate: tx.exchangeRate,
  };
  assert.equal(isSameData(canonical, JSON.stringify(other)), true);
});

test('normalizeForCompare: sorts object keys', () => {
  const result = normalizeForCompare({ z: 1, a: 2, m: 3 });
  assert.deepEqual(Object.keys(result), ['a', 'm', 'z']);
});

test('normalizeForCompare: sorts id-bearing arrays by id', () => {
  const result = normalizeForCompare([{ id: 'c' }, { id: 'a' }, { id: 'b' }]);
  assert.deepEqual(result.map(x => x.id), ['a', 'b', 'c']);
});

test('normalizeForCompare: preserves order of primitive arrays', () => {
  const arr = ['z', 'a', 'm'];
  const result = normalizeForCompare(arr);
  assert.deepEqual(result, ['z', 'a', 'm']);
});

test('normalizeForCompare: recurses into nested objects', () => {
  const result = normalizeForCompare({ b: { z: 1, a: 2 }, a: 3 });
  assert.deepEqual(Object.keys(result), ['a', 'b']);
  assert.deepEqual(Object.keys(result.b), ['a', 'z']);
});
