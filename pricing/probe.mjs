#!/usr/bin/env node
/* Check which upstream endpoints actually answer from where you are running,
 * and dump one raw record per source so the field mapping can be re-checked.
 *
 *   node pricing/probe.mjs
 *   node pricing/probe.mjs --query "semi skimmed milk" --raw
 *
 * Run this first. If ALDI answers here, the comparison will work; if it does
 * not, the output tells you whether it is a block, a 404 (path moved) or a
 * shape change.
 */

import { request, getJson, brief } from './lib/http.js';
import * as aldi from './lib/providers/aldi.js';
import * as lidl from './lib/providers/lidl.js';
import * as openPrices from './lib/providers/openprices.js';

const args = process.argv.slice(2);
const query = args.includes('--query') ? args[args.indexOf('--query') + 1] : 'semi skimmed milk';
const showRaw = args.includes('--raw');
const town = args.includes('--town') ? args[args.indexOf('--town') + 1] : 'Milton Keynes';

const ok = (s) => `\x1b[32m${s}\x1b[0m`;
const bad = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

async function reachable(url, label) {
  try {
    const { res } = await request(url, { retries: 0, timeoutMs: 10000, accept: '*/*' });
    console.log(`  ${ok('OK')}   ${label} ${dim(`(${res.status})`)}`);
    return true;
  } catch (err) {
    console.log(`  ${bad('FAIL')} ${label} ${dim(brief(err))}`);
    return false;
  }
}

console.log(`\nProbing price sources (query: "${query}", town: ${town})\n`);

console.log('ALDI — undocumented JSON API behind groceries.aldi.co.uk');
for (const build of aldi.SEARCH_ENDPOINTS) {
  const url = build(query, { limit: 3, servicePoint: process.env.ALDI_SERVICE_POINT || '' });
  await reachable(url, url.replace(/\?.*/, '?…'));
}
const aldiRes = await aldi.search(query, { limit: 5 });
if (aldiRes.ok) {
  console.log(`  ${ok('PARSED')} ${aldiRes.products.length} products`);
  for (const p of aldiRes.products.slice(0, 3)) {
    console.log(`         ${p.name} — ${p.pence}p ${dim(`[size: ${p.size ?? '?'} | price from: ${p.priceSource}]`)}`);
  }
  if (showRaw) {
    console.log(dim('  RAW first row (check the field mapping in lib/providers/aldi.js against this):'));
    process.env.PRICE_DEBUG = '1';
    const again = await aldi.search(query, { limit: 1 });
    console.log(JSON.stringify(again.products[0]?.raw ?? {}, null, 2).split('\n').map(l => '    ' + l).join('\n'));
  }
} else {
  console.log(`  ${bad('NO DATA')} ${brief({ message: aldiRes.error })}`);
}

console.log('\nALDI store lookup (needed only to pin availability to a Milton Keynes store)');
const stores = await aldi.findStores('MK9');
if (stores.ok) {
  console.log(`  ${ok('OK')} ${stores.stores.length} stores`);
  for (const s of stores.stores.slice(0, 5)) console.log(`         ${s.id}  ${s.name ?? ''} ${s.postcode ?? ''}`);
} else {
  console.log(`  ${bad('FAIL')} ${stores.error?.slice(0, 160)}`);
}

console.log('\nLIDL — no product API exists; only weekly offers are published');
for (const url of lidl.OFFER_ENDPOINTS) await reachable(url, url.replace(/\?.*/, '?…'));
for (const url of lidl.OFFER_PAGES) await reachable(url, url);
const offers = await lidl.offers();
console.log(offers.ok
  ? `  ${ok('PARSED')} ${offers.products.length} offer lines from ${offers.endpoint}`
  : `  ${bad('NO DATA')} ${String(offers.error).slice(0, 200)}`);

console.log('\nOpen Prices — crowd-sourced shelf prices (the open LIDL fallback)');
await reachable('https://prices.openfoodfacts.org/api/v1/prices?size=1', 'prices.openfoodfacts.org/api/v1/prices');
await reachable('https://world.openfoodfacts.org/cgi/search.pl?search_terms=milk&json=1&page_size=1', 'world.openfoodfacts.org search');
for (const chain of ['Lidl', 'Aldi']) {
  const loc = await openPrices.findLocations({ chain, town });
  console.log(loc.ok
    ? `  ${ok('OK')} ${chain}: ${loc.locations.length} location(s) ${loc.narrowed ? `in ${town}` : dim('(UK-wide, none matched the town)')}`
    : `  ${bad('FAIL')} ${chain}: ${String(loc.error).slice(0, 140)}`);
}

console.log(dim('\nA 403 mentioning an allowlist is your own network blocking the host, not the retailer.\n'));
