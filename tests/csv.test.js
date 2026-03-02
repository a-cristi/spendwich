import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, importTransactions } from '../src/csv.js';
import { emptyData } from '../src/schema.js';

test('parseCSV: basic header + rows', () => {
  const csv = 'date,amount,currency\n2026-01-01,-10,USD\n2026-01-02,-20,EUR';
  const rows = parseCSV(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].date, '2026-01-01');
  assert.equal(rows[0].amount, '-10');
  assert.equal(rows[1].currency, 'EUR');
});

test('parseCSV: quoted field with comma inside', () => {
  const csv = 'a,b,c\n"hello, world",2,3';
  const rows = parseCSV(csv);
  assert.equal(rows[0].a, 'hello, world');
});

test('parseCSV: escaped double-quote inside quoted field', () => {
  const csv = 'a,b\n"he said ""hello""",2';
  const rows = parseCSV(csv);
  assert.equal(rows[0].a, 'he said "hello"');
});

test('parseCSV: CRLF line endings', () => {
  const csv = 'date,amount\r\n2026-01-01,-5\r\n2026-01-02,-10';
  const rows = parseCSV(csv);
  assert.equal(rows.length, 2);
});

test('parseCSV: skips empty trailing lines', () => {
  const csv = 'date,amount\n2026-01-01,-5\n\n';
  const rows = parseCSV(csv);
  assert.equal(rows.length, 1);
});

test('importTransactions: basic import', () => {
  const csv = 'date,amount,currency,category,description\n2026-01-15,-42.5,EUR,Food,Supermarket';
  const result = importTransactions(csv, emptyData());
  assert.equal(result.transactions.length, 1);
  assert.equal(result.transactions[0].date, '2026-01-15');
  assert.equal(result.transactions[0].amount, -42.5);
  assert.equal(result.transactions[0].currency, 'EUR');
  assert.equal(result.transactions[0].description, 'Supermarket');
});

test('importTransactions: creates new category when not in data', () => {
  const csv = 'date,amount,currency,category,description\n2026-01-01,-10,USD,NewCat,Test';
  const result = importTransactions(csv, emptyData());
  assert.equal(result.categories.length, 1);
  assert.equal(result.categories[0].name, 'NewCat');
  assert.equal(result.transactions[0].categoryId, result.categories[0].id);
});

test('importTransactions: reuses existing category by name', () => {
  const data = emptyData();
  data.categories.push({ id: 'existing-id', name: 'Food', color: '#f00' });
  const csv = 'date,amount,currency,category,description\n2026-01-01,-10,USD,Food,Lunch';
  const result = importTransactions(csv, data);
  assert.equal(result.categories.length, 0);
  assert.equal(result.transactions[0].categoryId, 'existing-id');
});

test('importTransactions: semicolon-separated labels', () => {
  const csv = 'date,amount,currency,category,description,labels\n2026-01-01,-10,USD,Food,Lunch,work;travel';
  const result = importTransactions(csv, emptyData());
  assert.equal(result.labels.length, 2);
  assert.equal(result.transactions[0].labelIds.length, 2);
});

test('importTransactions: negative amount preserved', () => {
  const csv = 'date,amount,currency,category,description\n2026-01-01,-99.99,USD,Food,Test';
  const result = importTransactions(csv, emptyData());
  assert.equal(result.transactions[0].amount, -99.99);
});

test('importTransactions: throws on missing required column', () => {
  const csv = 'date,amount,currency\n2026-01-01,-10,USD';
  assert.throws(() => importTransactions(csv, emptyData()), /Missing required column.*category/);
});

test('importTransactions: throws on invalid date with row number', () => {
  const csv = 'date,amount,currency,category,description\n01/15/2026,-10,USD,Food,Test';
  assert.throws(() => importTransactions(csv, emptyData()), /Row 2.*invalid date/);
});

test('importTransactions: throws on invalid amount with row number', () => {
  const csv = 'date,amount,currency,category,description\n2026-01-01,not-a-number,USD,Food,Test';
  assert.throws(() => importTransactions(csv, emptyData()), /Row 2.*invalid amount/);
});

test('importTransactions: order-independent columns', () => {
  const csv = 'description,currency,amount,category,date\nTest,USD,-5,Food,2026-01-15';
  const result = importTransactions(csv, emptyData());
  assert.equal(result.transactions[0].date, '2026-01-15');
  assert.equal(result.transactions[0].amount, -5);
});

test('importTransactions: trims whitespace from category name', () => {
  const csv = 'date,amount,currency,category,description\n2026-01-01,-10,USD,  Food  ,Lunch';
  const result = importTransactions(csv, emptyData());
  assert.equal(result.categories.length, 1);
  assert.equal(result.categories[0].name, 'Food');
  assert.equal(result.transactions[0].categoryId, result.categories[0].id);
});
