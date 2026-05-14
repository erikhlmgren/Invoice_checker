// matcher/czv.js
// Matches a ZEISS purchase line item against the parsed CZV price list entries.
//
// For each line item it figures out:
//   1. Product family  -- from product name patterns (e.g. "SML Superb" → SmartLife Superb)
//   2. Lens index      -- the decimal number in the product name (1.5, 1.6, 1.67, 1.74)
//   3. Glastyp         -- the coating type, derived from suffix in product name
//   4. DV column       -- the AR treatment, from the add-on field (or product name for FSV)
//
// Expected total price = price list entry × |quantity|
// Compared against netto (actual total charged).
//
// Returns: { status, expectedPrice, actualPrice, delta, note }
// Status: CORRECT | DISCREPANCY | NOT_FOUND | SKIP

// --- Product family mapping ---
// Checked in order. First match wins.
// "P " between SML and tier name = PRO variant — maps to the same family.
const FAMILY_MAP = [
  // Mineral variants — must come before generic SmartLife patterns (more specific first)
  { pattern: /PRG SML P? ?Indi3 Min/i,     family: 'ZEISS Progressive SmartLife Individual 3 Mineral' },
  { pattern: /PRG SML P? ?Superb Min/i,    family: 'ZEISS Progressive SmartLife Superb Mineral' },
  { pattern: /PRG SML P? ?Plus Min/i,      family: 'ZEISS Progressive SmartLife Plus Mineral' },
  { pattern: /Digital SML P? ?Indi3 Min/i, family: 'ZEISS Digital Lens SmartLife Individual 3 Mineral' },
  { pattern: /Digital SML Min/i,           family: 'ZEISS Digital Lens SmartLife Mineral' },
  // Progressive SmartLife
  { pattern: /PRG SML P? ?Indi3/i,         family: 'ZEISS Progressive SmartLife Individual 3' },
  { pattern: /PRG SML P? ?Individual/i,    family: 'ZEISS Progressive SmartLife Individual 3' },
  { pattern: /PRG SML P? ?Superb/i,        family: 'ZEISS Progressive SmartLife Superb' },
  { pattern: /PRG SML P? ?Plus/i,          family: 'ZEISS Progressive SmartLife Plus' },
  { pattern: /PRG SML P? ?Pure/i,          family: 'ZEISS Progressive SmartLife Pure L\/M\/S' },
  // Progressive Individual Sport ("Sp" = Sport in purchase data)
  { pattern: /PRG Individual/i,            family: 'ZEISS Progressive Individual 2 Sport' },
  // Progressive Light 2 — "D L" variant before "3D" so "D L" doesn't match "3D"
  { pattern: /PRG Light2 D/i,              family: 'ZEISS Progressive Light 2 D L/S' },
  { pattern: /PRG Light2/i,                family: 'ZEISS Progressive Light 2 3D L/M/S' },
  // Digital — Indi3 before generic SmartLife
  { pattern: /Digital SML P? ?Indi3/i,     family: 'ZEISS Digital Lens SmartLife Individual 3' },
  { pattern: /Digital SML/i,               family: 'ZEISS Digital Lens SmartLife' },
  // Officelens
  { pattern: /officelens Plus/i,           family: 'ZEISS Officelens Plus' },
  { pattern: /officelens Superb/i,         family: 'ZEISS Officelens Superb' },
  { pattern: /officelens Individual/i,     family: 'ZEISS Officelens Individual' },
  // MyoCare
  { pattern: /MyoCare/i,                   family: 'ZEISS MyoCare' },
  // Single Vision SmartLife — Indi3 and Young before generic SML (more specific first)
  { pattern: /SV SML P? ?Indi3/i,          family: 'ZEISS Single Vision SmartLife Individual 3' },
  { pattern: /SV SML P? ?Young/i,          family: 'ZEISS Single Vision SmartLife Young' },
  { pattern: /SV SML/i,                    family: 'ZEISS Single Vision SmartLife' },
  // Single Vision stock — FSV and ES LAG (Enstyrke Lager) both map to Stock rows
  { pattern: /FSV ClearView/i,             family: 'ZEISS Single Vision ClearView Stock' },
  { pattern: /FSV SPH/i,                   family: 'ZEISS Single Vision SPH Stock' },
  { pattern: /ES LAG SPH/i,               family: 'ZEISS Single Vision SPH Stock' },
  // Single Vision custom order
  { pattern: /SV ClearView/i,              family: 'ZEISS Single Vision ClearView' },
  { pattern: /SV DriveSafe/i,              family: 'ZEISS Single Vision DriveSafe' },
  { pattern: /SV SPH/i,                    family: 'ZEISS Single Vision SPH' },
  // Special
  { pattern: /Bifo CT28/i,                 family: 'ZEISS Bifocal' },
];

// --- Glastyp mapping ---
// Derived from suffixes in the product name (and addon for edge cases).
function extractGlastyp(productName, addon) {
  // Mineral lenses use "Klara" (clear) or "Umbramatic" (photochromic) — no DV suffix
  if (/\bMin\b/i.test(productName))         return 'Klara'; // default mineral glastyp
  if (/PFX|PhotoFusion/i.test(productName)) return 'PhotoFusion X';
  // AD = AdaptiveSun (photochromic). DV SUN is an additional UV coating applied on top —
  // it does not change the base glastyp. AD lenses are always PhotoFusion X.
  if (/\bAD\b/i.test(productName)) return 'PhotoFusion X';
  if (/BL\b/i.test(productName))            return 'Klara BlueGuard';
  return 'Klara UVProtect'; // default for organic lenses
}

