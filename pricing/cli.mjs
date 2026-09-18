#!/usr/bin/env node
/* Compare a shopping list across ALDI and LIDL from the command line.
 *
 *   node pricing/cli.mjs sourdough "milk 6 pint" oats weetabix aptamil paneer
 *   node pricing/cli.mjs --file list.txt --json
 *   node pricing/cli.mjs --store MK9 "milk 6 pint"
 */

import { readFile } from 'node:fs/promises';
import { compareBasket } from './lib/compare.js';
import * as aldi from './lib/providers/aldi.js';
import * as pricebook from './lib/providers/pricebook-node.js';

function parseArgs(argv) {
  const opts = { items: [], json: false, town: 'Milton Keynes', store: null, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--verbose' || a === '-v') opts.verbose = true;
    else if (a === '--town') opts.town = argv[++i];
    else if (a === '--store') opts.store = argv[++i];
    else if (a === '--file' || a === '-f') opts.file = argv[++i];
    else if (a === '--add') opts.add = argv[++i];
    else if (a === '--help' || a === '-h') opts.help = true;
    else opts.items.push(a);
  }
  return opts;
}

const HELP = `
Compare UK grocery prices across ALDI and LIDL.

  node pricing/cli.mjs <item> [item...]      compare these items
  node pricing/cli.mjs --file list.txt       one item per line
  node pricing/cli.mjs --store MK9 <item>    resolve an ALDI store near a postcode first
  node pricing/cli.mjs --add "oats|lidl|90|1kg|Lidl Bletchley"
                                             record a price you saw in store

Options
  --json        machine-readable output
  --town NAME   town for Open Prices store matching (default: Milton Keynes)
  -v            show why each match was chosen, and LIDL layer diagnostics
`;

const C = process.stdout.isTTY
  ? { dim: s => `\x1b[2m${s}\x1b[0m`, bold: s => `\x1b[1m${s}\x1b[0m`, green: s => `\x1b[32m${s}\x1b[0m`,
      yellow: s => `\x1b[33m${s}\x1b[0m`, red: s => `\x1b[31m${s}\x1b[0m`, cyan: s => `\x1b[36m${s}\x1b[0m` }
  : { dim: s => s, bold: s => s, green: s => s, yellow: s => s, red: s => s, cyan: s => s };

function cell(c) {
  if (c.status === 'none') return C.dim('—');
  const price = c.price ?? '?';
  const tail = c.unitPrice ? C.dim(` (${c.unitPrice})`) : '';
  const flag = c.status === 'low-confidence' ? C.yellow('?') : c.promo ? C.cyan('*') : '';
  return `${price}${flag}${tail}`;
}

const clip = (s, n = 150) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

function pad(s, n) {
  const visible = String(s).replace(/\x1b\[[0-9;]*m/g, '');
  return s + ' '.repeat(Math.max(0, n - visible.length));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { console.log(HELP); return; }

  if (opts.add) {
    const [key, retailer, pence, size, store] = opts.add.split('|').map(s => s?.trim());
    if (!key || !retailer || !pence) {
      console.error('--add expects "key|retailer|pence|size|store", e.g. "oats|lidl|90|1kg|Lidl Bletchley"');
      process.exitCode = 1; return;
    }
    const book = await pricebook.load();
    pricebook.put(book, key, retailer, { pence: Number(pence), size: size || null, store: store || null });
    const path = await pricebook.save(book);
    console.log(`Saved ${key} @ ${retailer} = ${pence}p to ${path}`);
    return;
  }

  let items = opts.items;
  if (opts.file) {
    const text = await readFile(opts.file, 'utf8');
    items = text.split('\n').map(s => s.trim()).filter(Boolean);
  }
  if (!items.length) { console.log(HELP); return; }

  if (opts.store) {
    const found = await aldi.findStores(opts.store);
    if (found.ok) {
      console.log(C.bold(`ALDI stores near ${opts.store}:`));
      for (const s of found.stores.slice(0, 8)) console.log(`  ${s.id}\t${s.name ?? ''} ${s.postcode ?? ''}`);
      process.env.ALDI_SERVICE_POINT = found.stores[0].id;
      console.log(C.dim(`Using servicePoint=${found.stores[0].id}\n`));
    } else {
      console.log(C.yellow(`Could not resolve an ALDI store for ${opts.store}: ${found.error}\n`));
    }
  }

  const book = await pricebook.load().catch(err => { console.error(err.message); return {}; });
  const result = await compareBasket(items, { town: opts.town, book });

  if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }

  const W = 30;
  console.log(C.bold(`\nALDI vs LIDL — ${result.town} — ${new Date(result.generatedAt).toLocaleString('en-GB')}\n`));
  console.log(C.bold(pad('ITEM', W) + pad('ALDI', 24) + pad('LIDL', 24) + 'CHEAPER'));
  console.log(C.dim('-'.repeat(W + 24 + 24 + 10)));

  for (const r of result.rows) {
    const winner = r.cheaper === 'aldi' ? C.green('ALDI') : r.cheaper === 'lidl' ? C.green('LIDL')
                 : r.cheaper === 'tie' ? C.dim('tie') : C.dim('—');
    console.log(pad(r.item.slice(0, W - 1), W) + pad(cell(r.aldi), 24) + pad(cell(r.lidl), 24) + winner);
    if (opts.verbose) {
      if (r.aldi.status !== 'none') console.log(C.dim(`    ALDI: ${r.aldi.name} [${r.aldi.score}] ${r.aldi.why.join(', ')}`));
      else console.log(C.dim(`    ALDI: ${clip(r.aldi.reason)}`));
      if (r.lidl.status !== 'none') console.log(C.dim(`    LIDL: ${r.lidl.name} [${r.lidl.score}] via ${r.lidl.source}${r.lidl.observedIn ? ' @ ' + r.lidl.observedIn : ''}`));
      else console.log(C.dim(`    LIDL: ${clip(r.lidl.reason)}`));
      for (const l of r.lidlLayers) console.log(C.dim(`      layer ${l.layer}: ${l.ok ? l.count + ' hit(s)' : 'miss — ' + clip(l.error, 110)}`));
    }
  }

  const t = result.totals;
  console.log(C.dim('-'.repeat(W + 24 + 24 + 10)));
  console.log(pad(C.bold('BASKET'), W) + pad(`${t.aldi.price ?? '—'} ${C.dim(`(${t.aldi.itemsPriced}/${t.itemCount})`)}`, 24)
            + pad(`${t.lidl.price ?? '—'} ${C.dim(`(${t.lidl.itemsPriced}/${t.itemCount})`)}`, 24));
  console.log(C.dim(`\n${t.comparable}/${t.itemCount} items priced at both. ? = low confidence, * = promo price.`));
  console.log(C.dim('Totals only add up items that were priced — they are not a full basket comparison.\n'));
}

main().catch(err => { console.error(err); process.exitCode = 1; });
