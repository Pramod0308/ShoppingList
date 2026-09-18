/* Open Prices (prices.openfoodfacts.org) — an open, ODbL-licensed database of
 * real prices observed in real shops, contributed by the public.
 *
 * This is the only *open* source of LIDL UK shelf prices, because LIDL runs no
 * UK online store and publishes no product API. Coverage is patchy and depends
 * on whether anyone has logged a price at a Milton Keynes store recently, so
 * treat a hit as evidence and a miss as normal.
 *
 * Prices are keyed by barcode, so a name search is two hops:
 *   Open Food Facts (name -> barcode) -> Open Prices (barcode -> price@store)
 */

import { getJson, findArray, pick } from '../http.js';
import { parsePriceToPence } from '../money.js';

export const ID = 'openprices';
export const LABEL = 'Open Prices';

const OP_BASE = process.env.OPEN_PRICES_BASE || 'https://prices.openfoodfacts.org/api/v1';
const OFF_BASE = process.env.OFF_BASE || 'https://world.openfoodfacts.org';

/** Name -> candidate barcodes via Open Food Facts search. */
export async function searchBarcodes(query, { limit = 8, country = 'united-kingdom' } = {}) {
  const url = `${OFF_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(query)}` +
              `&tagtype_0=countries&tag_contains_0=contains&tag_0=${encodeURIComponent(country)}` +
              `&search_simple=1&action=process&json=1&page_size=${limit}` +
              `&fields=code,product_name,brands,quantity`;
  const json = await getJson(url);
  const rows = findArray(json, ['products']);
  return rows
    .map(p => ({
      code: pick(p, ['code'], null),
      name: pick(p, ['product_name'], ''),
      brand: pick(p, ['brands'], null),
      size: pick(p, ['quantity'], null),
    }))
    .filter(p => p.code && p.name);
}

/** Locations (shops) known to Open Prices, filtered by name and town. */
export async function findLocations({ chain = 'Lidl', town = 'Milton Keynes', size = 25 } = {}) {
  const attempts = [
    `${OP_BASE}/locations?osm_name__like=${encodeURIComponent(chain)}&osm_address_city__like=${encodeURIComponent(town)}&size=${size}`,
    `${OP_BASE}/locations?osm_name__like=${encodeURIComponent(chain)}&osm_address_country__like=United%20Kingdom&size=${size}`,
    `${OP_BASE}/locations?osm_name__like=${encodeURIComponent(chain)}&size=${size}`,
  ];
  const errors = [];
  for (const url of attempts) {
    try {
      const json = await getJson(url);
      const rows = findArray(json, ['items', 'results', 'data']);
      const locs = rows.map(r => ({
        id: pick(r, ['id'], null),
        osmId: pick(r, ['osm_id'], null),
        osmType: pick(r, ['osm_type'], null),
        name: pick(r, ['osm_name', 'name'], null),
        city: pick(r, ['osm_address_city', 'city'], null),
        postcode: pick(r, ['osm_address_postcode'], null),
        country: pick(r, ['osm_address_country'], null),
      })).filter(l => l.id);
      if (locs.length) {
        const inTown = locs.filter(l => (l.city || '').toLowerCase().includes(town.toLowerCase()));
        return { ok: true, locations: inTown.length ? inTown : locs, narrowed: inTown.length > 0, endpoint: url };
      }
      errors.push(`${url} -> none`);
    } catch (err) {
      errors.push(`${url} -> ${err.message}`);
    }
  }
  return { ok: false, locations: [], error: errors.join(' | ') };
}

/** Most recent observed prices for a barcode, optionally pinned to locations. */
export async function pricesForBarcode(code, { locationIds = [], size = 20 } = {}) {
  const qs = new URLSearchParams({ product_code: String(code), order_by: '-date', size: String(size) });
  if (locationIds.length === 1) qs.set('location_id', String(locationIds[0]));
  const url = `${OP_BASE}/prices?${qs.toString()}`;
  const json = await getJson(url);
  const rows = findArray(json, ['items', 'results', 'data']);
  const wanted = new Set(locationIds.map(String));
  return rows
    .map(r => ({
      pence: parsePriceToPence(pick(r, ['price'], null)) ,
      currency: pick(r, ['currency'], 'GBP'),
      date: pick(r, ['date'], null),
      locationId: pick(r, ['location_id', 'location.id'], null),
      locationName: pick(r, ['location.osm_name'], null),
      locationCity: pick(r, ['location.osm_address_city'], null),
      productName: pick(r, ['product.product_name'], null),
      productSize: pick(r, ['product.product_quantity', 'product.quantity'], null),
      discounted: pick(r, ['price_is_discounted'], false),
    }))
    .filter(p => p.pence != null && p.currency === 'GBP')
    .filter(p => !wanted.size || wanted.has(String(p.locationId)));
}

/**
 * Full name -> price@chain lookup.
 * @returns {Promise<{ok:boolean, products:object[], error?:string, note?:string}>}
 */
export async function search(query, { chain = 'Lidl', town = 'Milton Keynes', maxBarcodes = 5 } = {}) {
  try {
    const loc = await findLocations({ chain, town });
    const locationIds = loc.locations.map(l => l.id);
    if (!locationIds.length) {
      return { ok: false, products: [], error: `No ${chain} locations in Open Prices for ${town}` };
    }

    const barcodes = await searchBarcodes(query);
    if (!barcodes.length) return { ok: false, products: [], error: `No Open Food Facts match for "${query}"` };

    const products = [];
    for (const b of barcodes.slice(0, maxBarcodes)) {
      const prices = await pricesForBarcode(b.code, { locationIds });
      if (!prices.length) continue;
      const newest = prices[0];
      products.push({
        retailer: chain.toLowerCase(),
        name: newest.productName || b.name,
        brand: b.brand,
        size: b.size || newest.productSize || null,
        pence: newest.pence,
        priceSource: 'open-prices',
        observedAt: newest.date,
        observedIn: [newest.locationName, newest.locationCity].filter(Boolean).join(', ') || null,
        discounted: !!newest.discounted,
        sku: b.code,
        url: `https://prices.openfoodfacts.org/products/${b.code}`,
      });
    }

    return products.length
      ? { ok: true, products, note: `${loc.narrowed ? town : chain + ' (any UK store)'} via Open Prices` }
      : { ok: false, products: [], error: `No ${chain} price logged for "${query}"` };
  } catch (err) {
    return { ok: false, products: [], error: err.message };
  }
}
