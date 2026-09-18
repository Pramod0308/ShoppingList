/* Turn a free-text shopping-list line into something worth sending to a
   retailer search box, plus the structure needed to score the results. */

import { bestSize, extractPackCount, lookupUnit } from './units.js';

/** Words that carry no signal in a grocery search. */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'and', 'or', 'for', 'with', 'some', 'any',
  'please', 'pls', 'buy', 'get', 'need', 'want', 'more', 'new',
  'x', 'pack', 'packs', 'pk', 'bottle', 'bottles', 'tub', 'tubs',
  'box', 'boxes', 'bag', 'bags', 'tin', 'tins', 'can', 'cans', 'jar', 'jars',
]);

/* Common shorthand, misspellings and UK-specific synonyms seen in real lists.
   Keys are matched on the whole normalised line and on single tokens. */
const ALIASES = new Map(Object.entries({
  // brand misspellings
  aptina: 'aptamil',
  aptamil: 'aptamil',
  weetabix: 'weetabix',
  weatabix: 'weetabix',
  wheatabix: 'weetabix',
  nutela: 'nutella',
  yakult: 'yakult',

  // shorthand -> searchable term
  'semi skimmed': 'semi skimmed milk',
  'semi-skimmed': 'semi skimmed milk',
  ss: 'semi skimmed milk',
  'full fat': 'whole milk',
  veg: 'vegetables',
  spuds: 'potatoes',
  toms: 'tomatoes',
  mayo: 'mayonnaise',
  'kitchen roll': 'kitchen towel',
  'loo roll': 'toilet tissue',
  'washing up liquid': 'washing up liquid',
}));

/** Category hints let the matcher reject wildly wrong results. */
const CATEGORY_HINTS = [
  { key: 'milk',     terms: ['milk'], excludes: ['milkshake', 'chocolate', 'coconut milk', 'oat milk', 'soya'] },
  { key: 'bread',    terms: ['bread', 'sourdough', 'loaf', 'baguette', 'bagel', 'roll'] },
  { key: 'cereal',   terms: ['weetabix', 'cereal', 'oats', 'porridge', 'granola', 'muesli', 'cornflakes'] },
  { key: 'dairy',    terms: ['paneer', 'cheese', 'yoghurt', 'yogurt', 'butter', 'cream'] },
  { key: 'babyfood', terms: ['aptamil', 'formula', 'cow & gate', 'sma', 'hipp'] },
  { key: 'eggs',     terms: ['egg', 'eggs'] },
];

export function canonicalText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9.,\s×x-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function applyAliases(text) {
  let out = text;
  // Longest phrases first so "semi skimmed" wins over "ss".
  const phrases = [...ALIASES.keys()].filter(k => k.includes(' ')).sort((a, b) => b.length - a.length);
  for (const p of phrases) {
    if (out.includes(p)) out = out.split(p).join(ALIASES.get(p));
  }
  return out
    .split(' ')
    .map(t => ALIASES.get(t) || t)
    .join(' ');
}

export function tokenise(text) {
  return canonicalText(text)
    .split(' ')
    .map(t => t.replace(/^[.,-]+|[.,-]+$/g, ''))
    .filter(t => t && !STOPWORDS.has(t) && !/^\d+([.,]\d+)?$/.test(t))
    // Size lives on item.size, so unit words are noise when scoring names.
    .filter(t => !lookupUnit(t) && !/^\d+(kg|g|ml|cl|l|pt|pint|oz|lb)$/.test(t));
}

function detectCategory(tokens, text) {
  for (const c of CATEGORY_HINTS) {
    if (c.terms.some(t => (t.includes(' ') ? text.includes(t) : tokens.includes(t)))) return c.key;
  }
  return null;
}

/** Leading quantity: "2 sourdough", "3x milk". Not the same thing as pack size. */
function extractQuantity(text) {
  const m = /^(\d+)\s*(?:x|×)?\s+(?=\D)/.exec(text);
  if (!m) return { qty: 1, rest: text };
  return { qty: Number(m[1]), rest: text.slice(m[0].length) };
}

/**
 * @param {string} line raw shopping-list text, e.g. "2 x milk 6 pint"
 * @returns {{raw,text,query,tokens,size,packCount,qty,category}}
 */
export function normaliseItem(line) {
  const raw = String(line || '');
  const canonical = applyAliases(canonicalText(raw));
  const { qty, rest } = extractQuantity(canonical);

  const size = bestSize(rest);
  const packCount = extractPackCount(rest);
  const tokens = tokenise(rest);

  // The search query drops size/pack noise — retailer search engines do better
  // with "semi skimmed milk" than with "semi skimmed milk 6 pint".
  const sizeLabels = new Set();
  if (size?.label) sizeLabels.add(canonicalText(size.label).replace(/\s/g, ''));
  const query = tokens
    .filter(t => !sizeLabels.has(t))
    .filter(t => !/^\d+(kg|g|ml|cl|l|pt|pint|oz|lb)$/.test(t))
    .filter(t => !lookupUnit(t))          // drop bare "pint", "kg", "pack"
    .join(' ')
    .trim() || canonical;

  return {
    raw,
    text: canonical,
    query,
    tokens,
    size,
    packCount,
    qty,
    category: detectCategory(tokens, canonical),
  };
}
