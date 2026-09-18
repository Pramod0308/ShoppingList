import test from 'node:test';
import assert from 'node:assert/strict';
import { bestSize, extractPackCount, makeSize } from '../lib/units.js';

test('UK pint converts to 568ml', () => {
  assert.equal(makeSize(1, 'pint').base, 568);
  assert.equal(bestSize('milk 6 pint').base, 3408);
});

test('metric sizes reduce to grams and millilitres', () => {
  assert.equal(bestSize('oats 1kg').base, 1000);
  assert.equal(bestSize('juice 1.5l').base, 1500);
  assert.equal(bestSize('cheese 250g').base, 250);
});

test('multipacks multiply out', () => {
  const s = bestSize('4 x 500g yoghurt');
  assert.equal(s.base, 2000);
  assert.equal(s.multipack, 4);
});

test('pack counts are read in several phrasings', () => {
  assert.equal(extractPackCount('weetabix 24 pack'), 24);
  assert.equal(extractPackCount('eggs pack of 12'), 12);
  assert.equal(extractPackCount('yoghurt x6'), 6);
  assert.equal(extractPackCount('sourdough'), null);
});

test('unknown units are rejected rather than guessed', () => {
  assert.equal(makeSize(3, 'furlong'), null);
  assert.equal(bestSize('just some bread'), null);
});
