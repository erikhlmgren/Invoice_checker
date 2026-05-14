// matcher/synchrony.js
// Matches a Synchrony purchase line item against the parsed Synchrony price list.
//
// For Synchrony lenses:
//   - Product family comes from product name patterns
//   - Index is the decimal number in the product name
//   - Glastyp: "PH" suffix → Photo/Pol, default → Klara
//   - Coating column (HMCX/HMC+/HC): from the add-on field (first token before comma)
//     For FSV products, coating is also in the product name
//
const FAMILY_MAP = [
  // Progressive
  { pattern: /PRG Easy Wear/i,    family: 'synchrony Progressive Easy Wear HD' },
  { pattern: /PRG Easy Adapt/i,   family: 'synchrony Progressive Easy Adapt HD' },
  { pattern: /PRG Easy View/i,    family: 'synchrony Progressive Easy View HD' },
  { pattern: /PRG W&O/i,          family: 'synchrony Progressive Work & Office HD' },
  // Single Vision Stock (FSV) — must come before generic SV patterns
  { pattern: /FSV SPH/i,          family: 'synchrony Single Vision SPH Stock' },
  { pattern: /FSV AS/i,           family: 'synchrony Single Vision AS Stock' },
  // Single Vision Mineral — must come before generic SV SPH (more specific)
  { pattern: /SV SPH Min/i,       family: 'synchrony Single Vision SPH Min' },
  // Single Vision custom order
  { pattern: /SV SPH/i,           family: 'synchrony Single Vision SPH' },
  { pattern: /SV AS/i,            family: 'synchrony Single Vision AS' },
  // Bifocal — CT28 in purchase data = FT28 in price list (same product, different notation)
  { pattern: /Bifo(?:cal)? (?:CT|FT)28/i, family: 'synchrony Bifocal/Trifocal' },
];

const COATING_PATTERNS = [
  { pattern: /HMCX/i,     column: 'HMCX' },
  { pattern: /HMC\+/i,    column: 'HMC+' },
  { pattern: /\bHC\b/i,   column: 'HC' },
  { pattern: /SUPER AR/i, column: 'SC' },
  { pattern: /\bSC\b/i,   column: 'SC' },
  { pattern: /\bUC\b/i,   column: 'UC' },
];

function extractFamily(productName) {
  for (const { pattern, family } of FAMILY_MAP) {
    if (pattern.test(productName)) return family;
  }
  return null;
}

function extractGlastyp(productName) {
  // Bifocal lenses use a different glastyp convention in the price list
  if (/(?:CT|FT)28/i.test(productName)) {
    const photo = /\bPH\b/i.test(productName);
    // CT28 in invoice → 1.5 Bifocal CT28; FT28 → 1.6/1.59 Bifocal FT28
    const type = /CT28/i.test(productName) ? 'CT28' : 'FT28';
    return `Bifocal ${type}${photo ? ' Photo' : ''}`;
  }
  if (/\bPH\b/i.test(productName)) return 'Photo/Pol';
  return 'Klara';
}

function extractCoating(productName, addon) {
  const sources = [addon, productName].filter(Boolean);
  for (const src of sources) {
    for (const { pattern, column } of COATING_PATTERNS) {
      if (pattern.test(src)) return column;
    }
  }
  return null;
}

function extractIndex(productName) {
  const match = productName.match(/\b(1\.9|1\.8|1\.74|1\.67|1\.6|1\.59|1\.5)\b/);
  return match ? parseFloat(match[1]) : null;
}

function matchSynchrony(item, entries) {
  if (item.isReturn) return { status: 'SKIP', note: 'return' };

  const product = item.product || '';
  const addon = item.addon || '';

  const family = extractFamily(product);
  if (!family) return { status: 'NOT_FOUND', note: `unknown family: ${product}` };

  const index = extractIndex(product);
  if (!index) return { status: 'NOT_FOUND', note: `no index in: ${product}` };

  const glastyp = extractGlastyp(product);
  const coating = extractCoating(product, addon);
  if (!coating) return { status: 'NOT_FOUND', note: `no coating in addon: "${addon}"` };

  const entry = entries.find(e =>
    e.productFamily === family &&
    e.index === index &&
    e.glastyp === glastyp &&
    e.dvColumn === coating
  );

  if (!entry) {
    return {
      status: 'NOT_FOUND',
      note: `no price for: ${family} | ${index} | ${glastyp} | ${coating}`,
    };
  }

  const qty = Math.abs(item.quantity || 1);
  const expectedTotal = entry.price * qty;
  if (Math.abs(item.netto || 0) === 0) return { status: 'WAIVED', expectedTotal, family, glastyp, coating };
  const actualTotal = Math.abs(item.netto);
  const delta = actualTotal - expectedTotal;

  // Only flag overcharging. Negative delta = mom paid less than price list (discount) — not a problem.
  // 2 SEK tolerance: price list is integer SEK, invoice may have decimal rounding across 2 lenses.
  const status = delta <= 2 ? 'CORRECT' : 'DISCREPANCY';

  return {
    status,
    expectedPrice: entry.price,
    expectedTotal,
    actualTotal,
    delta: Math.round(delta * 100) / 100,
    glastyp,
    coating,
    family,
  };
}

module.exports = { matchSynchrony };
