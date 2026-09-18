/* A local, user-maintained price book — pure logic, no filesystem.
 *
 * This exists because LIDL UK publishes no queryable price data for everyday
 * groceries. For the staples you buy every week, a price you typed in once
 * from a receipt beats a scraper that cannot reach the data at all — and it
 * keeps working offline.
 *
 * Format (pricing/pricebook.json):
 * {
 *   "milk": { "lidl": { "pence": 145, "size": "3.408L", "name": "Semi Skimmed Milk 6 pint",
 *                       "updated": "2026-09-14", "store": "Lidl Bletchley" } },
 *   "oats": { "lidl": { "pence": 90, "size": "1kg" }, "aldi": { "pence": 90, "size": "1kg" } }
 * }
 * Keys are matched against the normalised search query, then loosely.
 *
 * Reading and writing the file lives in ./pricebook-node.js so that this module
 * stays usable in a Cloudflare Worker / browser bundle.
 */

export const ID = 'pricebook';

/** Look up one retailer's entry for a normalised item. */
export function lookup(book, item, retailer) {
  const keys = Object.keys(book || {}).filter(k => !k.startsWith('_'));
  if (!keys.length) return null;

  const q = item.query;
  const match = keys.find(k => k.toLowerCase() === q)
    || keys.find(k => q.includes(k.toLowerCase()))
    || keys.find(k => k.toLowerCase().includes(q));
  if (!match) return null;

  const entry = book[match]?.[retailer];
  if (!entry || entry.pence == null) return null;

  return {
    retailer,
    name: entry.name || match,
    brand: entry.brand || null,
    size: entry.size || null,
    pence: entry.pence,
    priceSource: 'pricebook',
    observedAt: entry.updated || null,
    observedIn: entry.store || null,
    url: null,
    matchedKey: match,
  };
}

/** Add or update one entry. */
export function put(book, key, retailer, entry) {
  const k = String(key).toLowerCase().trim();
  book[k] = book[k] || {};
  book[k][retailer] = {
    ...entry,
    updated: entry.updated || new Date().toISOString().slice(0, 10),
  };
  return book;
}
