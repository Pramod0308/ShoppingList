/* ALDI UK.
 *
 * ALDI UK runs a real online store (Click & Collect) at groceries.aldi.co.uk,
 * backed by an undocumented JSON API at api.aldi.co.uk. That makes ALDI the
 * one of the two chains that can be queried properly.
 *
 * Nothing here is an official, supported API: paths and field names can change
 * without notice. Everything therefore goes through ENDPOINTS (try in order)
 * and defensive field mapping, and `npm run probe` dumps a raw response so the
 * mapping can be re-checked in one place.
 */

import { getJson, pick, findArray, brief } from '../http.js';
import { coercePence } from '../money.js';

export const ID = 'aldi';
export const LABEL = 'ALDI';

const BASE = process.env.ALDI_API_BASE || 'https://api.aldi.co.uk';

/** Search endpoints, most-likely first. */
export const SEARCH_ENDPOINTS = [
  (q, o) => `${BASE}/v3/product-search?currency=GBP&serviceType=walk-in&q=${encodeURIComponent(q)}` +
            `&limit=${o.limit}&offset=0&sort=relevance&testVariant=A` +
            (o.servicePoint ? `&servicePoint=${encodeURIComponent(o.servicePoint)}` : ''),
  (q, o) => `${BASE}/v2/product-search?currency=GBP&serviceType=walk-in&q=${encodeURIComponent(q)}` +
            `&limit=${o.limit}&offset=0&sort=relevance` +
            (o.servicePoint ? `&servicePoint=${encodeURIComponent(o.servicePoint)}` : ''),
];

/** Store lookup endpoints — used to resolve a Milton Keynes servicePoint. */
export const STORE_ENDPOINTS = [
  (postcode) => `${BASE}/v1/service-points?q=${encodeURIComponent(postcode)}&serviceType=walk-in&currency=GBP`,
  (postcode) => `${BASE}/v2/service-points?q=${encodeURIComponent(postcode)}&serviceType=walk-in`,
];

/** Map one raw API product onto the shape the matcher expects. */
export function mapProduct(raw) {
  const name = pick(raw, ['name', 'title', 'productName', 'displayName'], '');
  if (!name) return null;

  const display = pick(raw, [
    'price.amountRelevantDisplay',
    'price.amountDisplay',
    'price.formattedValue',
    'priceDisplay',
    'displayPrice',
  ]);
  const amount = pick(raw, [
    'price.amountRelevant',
    'price.amount',
    'price.value',
    'priceValue',
    'price',
  ]);
  const { pence, source } = coercePence({
    display: typeof display === 'string' ? display : undefined,
    amount: typeof amount === 'number' ? amount : undefined,
  });

  const slug = pick(raw, ['urlSlugText', 'slug', 'url']);
  const sku = pick(raw, ['sku', 'id', 'productId', 'articleId']);

  return {
    retailer: ID,
    name: String(name),
    brand: pick(raw, ['brandName', 'brand.name', 'brand'], null),
    size: pick(raw, ['sellingSize', 'packSize', 'size', 'weight', 'quantity'], null),
    pence,
    priceSource: source,
    unitPriceText: pick(raw, ['price.comparison', 'price.comparisonDisplay', 'pricePerUnit'], null),
    sku: sku ? String(sku) : null,
    url: slug ? `https://groceries.aldi.co.uk/en-GB/p-${slug}` : 'https://groceries.aldi.co.uk/',
    inStock: pick(raw, ['isAvailable', 'available', 'inStock'], null),
    raw: process.env.PRICE_DEBUG ? raw : undefined,
  };
}

/**
 * Search ALDI for a query string.
 * @returns {Promise<{ok:boolean, products:object[], endpoint?:string, error?:string}>}
 */
export async function search(query, { limit = 24, servicePoint = process.env.ALDI_SERVICE_POINT || '' } = {}) {
  const errors = [];
  for (const build of SEARCH_ENDPOINTS) {
    const url = build(query, { limit, servicePoint });
    try {
      const json = await getJson(url, { headers: { origin: 'https://groceries.aldi.co.uk', referer: 'https://groceries.aldi.co.uk/' } });
      const rows = findArray(json, ['data', 'products', 'items', 'results']);
      const products = rows.map(mapProduct).filter(p => p && p.pence != null);
      if (products.length) return { ok: true, products, endpoint: url };
      errors.push(`${url} -> 0 usable products (got ${rows.length} rows)`);
    } catch (err) {
      errors.push(`${url} -> ${brief(err)}`);
    }
  }
  return { ok: false, products: [], error: errors.join(' | ') };
}

/** Resolve stores near a postcode, e.g. 'MK9 3ES' for Milton Keynes. */
export async function findStores(postcode) {
  const errors = [];
  for (const build of STORE_ENDPOINTS) {
    const url = build(postcode);
    try {
      const json = await getJson(url);
      const rows = findArray(json, ['data', 'servicePoints', 'stores', 'results']);
      const stores = rows.map(r => ({
        id: pick(r, ['servicePointId', 'id', 'storeId'], null),
        name: pick(r, ['name', 'displayName', 'storeName'], null),
        postcode: pick(r, ['address.postalCode', 'postcode', 'postalCode'], null),
        town: pick(r, ['address.town', 'address.city', 'town', 'city'], null),
      })).filter(s => s.id);
      if (stores.length) return { ok: true, stores, endpoint: url };
      errors.push(`${url} -> no stores parsed`);
    } catch (err) {
      errors.push(`${url} -> ${brief(err)}`);
    }
  }
  return { ok: false, stores: [], error: errors.join(' | ') };
}
