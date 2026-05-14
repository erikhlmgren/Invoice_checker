// synchrony.js
// Parser for the Synchrony price list: "SYNCHRONY Prislista 2025.pdf"
//
// Same structure as CZV: sections with a header, column headers, data rows.
// Differences from CZV:
//   - Section headers start with "synchrony" (lowercase)
//   - Columns: HMCX | HMC+ | HC (organic), SC | UC (mineral)
//   - Glastyp: Klara, Photo/Pol, Photo, Bifocal FT28 variants
//
// Output: array of { vendor, priceList, productFamily, index, glastyp, dvColumn, price }

const { extractPages, groupIntoRows, parsePrice } = require('./pdf-utils');

const VENDOR = 'Synchrony';
const PRICE_LIST = 'SYNCHRONY Prislista 2025.pdf';

const KNOWN_COLUMNS = ['HMCX', 'HMC+', 'HC', 'SC', 'UC'];
const LENS_INDICES = new Set(['1.5', '1.59', '1.6', '1.67', '1.7', '1.8', '1.9']);

async function parseSynchrony(filePath) {
  const pages = await extractPages(filePath);
  const entries = [];

  let currentFamily = null;
  let columnDefs = [];

  for (const pageItems of pages) {
    const rows = groupIntoRows(pageItems);

    for (const row of rows) {
      const texts = row.items.map(i => i.text);
      const firstText = texts[0] || '';

      // Section header: starts with "synchrony" (case-insensitive)
      if (/^synchrony\b/i.test(firstText) && !isColumnHeader(texts) && !LENS_INDICES.has(firstText)) {
        currentFamily = normaliseFamily(firstText);
        columnDefs = [];
        continue;
      }

      // Column header row
      if (isColumnHeader(texts)) {
        columnDefs = extractColumnDefs(row.items);
        continue;
      }

      // Data row: starts with a lens index
      if (currentFamily && columnDefs.length && LENS_INDICES.has(firstText)) {
        const index = parseFloat(firstText);
        const glastyp = normaliseGlastyp(texts[1] || '');

        for (const col of columnDefs) {
          const item = row.items.find(i => Math.abs(i.x - col.x) <= 15);
          if (!item) continue;
          const price = parsePrice(item.text);
          if (price === null) continue;

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

function isColumnHeader(texts) {
  return texts.includes('Index') && texts.some(t => KNOWN_COLUMNS.includes(t));
}

function extractColumnDefs(items) {
  return items
    .filter(i => KNOWN_COLUMNS.includes(i.text))
    .map(i => ({ name: i.text, x: i.x }));
}

// "synchrony Progressive Easy View HD / Easy S" → "synchrony Progressive Easy View HD"
function normaliseFamily(name) {
  return name.split(' / ')[0].trim();
}

function normaliseGlastyp(raw) {
  const cleaned = raw.trim();
  if (cleaned === 'Photo / Pol' || cleaned === 'Photo/Pol') return 'Photo/Pol';
  if (cleaned === 'Photo') return 'Photo/Pol'; // photochromic without polarizing — same price tier
  return cleaned; // Klara, Umbramatic, Bifocal FT28, etc.
}

module.exports = { parseSynchrony };
