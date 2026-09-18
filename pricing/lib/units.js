/* Unit parsing + canonicalisation for UK grocery sizes.
   Everything reduces to one of three canonical dimensions so that
   price-per-unit is comparable across ALDI and LIDL packaging. */

export const DIM = { MASS: 'mass', VOLUME: 'volume', COUNT: 'count' };

// Canonical bases: grams, millilitres, each.
const UNIT_TABLE = {
  // mass
  g:     { dim: DIM.MASS,   factor: 1,      label: 'g'  },
  gram:  { dim: DIM.MASS,   factor: 1,      label: 'g'  },
  grams: { dim: DIM.MASS,   factor: 1,      label: 'g'  },
  kg:    { dim: DIM.MASS,   factor: 1000,   label: 'g'  },
  kilo:  { dim: DIM.MASS,   factor: 1000,   label: 'g'  },
  kilos: { dim: DIM.MASS,   factor: 1000,   label: 'g'  },
  lb:    { dim: DIM.MASS,   factor: 453.592, label: 'g' },
  oz:    { dim: DIM.MASS,   factor: 28.3495, label: 'g' },

  // volume — UK pint is 568ml, which is exactly why "6 pint milk" needs its own rule
  ml:     { dim: DIM.VOLUME, factor: 1,     label: 'ml' },
  cl:     { dim: DIM.VOLUME, factor: 10,    label: 'ml' },
  l:      { dim: DIM.VOLUME, factor: 1000,  label: 'ml' },
  litre:  { dim: DIM.VOLUME, factor: 1000,  label: 'ml' },
  litres: { dim: DIM.VOLUME, factor: 1000,  label: 'ml' },
  liter:  { dim: DIM.VOLUME, factor: 1000,  label: 'ml' },
  pt:     { dim: DIM.VOLUME, factor: 568,   label: 'ml' },
  pint:   { dim: DIM.VOLUME, factor: 568,   label: 'ml' },
  pints:  { dim: DIM.VOLUME, factor: 568,   label: 'ml' },

  // count
  pack:   { dim: DIM.COUNT, factor: 1, label: 'each' },
  pk:     { dim: DIM.COUNT, factor: 1, label: 'each' },
  pc:     { dim: DIM.COUNT, factor: 1, label: 'each' },
  pcs:    { dim: DIM.COUNT, factor: 1, label: 'each' },
  each:   { dim: DIM.COUNT, factor: 1, label: 'each' },
  ea:     { dim: DIM.COUNT, factor: 1, label: 'each' },
  x:      { dim: DIM.COUNT, factor: 1, label: 'each' },
};

export function lookupUnit(token) {
  if (!token) return null;
  return UNIT_TABLE[String(token).toLowerCase().replace(/\./g, '')] || null;
}

/** "6 pint" -> { value: 6, unit: 'pint', dim: 'volume', base: 3408, baseLabel: 'ml' } */
export function makeSize(value, unitToken) {
  const u = lookupUnit(unitToken);
  if (!u || !Number.isFinite(value)) return null;
  return {
    value,
    unit: String(unitToken).toLowerCase(),
    dim: u.dim,
    base: value * u.factor,
    baseLabel: u.label,
  };
}

const SIZE_RE = new RegExp(
  String.raw`(\d+(?:[.,]\d+)?)\s*(kg|kilos?|g|grams?|lbs?|lb|oz|ml|cl|l|litres?|liters?|pts?|pints?|packs?|pks?|pcs?|pc|each|ea)\b`,
  'gi'
);

// "4 x 500g", "24 pack", "6 x 1l"
const MULTIPACK_RE = new RegExp(
  String.raw`(\d+)\s*(?:x|×)\s*(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l|litres?|pts?|pints?)\b`,
  'i'
);
const COUNTPACK_RE = /(\d+)\s*(?:x|×)?\s*(?:pack|pk|pcs?|s\b)?(?=\s|$)/i;

/**
 * Pull every size mention out of a free-text string.
 * Returns the most specific one first (multipack beats a bare size).
 */
export function extractSizes(text) {
  const out = [];
  if (!text) return out;

  const mp = MULTIPACK_RE.exec(text);
  if (mp) {
    const count = Number(mp[1]);
    const each = makeSize(Number(String(mp[2]).replace(',', '.')), mp[3]);
    if (each && count > 0) {
      out.push({
        ...each,
        value: each.value,
        multipack: count,
        base: each.base * count,
        label: `${count} x ${mp[2]}${mp[3]}`,
      });
    }
  }

  SIZE_RE.lastIndex = 0;
  let m;
  while ((m = SIZE_RE.exec(text)) !== null) {
    const size = makeSize(Number(String(m[1]).replace(',', '.')), m[2]);
    if (size) out.push({ ...size, label: `${m[1]}${m[2]}` });
  }
  return out;
}

/** Best single size for a string, or null. */
export function bestSize(text) {
  const sizes = extractSizes(text);
  if (!sizes.length) return null;
  // Prefer multipacks, then the largest base quantity (a "500g" beats a stray "1").
  return sizes.sort((a, b) => (b.multipack ? 1 : 0) - (a.multipack ? 1 : 0) || b.base - a.base)[0];
}

/** Count-style pack sizes: "24 pack", "pack of 12", "x6". */
export function extractPackCount(text) {
  if (!text) return null;
  const of = /pack\s+of\s+(\d+)/i.exec(text);
  if (of) return Number(of[1]);
  const pk = /(\d+)\s*(?:pack|pk)\b/i.exec(text);
  if (pk) return Number(pk[1]);
  const xn = /(?:^|\s)(?:x|×)\s*(\d+)(?=\s|$)/i.exec(text);
  if (xn) return Number(xn[1]);
  return null;
}
