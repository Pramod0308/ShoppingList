import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseItem } from '../lib/normalise.js';
import { rankCandidates, scoreCandidate, CONFIDENCE_FLOOR } from '../lib/match.js';

test('the right pack size wins', () => {
  const item = normaliseItem('milk 6 pint');
  const ranked = rankCandidates(item, [
    { name: 'Cowbelle British Whole Milk', size: '2.272L' },
    { name: 'Cowbelle British Semi Skimmed Milk', size: '3.408L' },
  ]);
  assert.equal(ranked[0].size, '3.408L');
});

test('milk chocolate does not win a search for milk', () => {
  const item = normaliseItem('milk 6 pint');
  const choc = scoreCandidate(item, { name: 'Dairyfine Milk Chocolate Bar', size: '100g' });
  const milk = scoreCandidate(item, { name: 'Cowbelle Semi Skimmed Milk', size: '3.408L' });
  assert.ok(choc.score < CONFIDENCE_FLOOR, `chocolate scored ${choc.score}`);
  assert.ok(milk.score >= CONFIDENCE_FLOOR, `milk scored ${milk.score}`);
});

test('a missing head noun is penalised', () => {
  const item = normaliseItem('paneer');
  const wrong = scoreCandidate(item, { name: 'Mature Cheddar Cheese', size: '400g' });
  assert.ok(wrong.score < CONFIDENCE_FLOOR, `cheddar scored ${wrong.score}`);
});

test('plural and singular still match', () => {
  const item = normaliseItem('oats');
  const r = scoreCandidate(item, { name: 'Scottish Porridge Oat', size: '1kg' });
  assert.ok(r.score > 0);
});
