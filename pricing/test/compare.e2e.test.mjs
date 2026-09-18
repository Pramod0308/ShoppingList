/* End-to-end run of the comparison pipeline against stubbed upstreams.
 * The payload shapes mirror what the real endpoints return, so this exercises
 * field mapping, matching, unit pricing and the cheaper-of decision without
 * touching the network. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { compareBasket } from '../lib/compare.js';
import * as lidlProvider from '../lib/providers/lidl.js';

const ALDI_MILK = {
  data: [
    { sku: 'A1', name: 'Cowbelle British Semi Skimmed Milk', brandName: 'Cowbelle',
      sellingSize: '3.408L', urlSlugText: 'cowbelle-semi-skimmed-milk',
      price: { amount: 175, amountRelevantDisplay: '£1.75', comparison: '51.3p per litre', currencyCode: 'GBP' } },
    { sku: 'A2', name: 'Dairyfine Milk Chocolate Bar', brandName: 'Dairyfine',
      sellingSize: '100g', urlSlugText: 'dairyfine-milk-chocolate',
      price: { amount: 45, amountRelevantDisplay: '45p', currencyCode: 'GBP' } },
  ],
};

const ALDI_OATS = {
  data: [
    { sku: 'A3', name: 'Harvest Morn Scottish Porridge Oats', brandName: 'Harvest Morn',
      sellingSize: '1kg', urlSlugText: 'harvest-morn-oats',
      price: { amount: 0.9, currencyCode: 'GBP' } },
  ],
};

const LIDL_OFFERS = {
  items: [
    { title: 'Semi Skimmed Milk 6 Pint', price: { price: '£1.69' }, basicPrice: '3.408L' },
    { title: 'Porridge Oats 1kg', price: { price: '£0.95' }, basicPrice: '1kg' },
  ],
};

function stubFetch() {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

    if (u.includes('api.aldi.co.uk') && u.includes('product-search')) {
      if (/q=milk/.test(u)) return json(ALDI_MILK);
      if (/q=oats/.test(u)) return json(ALDI_OATS);
      return json({ data: [] });
    }
    if (u.includes('lidl.co.uk') && u.includes('gridboxes')) return json(LIDL_OFFERS);
    if (u.includes('openfoodfacts')) return json({ items: [], products: [] });
    return new Response('blocked', { status: 403 });
  };
  return () => { globalThis.fetch = original; };
}

test('compares a basket across both retailers and picks the cheaper', async (t) => {
  const restore = stubFetch();
  lidlProvider.resetCache();
  t.after(restore);

  const result = await compareBasket(['milk 6 pint', 'oats 1kg'], { town: 'Milton Keynes' });

  const milk = result.rows.find(r => r.item === 'milk 6 pint');
  assert.equal(milk.aldi.status, 'ok');
  assert.equal(milk.aldi.name, 'Cowbelle British Semi Skimmed Milk', 'must not pick the chocolate bar');
  assert.equal(milk.aldi.price, '£1.75');
  assert.equal(milk.lidl.status, 'ok');
  assert.equal(milk.lidl.price, '£1.69');
  assert.equal(milk.cheaper, 'lidl');

  const oats = result.rows.find(r => r.item === 'oats 1kg');
  assert.equal(oats.aldi.price, '90p', 'a decimal amount must be read as pounds');
  assert.equal(oats.lidl.price, '95p');
  assert.equal(oats.cheaper, 'aldi');

  assert.equal(result.totals.comparable, 2);
  assert.equal(result.totals.aldi.pence, 175 + 90);
  assert.equal(result.totals.lidl.pence, 169 + 95);
});

test('an item nobody stocks reports no match instead of guessing', async (t) => {
  const restore = stubFetch();
  lidlProvider.resetCache();
  t.after(restore);

  const result = await compareBasket(['saffron threads'], {});
  const row = result.rows[0];
  assert.equal(row.aldi.status, 'none');
  assert.equal(row.lidl.status, 'none');
  assert.equal(row.cheaper, null);
  assert.equal(result.totals.aldi.price, null);
});

test('quantity multiplies the basket total', async (t) => {
  const restore = stubFetch();
  lidlProvider.resetCache();
  t.after(restore);

  const result = await compareBasket(['2 x milk 6 pint'], {});
  assert.equal(result.rows[0].qty, 2);
  assert.equal(result.totals.aldi.pence, 350);
});
