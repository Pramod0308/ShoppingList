/* Score a retailer search result against a normalised shopping-list item.
   The retailer's own relevance ranking is a hint, not an answer: searching
   ALDI for "milk" returns milk chocolate, so we re-rank locally. */

import { canonicalText, tokenise } from './normalise.js';
import { bestSize, extractPackCount } from './units.js';

const WEIGHTS = {
  tokenCoverage: 55,   // do the item's words appear in the product name?
  firstToken:    12,   // the head noun matters most ("milk", "weetabix")
  sizeMatch:     20,   // same pack size as asked for
  packMatch:      8,   // same count
  categorySane:   5,
};

/** Fraction of the item's tokens present in the candidate name. */
function coverage(itemTokens, candTokens) {
  if (!itemTokens.length) return 0;
  const set = new Set(candTokens);
  let hit = 0;
  for (const t of itemTokens) {
    if (set.has(t)) { hit += 1; continue; }
    // Allow a simple prefix match so "yoghurt"/"yoghurts" and
    // "sourdough"/"sourdoughs" don't miss each other.
    if (candTokens.some(c => c.startsWith(t) || t.startsWith(c))) hit += 0.75;
  }
  return hit / itemTokens.length;
}

function sizeScore(itemSize, candSize) {
  if (!itemSize) return { score: 0, note: null };          // nothing asked for
  if (!candSize) return { score: -6, note: 'size unknown' };
  if (itemSize.dim !== candSize.dim) return { score: -10, note: 'different unit type' };
  const ratio = candSize.base / itemSize.base;
  if (Math.abs(ratio - 1) < 0.02) return { score: WEIGHTS.sizeMatch, note: 'exact size' };
  if (ratio > 0.5 && ratio < 2) return { score: WEIGHTS.sizeMatch * 0.35, note: 'near size' };
  return { score: -8, note: 'different size' };
}

/**
 * @param {object} item  from normaliseItem()
 * @param {{name:string, brand?:string, size?:string}} candidate
 * @returns {{score:number, reasons:string[], size:object|null}}
 */
export function scoreCandidate(item, candidate) {
  const nameText = canonicalText([candidate.brand, candidate.name, candidate.size].filter(Boolean).join(' '));
  const candTokens = tokenise(nameText);
  const reasons = [];

  const cov = coverage(item.tokens, candTokens);
  let score = cov * WEIGHTS.tokenCoverage;
  reasons.push(`match ${(cov * 100).toFixed(0)}%`);

  const head = item.tokens[0];
  if (head && candTokens.some(c => c === head || c.startsWith(head))) {
    score += WEIGHTS.firstToken;
  } else if (head) {
    score -= WEIGHTS.firstToken;
    reasons.push(`missing "${head}"`);
  }

  // Size can come from a dedicated field or be embedded in the name.
  const candSize = bestSize(candidate.size || '') || bestSize(candidate.name || '');
  const ss = sizeScore(item.size, candSize);
  score += ss.score;
  if (ss.note) reasons.push(ss.note);

  if (item.packCount) {
    const candPack = extractPackCount(candidate.size || '') ?? extractPackCount(candidate.name || '');
    if (candPack === item.packCount) { score += WEIGHTS.packMatch; reasons.push('pack matches'); }
    else if (candPack) { score -= 4; reasons.push(`pack ${candPack} not ${item.packCount}`); }
  }

  // Cheap guard against the classic "milk" -> "milk chocolate" failure.
  if (item.category === 'milk' && /chocolate|milkshake|shake/.test(nameText)) {
    score -= 30;
    reasons.push('looks like confectionery');
  }

  return { score: Math.round(score * 10) / 10, reasons, size: candSize };
}

/** Rank candidates, best first. */
export function rankCandidates(item, candidates) {
  return candidates
    .map(c => ({ ...c, _match: scoreCandidate(item, c) }))
    .sort((a, b) => b._match.score - a._match.score);
}

/** Below this we report "no confident match" rather than guess. */
export const CONFIDENCE_FLOOR = 35;
