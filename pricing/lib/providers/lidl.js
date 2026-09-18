/* LIDL UK.
 *
 * The honest position: LIDL does not sell groceries online in the UK and
 * publishes no product/price API. There is no equivalent of ALDI's store
 * endpoint to call. What LIDL does publish is its weekly offers — so this
 * provider works in layers, best-effort first:
 *
 *   1. LIDL's own offer feeds/pages  -> promotional lines only, current week
 *   2. Open Prices (crowd-sourced)   -> real shelf prices, patchy coverage
 *   3. Local price book              -> what you typed in from a receipt
 *
 * Layer 1 is genuinely undocumented and may return nothing; that is expected,
 * not a bug. Layers 2 and 3 are what make the LIDL column usable day to day.
 */

import { getJson, getText, findArray, pick, brief } from '../http.js';
import { parsePriceToPence } from '../money.js';
import * as openPrices from './openprices.js';
import * as pricebook from './pricebook.js';

export const ID = 'lidl';
export const LABEL = 'LIDL';

const SITE = process.env.LIDL_SITE_BASE || 'https://www.lidl.co.uk';

/** Candidate JSON feeds for the current week's offers. */
export const OFFER_ENDPOINTS = [
  `${SITE}/p/api/gridboxes/GB/en/?assortment=GB&locale=en_GB`,
  `${SITE}/p/api/gridboxes/GB/en?assortment=GB&locale=en_GB`,
];

/** HTML offer pages to fall back to when no JSON feed answers. */
export const OFFER_PAGES = [
  `${SITE}/c/pick-of-the-week/a10090370`,
  `${SITE}/c/lidl-plus-offers-upcoming/a10053070`,
];

function mapOffer(raw) {
  const name = pick(raw, ['title', 'name', 'fullTitle', 'label', 'keyfacts.title'], '');
  if (!name) return null;
  const priceRaw = pick(raw, [
    'price.price', 'price.formattedValue', 'price.value', 'price',
    'discountPrice', 'currentPrice',
  ]);
  const pence = parsePriceToPence(typeof priceRaw === 'object' ? pick(priceRaw, ['price', 'value', 'formattedValue']) : priceRaw);
  if (pence == null) return null;
  return {
    retailer: ID,
    name: String(name),
    brand: pick(raw, ['brand', 'brandName'], null),
    size: pick(raw, ['basicPrice', 'packaging', 'quantity', 'size'], null),
    pence,
    priceSource: 'lidl-offers',
    promo: true,
    url: pick(raw, ['canonicalPath', 'url', 'link'], null),
  };
}

/** Layer 1: LIDL's own weekly offer data. */
export async function offers() {
  const errors = [];
  for (const url of OFFER_ENDPOINTS) {
    try {
      const json = await getJson(url, { headers: { referer: `${SITE}/` } });
      const rows = findArray(json, ['items', 'gridboxes', 'products', 'data']);
      const mapped = rows.map(mapOffer).filter(Boolean);
      if (mapped.length) return { ok: true, products: mapped, endpoint: url };
      errors.push(`${url} -> 0 offers parsed`);
    } catch (err) {
      errors.push(`${url} -> ${brief(err)}`);
    }
  }

  // Fall back to reading JSON embedded in the offer pages.
  for (const url of OFFER_PAGES) {
    try {
      const html = await getText(url, { headers: { referer: `${SITE}/` } });
      const embedded = extractEmbeddedJson(html);
      for (const blob of embedded) {
        const rows = findArray(blob, ['items', 'gridboxes', 'products']);
        const mapped = rows.map(mapOffer).filter(Boolean);
        if (mapped.length) return { ok: true, products: mapped, endpoint: `${url} (embedded JSON)` };
      }
      errors.push(`${url} -> no product JSON in page`);
    } catch (err) {
      errors.push(`${url} -> ${brief(err)}`);
    }
  }
  return { ok: false, products: [], error: errors.join(' | ') };
}

/** Pull <script> JSON blobs that Next.js/Nuxt style pages embed. */
export function extractEmbeddedJson(html) {
  const out = [];
  const patterns = [
    /<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i,
    /<script[^>]+type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi,
    /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});?\s*<\/script>/i,
  ];
  for (const re of patterns) {
    const globalRe = re.flags.includes('g') ? re : new RegExp(re.source, re.flags + 'g');
    let m;
    while ((m = globalRe.exec(html)) !== null) {
      try { out.push(JSON.parse(m[1])); } catch { /* not every blob is JSON */ }
    }
  }
  return out;
}

let offersCache = null;
async function cachedOffers() {
  if (!offersCache) offersCache = await offers();
  return offersCache;
}
export function resetCache() { offersCache = null; }

/**
 * Search LIDL for a query, walking the three layers.
 * @returns {Promise<{ok:boolean, products:object[], layers:object[], error?:string}>}
 */
export async function search(query, { item = null, town = 'Milton Keynes', book = {} } = {}) {
  const layers = [];
  const products = [];

  // 1. weekly offers
  try {
    const o = await cachedOffers();
    layers.push({ layer: 'lidl-offers', ok: o.ok, count: o.products.length, error: o.error });
    if (o.ok) {
      const q = query.toLowerCase();
      const words = q.split(' ').filter(Boolean);
      products.push(...o.products.filter(p => {
        const n = p.name.toLowerCase();
        return words.some(w => n.includes(w));
      }));
    }
  } catch (err) {
    layers.push({ layer: 'lidl-offers', ok: false, error: err.message });
  }

  // 2. Open Prices
  try {
    const op = await openPrices.search(query, { chain: 'Lidl', town });
    layers.push({ layer: 'open-prices', ok: op.ok, count: op.products.length, error: op.error, note: op.note });
    if (op.ok) products.push(...op.products.map(p => ({ ...p, retailer: ID })));
  } catch (err) {
    layers.push({ layer: 'open-prices', ok: false, error: err.message });
  }

  // 3. local price book
  if (item) {
    const hit = pricebook.lookup(book, item, ID);
    layers.push({ layer: 'pricebook', ok: !!hit, count: hit ? 1 : 0 });
    if (hit) products.push(hit);
  }

  return {
    ok: products.length > 0,
    products,
    layers,
    error: products.length ? undefined : layers.map(l => l.error).filter(Boolean).join(' | '),
  };
}
