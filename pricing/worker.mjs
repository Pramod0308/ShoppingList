/* Cloudflare Worker: the bridge the PWA needs.
 *
 * A browser cannot call api.aldi.co.uk or lidl.co.uk directly — they send no
 * CORS headers, so the request is blocked before it starts. This Worker makes
 * the calls server-side and hands back JSON the page is allowed to read.
 *
 * Deploy:  npx wrangler deploy --config pricing/wrangler.toml
 * Then set PRICE_API in pricing-config.js to the deployed URL.
 *
 *   GET /api/prices?items=sourdough,milk%206%20pint,oats
 *   GET /api/prices?items=...&town=Milton%20Keynes
 *   GET /health
 */

import { compareBasket } from './lib/compare.js';

const CACHE_SECONDS = 60 * 30;   // retailer prices do not move minute to minute

function cors(origin, allowed) {
  const allow = !allowed || allowed === '*' ? '*'
    : allowed.split(',').map(s => s.trim()).includes(origin) ? origin
    : null;
  if (!allow) return null;
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    ...(allow !== '*' ? { vary: 'Origin' } : {}),
  };
}

const json = (body, status, headers) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('origin') || '';
    const headers = cors(origin, env.ALLOWED_ORIGINS);

    if (!headers) return new Response('Origin not allowed', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (url.pathname === '/health') return json({ ok: true, at: new Date().toISOString() }, 200, headers);
    if (url.pathname !== '/api/prices') return json({ error: 'Not found' }, 404, headers);

    const raw = url.searchParams.get('items') || '';
    const items = raw.split(/[,\n]/).map(s => s.trim()).filter(Boolean).slice(0, 40);
    if (!items.length) return json({ error: 'Pass ?items=a,b,c' }, 400, headers);

    // Serve a recent answer when we have one — this also keeps request volume
    // to the retailers low and polite.
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), { method: 'GET' });
    const hit = await cache.match(cacheKey);
    if (hit) {
      const body = await hit.json();
      return json({ ...body, cached: true }, 200, headers);
    }

    try {
      const book = env.PRICEBOOK ? JSON.parse(env.PRICEBOOK) : {};
      const result = await compareBasket(items, {
        town: url.searchParams.get('town') || 'Milton Keynes',
        servicePoint: env.ALDI_SERVICE_POINT || '',
        book,
        concurrency: 4,
      });

      const res = json(result, 200, { ...headers, 'cache-control': `public, max-age=${CACHE_SECONDS}` });
      ctx.waitUntil(cache.put(cacheKey, res.clone()));
      return res;
    } catch (err) {
      return json({ error: err.message }, 502, headers);
    }
  },
};
