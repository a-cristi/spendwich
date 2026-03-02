import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../src/store.js';

beforeEach(() => {
  store._reset();
});

test('getData returns empty data initially', () => {
  const d = store.getData();
  assert.deepEqual(d.categories, []);
  assert.deepEqual(d.labels, []);
  assert.deepEqual(d.transactions, []);
});

test('addCategory adds a category', async () => {
  const cat = store.addCategory('Food', '🍔');
  const d = store.getData();
  assert.equal(d.categories.length, 1);
  assert.equal(d.categories[0].name, 'Food');
  assert.equal(d.categories[0].icon, '🍔');
  assert.ok(d.categories[0].id);
  assert.equal(cat.name, 'Food');
});

test('updateCategory modifies existing category', async () => {
  const cat = store.addCategory('Food', '🍔');
  store.updateCategory(cat.id, { name: 'Groceries' });
  const d = store.getData();
  assert.equal(d.categories[0].name, 'Groceries');
});

test('updateCategory throws on unknown id', async () => {
  assert.throws(() => store.updateCategory('nonexistent', { name: 'X' }), /Category not found/);
});

test('deleteCategory removes the category', async () => {
  const cat = store.addCategory('Food', '🍔');
  store.deleteCategory(cat.id);
  assert.equal(store.getData().categories.length, 0);
});

test('deleteCategory does not touch categoryId on transactions', async () => {
  const cat = store.addCategory('Food', '🍔');
  store.addTransaction({ date: '2026-01-01', amount: -10, currency: 'USD', categoryId: cat.id });
  store.deleteCategory(cat.id);
  const d = store.getData();
  assert.equal(d.transactions[0].categoryId, cat.id);
  assert.equal(d.categories.length, 0);
});

test('addLabel adds a label', async () => {
  const lbl = store.addLabel('work');
  const d = store.getData();
  assert.equal(d.labels.length, 1);
  assert.equal(d.labels[0].name, 'work');
  assert.ok(lbl.id);
});

test('updateLabel modifies existing label', async () => {
  const lbl = store.addLabel('work');
  store.updateLabel(lbl.id, { name: 'work-travel' });
  assert.equal(store.getData().labels[0].name, 'work-travel');
});

test('deleteLabel does not strip labelIds from transactions', async () => {
  const lbl = store.addLabel('work');
  store.addTransaction({ date: '2026-01-01', amount: -10, currency: 'USD', labelIds: [lbl.id] });
  store.deleteLabel(lbl.id);
  const d = store.getData();
  assert.deepEqual(d.transactions[0].labelIds, [lbl.id]);
  assert.equal(d.labels.length, 0);
});

test('addTransaction adds a transaction', async () => {
  const tx = store.addTransaction({ date: '2026-01-15', amount: -42.5, currency: 'EUR' });
  const d = store.getData();
  assert.equal(d.transactions.length, 1);
  assert.equal(d.transactions[0].amount, -42.5);
  assert.ok(tx.id);
});

test('updateTransaction modifies existing transaction', async () => {
  const tx = store.addTransaction({ date: '2026-01-15', amount: -10, currency: 'USD' });
  store.updateTransaction(tx.id, { amount: -20 });
  assert.equal(store.getData().transactions[0].amount, -20);
});

test('deleteTransaction removes transaction', async () => {
  const tx = store.addTransaction({ date: '2026-01-01', amount: -5, currency: 'USD' });
  store.deleteTransaction(tx.id);
  assert.equal(store.getData().transactions.length, 0);
});

test('importBulk appends categories, labels, transactions', async () => {
  const cats = [{ id: 'cat-1', name: 'Food', icon: '🍔' }];
  const lbls = [{ id: 'lbl-1', name: 'work' }];
  const txs = [{ id: 'tx-1', date: '2026-01-01', amount: -10, currency: 'USD' }];
  store.importBulk(cats, lbls, txs);
  const d = store.getData();
  assert.equal(d.categories.length, 1);
  assert.equal(d.labels.length, 1);
  assert.equal(d.transactions.length, 1);
  assert.equal(d.transactions[0].id, 'tx-1');
});

test('importBulk does not duplicate existing categories by id', async () => {
  const cat = store.addCategory('Food', '🍔');
  store.importBulk([{ id: cat.id, name: 'Food Duplicate', icon: '🥗' }], [], []);
  assert.equal(store.getData().categories.length, 1);
  assert.equal(store.getData().categories[0].name, 'Food');
});

test('exportData round-trips through JSON.parse', async () => {
  store.addCategory('Food', '🍔');
  store.addTransaction({ date: '2026-01-01', amount: -10, currency: 'USD' });
  const json = store.exportData();
  const parsed = JSON.parse(json);
  assert.equal(parsed.categories.length, 1);
  assert.equal(parsed.transactions.length, 1);
});

test('loadData replaces state with imported data', async () => {
  store.addCategory('Old', '#000');
  const freshData = JSON.stringify({
    version: 2,
    settings: { defaultCurrency: 'EUR' },
    categories: [{ id: 'x', name: 'New', icon: '🏷️' }],
    labels: [],
    transactions: [],
  });
  store.loadData(freshData);
  const d = store.getData();
  assert.equal(d.categories.length, 1);
  assert.equal(d.categories[0].name, 'New');
  assert.equal(d.settings.defaultCurrency, 'EUR');
});
