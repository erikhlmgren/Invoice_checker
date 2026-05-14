// czv.js
// Parser for the Carl Zeiss Vision (CZV) price list: "CZV Prislista 2025-04.pdf"
//
// Price list structure (8 pages):
//   - Each section = one product family, starting with "ZEISS [name]"
//   - Column header row: "Index  Glastyp  DVG  DVBP  DVP  DVC  HC" (columns vary by section)
//   - Data rows: "[index]  [glastyp]  [price or -] ..."
//
// Output: array of entries, one per valid (non-"-") price:
//   { productFamily, index, glastyp, dvColumn, price }

const { extractPages, groupIntoRows, parsePrice } = require('./pdf-utils');

const VENDOR = 'Carl Zeiss Vision';
const PRICE_LIST = 'CZV Prislista 2025-04.pdf';

// Column headers we recognize and will extract prices for.
// Includes both organic lens DV coatings and mineral lens surface treatments.
// Both old format (DVG) and new format (DV+G) are listed — they normalize to the same name.
const KNOWN_DV_COLUMNS = [
  // Old format
  'DVG', 'DVBP', 'DVDS', 'DVP', 'DVC', 'DVK', 'DVS', 'HC', 'UC',
  // New format (April 2026 price list) — PDF uses "DV + G" with spaces
  'DV + G', 'DV + P', 'DV + C', 'DV + DS', 'DV + BP',
  // Mineral lens columns
  'G/S Filter ET', 'Gold/Super ET', 'ET',
];

// Maps new column name formats to canonical internal names.
// The matcher always uses the canonical names, so this table is the only place
// that needs updating when Zeiss renames columns again.
const COLUMN_ALIASES = {
  'DV + G':  'DVG',
  'DV + P':  'DVP',
  'DV + C':  'DVC',
  'DV + DS': 'DVDS',
  'DV + BP': 'DVBP',
};

// Lens indices we expect to see in data rows.
const LENS_INDICES = new Set(['1.5', '1.59', '1.6', '1.67', '1.74']);

async function parseCZV(filePath) {
  const pages = await extractPages(filePath);
  const entries = [];

  let currentFamily = null;
  let columnDefs = []; // [{ name, x }] — the DV columns for the current section

  for (const pageItems of pages) {
    const rows = groupIntoRows(pageItems);

    for (const row of rows) {
      const texts = row.items.map(i => i.text);
      const firstText = texts[0] || '';

      // --- Section header: row that starts with "ZEISS" ---
      // The product family name is one text item. We normalise it by removing
      // the " / SmartLifePRO ..." variant so both PRO and non-PRO map the same way.
      if (firstText.startsWith('ZEISS') && !isColumnHeader(texts) && !LENS_INDICES.has(firstText)) {
        currentFamily = normaliseFamily(firstText);
        columnDefs = [];
        continue;
      }

      // --- Column header row: contains "Index" and "Glastyp" ---
      if (isColumnHeader(texts)) {
        columnDefs = extractColumnDefs(row.items);
        continue;
      }

      // --- Data row: starts with a lens index like 1.5, 1.6, 1.67, 1.74 ---
      if (currentFamily && columnDefs.length && LENS_INDICES.has(firstText)) {
        const index = parseFloat(firstText);

        // Glastyp is the second text item (e.g., "Klara UVProtect", "PhotoFusion X")
        const glastyp = normaliseGlastyp(texts[1] || '');

        // For each DV column, find the item at that x position and parse the price
        for (const col of columnDefs) {
          const item = row.items.find(i => Math.abs(i.x - col.x) <= 15);
          if (!item) continue;
          const price = parsePrice(item.text);
          if (price === null) continue; // "-" or not available

          entries.push({
            vendor: VENDOR,
            priceList: PRICE_LIST,
            productFamily: currentFamily,
            index,
            glastyp,
            dvColumn: col.name,
            price,
          });
        }
      }
    }
  }

  return entries;
}

// Returns true if this row is a column header row (contains "Index" and at least one DV column name).
function isColumnHeader(texts) {
  return texts.includes('Index') && texts.some(t => KNOWN_DV_COLUMNS.includes(t));
}

// Extracts column definitions from the header row items.
// Returns [{ name, x }] for each DV column found.
// Column names are normalized to canonical internal names via COLUMN_ALIASES.
function extractColumnDefs(items) {
  return items
    .filter(i => KNOWN_DV_COLUMNS.includes(i.text))
    .map(i => ({ name: COLUMN_ALIASES[i.text] ?? i.text, x: i.x }));
}

// Normalises the product family name.
// "ZEISS Progressive SmartLife Plus / SmartLifePRO Plus" → "ZEISS Progressive SmartLife Plus"
// We drop the " / ..." variant so PRO and non-PRO map to the same family.
function normaliseFamily(name) {
  return name.split(' / ')[0].trim();
}

// Normalises glastyp strings.
// "Klara BlueGuard" stays as-is. "PFX/Pol/Ads 1" → "PhotoFusion X" (PFX = PhotoFusion X).
// Numbers at the end (like "1" in "PFX/Pol/Ads 1") are footnote markers — strip them.
function normaliseGlastyp(raw) {
  const cleaned = raw.replace(/\s+\d+$/, '').trim(); // strip trailing footnote number
  if (cleaned.startsWith('PFX')) return 'PhotoFusion X';
  if (cleaned === 'PhotoFusion X 2') return 'PhotoFusion X';  // DriveSafe variant
  // Mineral-specific glastyp — preserve as-is
  if (cleaned === 'Klara') return 'Klara';
  if (cleaned === 'Umbramatic') return 'Umbramatic';
  return cleaned;
}

module.exports = { parseCZV };
