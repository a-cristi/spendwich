import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CURRENT_VERSION, emptyData, makeCategory, makeLabel, makeTransaction, validate, migrate } from '../src/schema.js';

test('CURRENT_VERSION is 1', () => {
  assert.equal(CURRENT_VERSION, 1);
});

test('emptyData returns correct shape', () => {
  const d = emptyData();
  assert.equal(d.version, 1);
  assert.deepEqual(d.categories, []);
  assert.deepEqual(d.labels, []);
  assert.deepEqual(d.transactions, []);
  assert.equal(d.settings.defaultCurrency, 'USD');
});

test('makeCategory sets defaults', () => {
  const c = makeCategory('Food');
  assert.equal(c.name, 'Food');
  assert.ok(c.id);
  assert.ok(c.color);
});

test('makeLabel sets name and id', () => {
  const l = makeLabel('work');
  assert.equal(l.name, 'work');
  assert.ok(l.id);
});

test('makeTransaction applies defaults', () => {
  const tx = makeTransaction({ date: '2026-01-15', amount: -10, currency: 'USD' });
  assert.equal(tx.date, '2026-01-15');
  assert.equal(tx.amount, -10);
  assert.equal(tx.amountInDefault, -10);
  assert.equal(tx.exchangeRate, 1);
  assert.equal(tx.categoryId, null);
  assert.deepEqual(tx.labelIds, []);
  assert.equal(tx.description, '');
  assert.equal(tx.recurrence, null);
  assert.ok(tx.id);
});

test('makeTransaction preserves provided id', () => {
  const tx = makeTransaction({ id: 'abc-123', date: '2026-01-01', amount: -5, currency: 'USD' });
  assert.equal(tx.id, 'abc-123');
});

test('validate accepts valid data', () => {
  const d = emptyData();
  assert.doesNotThrow(() => validate(d));
});

test('validate rejects missing categories', () => {
  const d = { ...emptyData(), categories: undefined };
  assert.throws(() => validate(d), /categories must be an array/);
});

test('validate rejects bad transaction date', () => {
  const d = emptyData();
  d.transactions.push({ id: 't1', date: '01/15/2026', amount: -10, currency: 'USD', amountInDefault: -10, exchangeRate: 1, labelIds: [], recurrence: null });
  assert.throws(() => validate(d), /invalid date/);
});

test('validate rejects non-number amount', () => {
  const d = emptyData();
  d.transactions.push({ id: 't1', date: '2026-01-01', amount: '-10', currency: 'USD', amountInDefault: -10, exchangeRate: 1, labelIds: [], recurrence: null });
  assert.throws(() => validate(d), /amount must be a number/);
});

test('validate rejects unknown recurrence frequency', () => {
  const d = emptyData();
  d.transactions.push({ id: 't1', date: '2026-01-01', amount: -10, currency: 'USD', amountInDefault: -10, exchangeRate: 1, labelIds: [], recurrence: { frequency: 'hourly', interval: 1, endDate: null } });
  assert.throws(() => validate(d), /unknown recurrence frequency/);
});

test('migrate is a no-op at v1', () => {
  const d = emptyData();
  const result = migrate(d);
  assert.equal(result.version, 1);
});

test('migrate warns but does not throw on future version', () => {
  const messages = [];
  const orig = console.warn;
  console.warn = (...args) => messages.push(args.join(' '));
  try {
    const d = { ...emptyData(), version: 99 };
    assert.doesNotThrow(() => migrate(d));
    assert.ok(messages.some(m => m.includes('99')));
  } finally {
    console.warn = orig;
  }
});

test('validate rejects exchangeRate of 0', () => {
  const d = emptyData();
  d.transactions.push({ id: 't1', date: '2026-01-01', amount: -10, currency: 'USD', amountInDefault: -10, exchangeRate: 0, labelIds: [], recurrence: null });
  assert.throws(() => validate(d), /exchangeRate must be a positive number/);
});

test('validate rejects negative exchangeRate', () => {
  const d = emptyData();
  d.transactions.push({ id: 't1', date: '2026-01-01', amount: -10, currency: 'USD', amountInDefault: -10, exchangeRate: -1, labelIds: [], recurrence: null });
  assert.throws(() => validate(d), /exchangeRate must be a positive number/);
});

test('validate rejects invalid recurrence endDate format', () => {
  const d = emptyData();
  d.transactions.push({ id: 't1', date: '2026-01-01', amount: -10, currency: 'USD', amountInDefault: -10, exchangeRate: 1, labelIds: [], recurrence: { frequency: 'monthly', interval: 1, endDate: 'not-a-date' } });
  assert.throws(() => validate(d), /recurrence endDate must be YYYY-MM-DD/);
});
