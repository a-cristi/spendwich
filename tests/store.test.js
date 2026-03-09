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

test('updateSettings updates defaultCurrency', () => {
  store.updateSettings({ defaultCurrency: 'EUR' });
  assert.equal(store.getData().settings.defaultCurrency, 'EUR');
});

test('updateSettings merges fields — other settings preserved', () => {
  store.updateSettings({ defaultCurrency: 'GBP' });
  store.updateSettings({ defaultCurrency: 'JPY' });
  assert.equal(store.getData().settings.defaultCurrency, 'JPY');
});

test('onDataChange listener is called on addCategory', () => {
  let count = 0;
  store.onDataChange(() => count++);
  store.addCategory('Food', '🍔');
  assert.equal(count, 1);
});

test('onDataChange listener is called on addTransaction and updateTransaction', () => {
  let count = 0;
  store.onDataChange(() => count++);
  const tx = store.addTransaction({ date: '2026-01-01', amount: -10, currency: 'USD' });
  store.updateTransaction(tx.id, { amount: -20 });
  assert.equal(count, 2);
});

test('importBulk does not duplicate labels by id', () => {
  const lbl = store.addLabel('work');
  store.importBulk([], [{ id: lbl.id, name: 'work-duplicate' }], []);
  assert.equal(store.getData().labels.length, 1);
  assert.equal(store.getData().labels[0].name, 'work');
});

test('loadData migrates v1 data: adds icon, removes color', () => {
  const v1 = JSON.stringify({
    version: 1,
    settings: { defaultCurrency: 'USD' },
    categories: [{ id: 'cat-1', name: 'Food', color: '#ff0000' }],
    labels: [],
    transactions: [],
  });
  store.loadData(v1);
  const d = store.getData();
  assert.equal(d.version, 2);
  assert.equal(d.categories[0].icon, '🏷️');
  assert.equal(Object.prototype.hasOwnProperty.call(d.categories[0], 'color'), false);
});

// --- Recurring scope operations ---

function makeRecurringTx(overrides = {}) {
  return store.addTransaction({
    date: '2026-01-01',
    amount: -10,
    currency: 'USD',
    amountInDefault: -10,
    exchangeRate: 1,
    categoryId: null,
    labelIds: [],
    description: 'Rent',
    recurrence: { frequency: 'monthly', interval: 1, endDate: null },
    ...overrides,
  });
}

test('deleteOccurrenceAt non-first: source becomes head, tail added, occurrence absent', () => {
  const src = makeRecurringTx({ date: '2026-01-01', recurrence: { frequency: 'monthly', interval: 1, endDate: '2026-06-01' } });
  store.deleteOccurrenceAt(src.id, '2026-03-01');
  const txs = store.getData().transactions;
  const head = txs.find(t => t.id === src.id);
  assert.equal(head.recurrence.endDate, '2026-02-28'); // day before Mar 1
  const tail = txs.find(t => t.id !== src.id);
  assert.ok(tail, 'tail transaction created');
  assert.equal(tail.date, '2026-04-01');
  assert.equal(tail.recurrence.endDate, '2026-06-01');
});

test('deleteOccurrenceAt first occurrence: source date advances to next', () => {
  const src = makeRecurringTx({ date: '2026-01-01', recurrence: { frequency: 'monthly', interval: 1, endDate: null } });
  store.deleteOccurrenceAt(src.id, '2026-01-01');
  const txs = store.getData().transactions;
  assert.equal(txs.length, 1);
  assert.equal(txs[0].id, src.id);
  assert.equal(txs[0].date, '2026-02-01');
});

test('deleteOccurrenceAt only occurrence: source is removed', () => {
  const src = makeRecurringTx({ date: '2026-01-01', recurrence: { frequency: 'monthly', interval: 1, endDate: '2026-01-31' } });
  store.deleteOccurrenceAt(src.id, '2026-01-01');
  assert.equal(store.getData().transactions.length, 0);
});

test('truncateSeries sets endDate to day before fromDate', () => {
  const src = makeRecurringTx({ date: '2026-01-01' });
  store.truncateSeries(src.id, '2026-04-01');
  const tx = store.getData().transactions[0];
  assert.equal(tx.recurrence.endDate, '2026-03-31');
});

test('truncateSeries with fromDate equal to source.date deletes the source', () => {
  const src = makeRecurringTx({ date: '2026-01-01' });
  store.truncateSeries(src.id, '2026-01-01');
  assert.equal(store.getData().transactions.length, 0);
});

test('overrideOccurrence: source becomes head, one-off added, tail added', () => {
  const src = makeRecurringTx({ date: '2026-01-01', recurrence: { frequency: 'monthly', interval: 1, endDate: '2026-06-01' } });
  store.overrideOccurrence(src.id, '2026-03-01', { date: '2026-03-01', amount: -999, currency: 'USD', amountInDefault: -999, exchangeRate: 1, categoryId: null, labelIds: [], description: 'override' });
  const txs = store.getData().transactions;
  assert.equal(txs.length, 3);
  const head = txs.find(t => t.id === src.id);
  assert.equal(head.recurrence.endDate, '2026-02-28');
  const oneOff = txs.find(t => t.date === '2026-03-01' && t.recurrence === null);
  assert.ok(oneOff);
  assert.equal(oneOff.amount, -999);
  const tail = txs.find(t => t.date === '2026-04-01');
  assert.ok(tail);
  assert.equal(tail.recurrence.endDate, '2026-06-01');
});

test('splitSeries: source becomes head, new series added from fromDate', () => {
  const src = makeRecurringTx({ date: '2026-01-01', recurrence: { frequency: 'monthly', interval: 1, endDate: null } });
  store.splitSeries(src.id, '2026-04-01', { date: '2026-04-01', amount: -20, currency: 'USD', amountInDefault: -20, exchangeRate: 1, categoryId: null, labelIds: [], description: 'new', recurrence: { frequency: 'monthly', interval: 1, endDate: null } });
  const txs = store.getData().transactions;
  assert.equal(txs.length, 2);
  const head = txs.find(t => t.id === src.id);
  assert.equal(head.recurrence.endDate, '2026-03-31');
  const newSeries = txs.find(t => t.id !== src.id);
  assert.equal(newSeries.date, '2026-04-01');
  assert.equal(newSeries.amount, -20);
});

test('splitSeries with fromDate equal to source.date updates source (edit-all)', () => {
  const src = makeRecurringTx({ date: '2026-01-01' });
  store.splitSeries(src.id, '2026-01-01', { date: '2026-01-01', amount: -50, currency: 'USD', amountInDefault: -50, exchangeRate: 1, categoryId: null, labelIds: [], description: 'updated', recurrence: { frequency: 'monthly', interval: 1, endDate: null } });
  const txs = store.getData().transactions;
  assert.equal(txs.length, 1);
  assert.equal(txs[0].amount, -50);
});
