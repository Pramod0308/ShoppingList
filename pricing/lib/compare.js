/* Orchestrator: shopping-list lines in, an ALDI-vs-LIDL comparison out. */

import { normaliseItem } from './normalise.js';
import { rankCandidates, CONFIDENCE_FLOOR } from './match.js';
import { penceToString, unitPrice } from './money.js';
import * as aldi from './providers/aldi.js';
import * as lidl from './providers/lidl.js';
import * as pricebook from './providers/pricebook.js';

export const RETAILERS = { aldi, lidl };

function bestFor(item, providerResult) {
  if (!providerResult.ok || !providerResult.products.length) {
    return { status: 'none', reason: providerResult.error || 'no results', candidates: [] };
  }
  const ranked = rankCandidates(item, providerResult.products);
  const top = ranked[0];
  const confident = top._match.score >= CONFIDENCE_FLOOR;

  const size = top._match.size || item.size;
  const up = unitPrice(top.pence, size);

  return {
    status: confident ? 'ok' : 'low-confidence',
    name: top.name,
    brand: top.brand ?? null,
    size: top.size ?? size?.label ?? null,
    pence: top.pence,
    price: penceToString(top.pence),
    unitPrice: up?.display ?? top.unitPriceText ?? null,
    unitPricePence: up?.pence ?? null,
    score: top._match.score,
    why: top._match.reasons,
    source: top.priceSource,
    observedAt: top.observedAt ?? null,
    observedIn: top.observedIn ?? null,
    promo: top.promo ?? false,
    url: top.url ?? null,
    candidates: ranked.slice(1, 4).map(c => ({ name: c.name, price: penceToString(c.pence), score: c._match.score })),
  };
}

function cheaper(a, b) {
  // Prefer a like-for-like unit price; fall back to shelf price.
  const aOk = a.status === 'ok', bOk = b.status === 'ok';
  if (aOk && !bOk) return 'aldi';
  if (bOk && !aOk) return 'lidl';
  if (!aOk && !bOk) return null;
  if (a.unitPricePence != null && b.unitPricePence != null) {
    if (Math.abs(a.unitPricePence - b.unitPricePence) < 0.5) return 'tie';
    return a.unitPricePence < b.unitPricePence ? 'aldi' : 'lidl';
  }
  if (a.pence === b.pence) return 'tie';
  return a.pence < b.pence ? 'aldi' : 'lidl';
}

/**
 * @param {string[]} lines raw shopping-list text
 * @param {{town?:string, servicePoint?:string, concurrency?:number, book?:object}} opts
 */
export async function compareBasket(lines, opts = {}) {
  const {
    town = 'Milton Keynes',
    servicePoint = (globalThis.process?.env?.ALDI_SERVICE_POINT) || '',
    concurrency = 4,
    book = {},
  } = opts;
  const items = lines.map(normaliseItem).filter(i => i.query);

  const rows = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const slice = items.slice(i, i + concurrency);
    const done = await Promise.all(slice.map(async (item) => {
      const [a, l] = await Promise.all([
        aldi.search(item.query, { servicePoint }).catch(e => ({ ok: false, products: [], error: e.message })),
        lidl.search(item.query, { item, town, book }).catch(e => ({ ok: false, products: [], error: e.message })),
      ]);

      // The price book can also stand in for ALDI when its API is unreachable.
      let aldiResult = bestFor(item, a);
      if (aldiResult.status === 'none') {
        const hit = pricebook.lookup(book, item, 'aldi');
        if (hit) aldiResult = bestFor(item, { ok: true, products: [hit] });
      }
      const lidlResult = bestFor(item, l);

      return {
        item: item.raw,
        query: item.query,
        qty: item.qty,
        wantedSize: item.size?.label ?? null,
        aldi: aldiResult,
        lidl: lidlResult,
        cheaper: cheaper(aldiResult, lidlResult),
        lidlLayers: l.layers ?? [],
      };
    }));
    rows.push(...done);
  }

  return { town, generatedAt: new Date().toISOString(), rows, totals: totals(rows) };
}

function totals(rows) {
  const sum = (key) => rows.reduce((acc, r) => {
    const cell = r[key];
    return cell.status === 'ok' && cell.pence != null ? acc + cell.pence * (r.qty || 1) : acc;
  }, 0);
  const counted = (key) => rows.filter(r => r[key].status === 'ok').length;
  const cell = (key) => {
    const n = counted(key);
    const pence = n ? sum(key) : null;
    return { pence, price: pence == null ? null : penceToString(pence), itemsPriced: n };
  };
  return {
    aldi: cell('aldi'),
    lidl: cell('lidl'),
    itemCount: rows.length,
    comparable: rows.filter(r => r.aldi.status === 'ok' && r.lidl.status === 'ok').length,
  };
}
