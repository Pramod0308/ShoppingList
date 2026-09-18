import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePriceToPence, coercePence, penceToString, unitPrice } from '../lib/money.js';
import { bestSize } from '../lib/units.js';

test('prices parse from every shape a UK feed uses', () => {
  assert.equal(parsePriceToPence('£1.09'), 109);
  assert.equal(parsePriceToPence('109p'), 109);
  assert.equal(parsePriceToPence('1.09'), 109);
  assert.equal(parsePriceToPence('£12'), 1200);
  assert.equal(parsePriceToPence('not a price'), null);
});

test('a display string beats an ambiguous numeric amount', () => {
  assert.deepEqual(coercePence({ amount: 109, display: '£1.09' }), { pence: 109, source: 'display' });
  assert.equal(coercePence({ amount: 1.09 }).pence, 109);
  assert.equal(coercePence({ amount: 109 }).pence, 109);
  assert.equal(coercePence({}).pence, null);
});

test('formatting switches between pounds and pence', () => {
  assert.equal(penceToString(109), '£1.09');
  assert.equal(penceToString(89), '89p');
  assert.equal(penceToString(null), null);
});

test('unit price makes different pack sizes comparable', () => {
  const sixPint = unitPrice(175, bestSize('6 pint'));
  const fourPint = unitPrice(130, bestSize('4 pint'));
  assert.equal(sixPint.label, '/L');
  assert.ok(sixPint.pence < fourPint.pence, 'the 6 pint should be cheaper per litre');
});
