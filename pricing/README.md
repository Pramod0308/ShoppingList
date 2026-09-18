# ALDI & LIDL price lookup (UK / Milton Keynes)

Give it shopping-list lines like `sourdough`, `milk 6 pint`, `oats`, `weetabix`,
`Aptamil`, `paneer` — get back an ALDI vs LIDL comparison.

## The honest finding first

The two chains are **not equally reachable**, and any tool that claims otherwise
is guessing:

| | Online store? | Machine-readable prices? | What this tool does |
|---|---|---|---|
| **ALDI UK** | Yes — `groceries.aldi.co.uk` (Click & Collect) | Yes — an undocumented JSON API at `api.aldi.co.uk` backs that store | Queries it directly. This is the reliable half. |
| **LIDL UK** | **No** — LIDL does not sell groceries online in the UK | **No** — no product search API, and the Lidl Plus app API is closed to third parties | Three fallback layers, below |

So you can automate ALDI properly. You **cannot** get a complete LIDL price list
by any legitimate route, because LIDL does not publish one. The LIDL column is
assembled from:

1. **LIDL's own weekly offers** — published, but only promotional lines, and
   only for the current week.
2. **[Open Prices](https://prices.openfoodfacts.org)** — an open, ODbL-licensed
   database of prices people have actually recorded in shops, tagged to real
   store locations. Free, no key. Coverage is patchy and depends on whether
   anyone has logged a price at a Milton Keynes LIDL recently.
3. **Your own price book** (`pricebook.json`) — prices you type in once from a
   receipt. For the twenty staples you buy every week this is the most reliable
   source of the three, and it works offline.

A missing LIDL price is normal, not a bug. The tool says "—" rather than
inventing a number.

### A note on prices and stores

ALDI and LIDL both price nationally in the UK, so a Milton Keynes price is
almost always the national price. The town matters for **availability** (is it
stocked at your store) and for matching crowd-sourced observations — not
usually for the number itself. Pin an ALDI store if you want availability to
reflect MK specifically:

```bash
node pricing/cli.mjs --store MK9 "milk 6 pint"
```

## Quick start

```bash
cd pricing
npm test                                   # 22 tests, no network needed
node probe.mjs                             # which sources answer from your network?
node cli.mjs sourdough "milk 6 pint" oats weetabix aptamil paneer
```

`probe.mjs` is the one to run first. It reports, per endpoint, whether you got
data, a block, a 404 (the path moved) or an unexpected shape — and with
`--raw` it dumps a raw ALDI record so you can re-check the field mapping in
`lib/providers/aldi.js` against reality.

### Example

```
$ node cli.mjs --verbose "milk 6 pint" oats

ITEM                 ALDI                  LIDL                  CHEAPER
milk 6 pint          £1.75 (51p/L)         £1.69 (50p/L)*        LIDL
oats                 90p (90p/kg)          —                     ALDI
```

`*` = promotional price, `?` = low-confidence match, `—` = nothing found.

### Recording a price you saw in store

```bash
node cli.mjs --add "oats|lidl|90|1kg|Lidl Bletchley"
```

That writes to `pricebook.json` and is used from then on.

## Using it from the shopping list app

The browser cannot call `api.aldi.co.uk` or `lidl.co.uk` directly — neither
sends CORS headers, so the request is blocked before it leaves the page. The
Worker in `worker.mjs` makes the calls server-side:

```bash
npx wrangler deploy --config pricing/wrangler.toml
```

Then put the URL it prints into `pricing-config.js` at the repo root:

```js
export const PRICE_API = 'https://shoppinglist-prices.<you>.workers.dev';
```

The **price tag button** in a list's app bar then compares every unticked item.
Until that URL is set, the button explains what is missing instead of failing.

Responses are cached in the Worker for 30 minutes — prices do not move minute
to minute, and it keeps request volume to the retailers low.

## How matching works

Retailer relevance ranking is a hint, not an answer: searching ALDI for "milk"
returns milk chocolate. So results are re-ranked locally.

- `lib/normalise.js` — `"2 x semi skimmed 4 pint"` → query `semi skimmed milk`,
  quantity 2, size 2272 ml. Fixes common misspellings (`Aptina` → `Aptamil`)
  and UK shorthand (`loo roll` → `toilet tissue`).
- `lib/units.js` — everything reduces to grams / millilitres / each, so pack
  sizes are comparable. A UK pint is 568 ml, so `6 pint` is 3408 ml.
- `lib/match.js` — scores candidates on token coverage, head noun, pack size
  and count. Below a confidence floor the result is flagged `?` rather than
  presented as fact.
- `lib/money.js` — retailer feeds are inconsistent about whether `amount` is
  pounds or pence, so a display string wins when present.

## Layout

```
pricing/
  cli.mjs                    compare from a terminal
  probe.mjs                  which endpoints answer, and what shape
  worker.mjs                 Cloudflare Worker: CORS bridge for the PWA
  wrangler.toml              deploy config
  pricebook.json             prices you recorded yourself
  lib/
    compare.js               orchestrator
    normalise.js  units.js   free text -> structured query
    match.js      money.js   re-ranking and price arithmetic
    http.js                  timeouts, one retry, compact errors
    providers/
      aldi.js                ALDI UK JSON API
      lidl.js                offers + Open Prices + price book
      openprices.js          Open Prices / Open Food Facts
      pricebook.js           pure lookup (bundles for the Worker)
      pricebook-node.js      file reading/writing (Node only)
  test/                      22 tests, including an end-to-end run
                             against stubbed upstream payloads
```

## Things worth knowing

- **These are undocumented endpoints.** ALDI can change a path or a field name
  without notice. When that happens `probe.mjs` tells you which, and the fix is
  in one place: the `SEARCH_ENDPOINTS` list and `mapProduct` in
  `lib/providers/aldi.js`.
- **Keep the request rate low.** This is built for checking a personal shopping
  list — a few dozen requests when you shop. The Worker's cache is there to
  keep it that way. Bulk-harvesting a whole catalogue is a different activity
  with different terms attached.
- **Open Prices data is ODbL-licensed** — reuse with attribution.
- **Check the shelf.** Every source here can be stale: offers rotate weekly,
  crowd-sourced prices are as old as their observation date, and your price
  book is as current as you last made it.

## Verification status

Everything that does not need the network is tested and passing (`npm test`,
22 tests, including an end-to-end comparison against stubbed ALDI and LIDL
payloads). The live endpoints were **not** reachable from the environment this
was written in, so run `node probe.mjs` from your own machine to confirm the
upstream shapes before trusting the numbers.