// --- DV column mapping ---
// Checked against the add-on field (or product name for FSV stock lenses).
const DV_PATTERNS = [
  // Organic lens DV coatings
  { pattern: /DV PLATINUM/i,      column: 'DVP' },
  { pattern: /DV BLUEPROTECT/i,   column: 'DVBP' },
  { pattern: /DV BLUPROTECT/i,    column: 'DVBP' },
  { pattern: /DURAVISION GOLD/i,  column: 'DVG' },
  { pattern: /DV GOLD/i,          column: 'DVG' },
  { pattern: /DV CHROME/i,        column: 'DVC' },
  { pattern: /DV DRIVESAFE/i,     column: 'DVDS' },
  // DV SUN is a surcharge addon (+103 SEK/lens from CZV last page), not a base coating column.
  // When DV SUN is in the addon, base coat is HC. Handled in extractDvColumn fallback.
  // Mineral lens surface treatments
  { pattern: /G\/S FILTER/i,      column: 'G/S Filter ET' },
  { pattern: /SUPER ET|GOLD ET/i, column: 'Gold/Super ET' },
  { pattern: /\bET\b/i,           column: 'ET' },
  { pattern: /\bUC\b/i,           column: 'UC' },
  // In product name (stock products — DVSun before DV SUN fallback)
  { pattern: /DVSun/i,            column: 'DVS' },
  { pattern: /\bDVP\b/,           column: 'DVP' },
  { pattern: /\bDVBP\b/,          column: 'DVBP' },
  { pattern: /\bDVDS\b/,          column: 'DVDS' },
  { pattern: /\bDVG\b/,           column: 'DVG' },
  { pattern: /\bDVC\b/,           column: 'DVC' },
  { pattern: /\bHC\b/,            column: 'HC' },
];

function extractDvColumn(productName, addon) {
  // Check add-on first, then product name
  const sources = [addon, productName].filter(Boolean);
  for (const src of sources) {
    for (const { pattern, column } of DV_PATTERNS) {
      if (pattern.test(src)) return column;
    }
  }
  // DV SUN lenses: base coat is HC. The DVS surcharge (103 SEK/lens) is applied via addon-prices.json.
  // Colour tint (helfärg, e.g. BROWN85%) is also an addon — price confirmed separately.
  if (/DV SUN/i.test(addon || '')) return 'HC';
  // OPTIMA VERSION without an explicit DV coating = lens ordered with base HC coat.
  if (/OPTIMA VERSION/i.test(addon || '')) return 'HC';
  return null;
}

// --- Index extraction ---
// Use (?!\d) instead of trailing \b to handle suffixes like "1.6BL" (BlueGuard)
function extractIndex(productName) {
  const match = productName.match(/\b(1\.74|1\.67|1\.6|1\.59|1\.5)(?!\d)/);
  return match ? parseFloat(match[1]) : null;
}

// --- Family extraction ---
function extractFamily(productName) {
  for (const { pattern, family } of FAMILY_MAP) {
    if (pattern.test(productName)) return family;
  }
  return null;
}

// --- Main match function ---
// entries: the parsed CZV price list (array from czv.js parser)
// item: one line item from loader.js (with vendor already attached by router.js)
function matchCZV(item, entries) {
  // Skip returns and non-ZEISS items
  if (item.isReturn) return { status: 'SKIP', note: 'return' };

  const product = item.product || '';
  const addon = item.addon || '';

  const family = extractFamily(product);
  if (!family) return { status: 'NOT_FOUND', note: `unknown family: ${product}` };

  const index = extractIndex(product);
  if (!index) return { status: 'NOT_FOUND', note: `no index in: ${product}` };

  const glastyp = extractGlastyp(product, addon);
  const dvColumn = extractDvColumn(product, addon);
  if (!dvColumn) return { status: 'NOT_FOUND', note: `no DV column in addon: "${addon}"` };

  let entry = entries.find(e =>
    e.productFamily === family &&
    e.index === index &&
    e.glastyp === glastyp &&
    e.dvColumn === dvColumn
  );

  // PFX fallback: if the price list doesn't have a PFX entry for this DV column + index
  // (e.g. PFX HC at 1.67 doesn't exist), fall back to Klara UVProtect. The lens may be
  // genuinely Klara, or the customer may have been given a discount on a PFX lens — either
  // way we'll catch any real overcharge against the Klara baseline.
  if (!entry && glastyp === 'PhotoFusion X') {
    entry = entries.find(e =>
      e.productFamily === family &&
      e.index === index &&
      e.glastyp === 'Klara UVProtect' &&
      e.dvColumn === dvColumn
    );
  }

  if (!entry) {
    return {
      status: 'NOT_FOUND',
      note: `no price for: ${family} | ${index} | ${glastyp} | ${dvColumn}`,
    };
  }

  const qty = Math.abs(item.quantity || 1);
  const expectedTotal = entry.price * qty;
  if (Math.abs(item.netto || 0) === 0) return { status: 'WAIVED', expectedTotal, family, glastyp, dvColumn };
  const actualTotal = Math.abs(item.netto);
  const delta = actualTotal - expectedTotal;

  // Only flag overcharging. Negative delta = mom paid less than price list (discount) — not a problem.
  // 2 SEK tolerance: price list is integer SEK, invoice may have decimal rounding across 2 lenses.
  const status = delta <= 2 ? 'CORRECT' : 'DISCREPANCY';

  return {
    status,
    expectedPrice: entry.price,   // per unit
    expectedTotal,
    actualTotal,
    delta: Math.round(delta * 100) / 100,
    glastyp,
    dvColumn,
    family,
  };
}

module.exports = { matchCZV };
