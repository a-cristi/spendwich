import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertAmount } from '../src/currency.js';

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
