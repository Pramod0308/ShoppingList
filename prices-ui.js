/* "Compare prices" sheet for a shopping list.
   Talks to the Worker in pricing/worker.mjs and renders an ALDI vs LIDL table. */

import { PRICE_API, TOWN } from './pricing-config.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

function overlay() {
  let o = document.getElementById('priceSheet');
  if (o) return o;
  o = el('div', 'sheet-backdrop');
  o.id = 'priceSheet';
  o.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Price comparison">
      <header class="sheet-head">
        <h2 class="sheet-title">ALDI vs LIDL</h2>
        <button class="icon-btn sheet-close" title="Close">
          <span class="material-symbols-outlined">close</span>
        </button>
      </header>
      <div class="sheet-body"></div>
    </div>`;
  document.body.appendChild(o);
  const close = () => o.remove();
  o.querySelector('.sheet-close').onclick = close;
  o.addEventListener('click', (e) => { if (e.target === o) close(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
  return o;
}

function priceCell(cell, retailer) {
  const wrap = el('div', `price-cell ${retailer}`);
  if (!cell || cell.status === 'none') {
    wrap.append(el('span', 'muted', '—'));
    return wrap;
  }
  const price = el('span', 'price', cell.price ?? '?');
  if (cell.status === 'low-confidence') price.classList.add('uncertain');
  wrap.append(price);
  if (cell.promo) wrap.append(el('span', 'tag promo', 'offer'));
  const sub = [cell.name, cell.unitPrice].filter(Boolean).join(' · ');
  if (sub) wrap.append(el('div', 'muted tiny', sub));
  if (cell.source === 'pricebook') wrap.append(el('div', 'muted tiny', `your note${cell.observedAt ? ' · ' + cell.observedAt : ''}`));
  else if (cell.source === 'open-prices') wrap.append(el('div', 'muted tiny', `seen ${cell.observedAt ?? 'recently'}${cell.observedIn ? ' · ' + cell.observedIn : ''}`));
  return wrap;
}

function render(body, data) {
  body.innerHTML = '';

  const table = el('div', 'price-table');
  const head = el('div', 'price-row head');
  head.append(el('div', null, 'Item'), el('div', null, 'ALDI'), el('div', null, 'LIDL'));
  table.append(head);

  for (const r of data.rows) {
    const row = el('div', 'price-row');
    const name = el('div', 'price-item');
    name.append(el('div', null, r.item));
    if (r.qty > 1) name.append(el('span', 'muted tiny', `× ${r.qty}`));
    row.append(name, priceCell(r.aldi, 'aldi'), priceCell(r.lidl, 'lidl'));
    if (r.cheaper === 'aldi') row.classList.add('win-aldi');
    if (r.cheaper === 'lidl') row.classList.add('win-lidl');
    table.append(row);
  }

  const t = data.totals;
  const foot = el('div', 'price-row total');
  foot.append(
    el('div', null, `Priced items (${t.comparable}/${t.itemCount} at both)`),
    el('div', null, t.aldi.price ?? '—'),
    el('div', null, t.lidl.price ?? '—'),
  );
  table.append(foot);
  body.append(table);

  const note = el('p', 'muted tiny');
  note.textContent =
    `${TOWN} · ${new Date(data.generatedAt).toLocaleString('en-GB')}` +
    (data.cached ? ' · cached' : '') +
    '. Totals cover only the items that were priced. LIDL has no public price API, so its column ' +
    'comes from weekly offers, crowd-sourced prices and your own notes — check at the shelf.';
  body.append(note);
}

/** @param {string[]} itemTexts */
export async function openPriceCompare(itemTexts) {
  const items = itemTexts.map(s => (s || '').trim()).filter(Boolean);
  const sheet = overlay();
  const body = sheet.querySelector('.sheet-body');

  if (!items.length) {
    body.textContent = 'Add some items first.';
    return;
  }
  if (!PRICE_API) {
    body.innerHTML =
      '<p>No price API configured yet.</p>' +
      '<p class="muted tiny">Deploy the worker with <code>npx wrangler deploy --config pricing/wrangler.toml</code>, ' +
      'then put its URL in <code>pricing-config.js</code>. ' +
      'You can also compare from a terminal right now: <code>node pricing/cli.mjs ' +
      items.slice(0, 3).map(i => JSON.stringify(i)).join(' ') + '</code></p>';
    return;
  }

  body.innerHTML = '<p class="muted">Checking prices…</p>';
  try {
    const url = `${PRICE_API.replace(/\/$/, '')}/api/prices?items=${encodeURIComponent(items.join(','))}&town=${encodeURIComponent(TOWN)}`;
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`Price service returned ${res.status}`);
    render(body, await res.json());
  } catch (err) {
    body.innerHTML = '';
    body.append(el('p', null, 'Could not fetch prices.'), el('p', 'muted tiny', err.message));
  }
}
