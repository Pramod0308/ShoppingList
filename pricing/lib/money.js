/* Money handling. Everything is stored as integer pence to avoid float drift,
   because retailer APIs are inconsistent about whether `amount` is pounds or pence. */

export function penceToString(pence) {
  if (pence == null || !Number.isFinite(pence)) return null;
  return pence >= 100
    ? `£${(pence / 100).toFixed(2)}`
    : `${Math.round(pence)}p`;
}

/** Parse "£1.09", "1.09", "109p", "£1" -> 109 */
export function parsePriceToPence(input) {
  if (input == null) return null;
  if (typeof input === 'number') return Math.round(input);
  const s = String(input).trim().replace(/,/g, '');
  let m = /^£\s*(\d+(?:\.\d+)?)/.exec(s);
  if (m) return Math.round(Number(m[1]) * 100);
  m = /^(\d+(?:\.\d+)?)\s*p$/i.exec(s);
  if (m) return Math.round(Number(m[1]));
  m = /(\d+\.\d{2})/.exec(s);
  if (m) return Math.round(Number(m[1]) * 100);
  m = /^(\d+)$/.exec(s);
  if (m) return Number(m[1]);
  return null;
}

/**
 * Retailer feeds send price.amount as either pounds (1.09) or pence (109).
 * A display string is authoritative when present; otherwise infer.
 * @param {{amount?:number, display?:string, currency?:string}} raw
 */
export function coercePence(raw = {}) {
  const fromDisplay = parsePriceToPence(raw.display);
  if (fromDisplay != null) return { pence: fromDisplay, source: 'display' };

  const a = raw.amount;
  if (a == null || !Number.isFinite(Number(a))) return { pence: null, source: 'none' };
  const n = Number(a);
  // A non-integer is pounds by construction (1.09). An integer is ambiguous,
  // so treat it as pence — groceries priced at "109" are far more likely
  // £1.09 than £109.
  if (!Number.isInteger(n)) return { pence: Math.round(n * 100), source: 'pounds' };
  return { pence: n, source: 'pence-assumed' };
}

/**
 * Price per canonical base unit, in pence, for like-for-like comparison.
 * @param {number} pence
 * @param {{base:number, baseLabel:string}|null} size
 */
export function unitPrice(pence, size) {
  if (pence == null || !size?.base) return null;
  const per = pence / size.base;
  // Scale to a unit humans read: per kg, per litre, per item.
  const scale = size.baseLabel === 'g' ? 1000 : size.baseLabel === 'ml' ? 1000 : 1;
  const label = size.baseLabel === 'g' ? '/kg' : size.baseLabel === 'ml' ? '/L' : '/each';
  return { pence: per * scale, label, display: `${penceToString(Math.round(per * scale))}${label}` };
}
