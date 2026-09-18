import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseItem } from '../lib/normalise.js';

test('size is stripped from the search query but kept as structure', () => {
  const i = normaliseItem('milk 6 pint');
  assert.equal(i.query, 'milk');
  assert.equal(i.size.base, 3408);
});

test('leading quantity is separated from pack size', () => {
  const i = normaliseItem('2 x semi skimmed 4 pint');
  assert.equal(i.qty, 2);
  assert.equal(i.size.base, 2272);
  assert.equal(i.query, 'semi skimmed milk');
});

test('misspelled brands are corrected', () => {
  assert.equal(normaliseItem('Aptina').query, 'aptamil');
  assert.equal(normaliseItem('weatabix').query, 'weetabix');
});

test('UK shorthand expands to something searchable', () => {
  assert.equal(normaliseItem('loo roll').query, 'toilet tissue');
  assert.equal(normaliseItem('spuds').query, 'potatoes');
});

test('categories are detected for the guard rules', () => {
  assert.equal(normaliseItem('milk 6 pint').category, 'milk');
  assert.equal(normaliseItem('sourdough').category, 'bread');
  assert.equal(normaliseItem('paneer').category, 'dairy');
  assert.equal(normaliseItem('Aptina').category, 'babyfood');
});

test('the whole example basket normalises without loss', () => {
  const basket = ['sourdough', 'milk 6 pint', 'oats', 'weetabix', 'Aptina', 'paneer'];
  const out = basket.map(normaliseItem);
  assert.deepEqual(out.map(i => i.query), ['sourdough', 'milk', 'oats', 'weetabix', 'aptamil', 'paneer']);
});
