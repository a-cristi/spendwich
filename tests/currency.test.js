import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertAmount, fetchRate } from '../src/currency.js';

test('convertAmount: whole number result', () => {
  assert.equal(convertAmount(100, 2), 200);
});

test('convertAmount: rate 1 is identity', () => {
  assert.equal(convertAmount(42.5, 1), 42.5);
});

test('convertAmount: negative amount', () => {
  assert.equal(convertAmount(-50, 1.5), -75);
});

test('convertAmount: rounds to 2 decimal places', () => {
  assert.equal(convertAmount(1, 3), 3);
  assert.equal(convertAmount(10, 0.333), 3.33);
});

test('convertAmount: floating-point imprecision is handled', () => {
  assert.equal(convertAmount(0.1, 0.1), 0.01);
});

test('convertAmount: zero amount', () => {
  assert.equal(convertAmount(0, 1.5), 0);
});

// --- fetchRate ---

test('fetchRate: same currency returns 1 without network', async () => {
  assert.equal(await fetchRate('USD', 'USD', '2026-01-01'), 1);
});

test('fetchRate: returns null for non-number rate', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ rates: { EUR: 'bad' } }) });
  try {
    assert.equal(await fetchRate('USD', 'EUR', '2099-01-01'), null);
  } finally {
    globalThis.fetch = orig;
  }
});

test('fetchRate: returns null for zero rate', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ rates: { EUR: 0 } }) });
  try {
    assert.equal(await fetchRate('USD', 'EUR', '2099-01-02'), null);
  } finally {
    globalThis.fetch = orig;
  }
});

test('fetchRate: returns null for negative rate', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ rates: { EUR: -1.5 } }) });
  try {
    assert.equal(await fetchRate('USD', 'EUR', '2099-01-03'), null);
  } finally {
    globalThis.fetch = orig;
  }
});

test('fetchRate: returns null on network error', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network fail'); };
  try {
    assert.equal(await fetchRate('USD', 'EUR', '2099-01-04'), null);
  } finally {
    globalThis.fetch = orig;
  }
});

test('fetchRate: returns null on non-ok response', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false });
  try {
    assert.equal(await fetchRate('USD', 'EUR', '2099-01-05'), null);
  } finally {
    globalThis.fetch = orig;
  }
});

test('fetchRate: caches valid rate — only one network call for same key', async () => {
  const orig = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return { ok: true, json: async () => ({ rates: { GBP: 0.79 } }) };
  };
  try {
    const r1 = await fetchRate('USD', 'GBP', '2099-02-01');
    const r2 = await fetchRate('USD', 'GBP', '2099-02-01');
    assert.equal(r1, 0.79);
    assert.equal(r2, 0.79);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = orig;
  }
});
