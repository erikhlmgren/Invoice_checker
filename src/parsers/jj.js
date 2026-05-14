// parsers/jj.js
// Parser for the Johnson & Johnson ACUVUE 2026 price list.
//
// Table columns: Product | Antal/Box | Listpris SEK | Ditt pris SEK
// Product at x≈117, pack size "30P"/"90P" at x≈328, ditt pris at x≈441.
// Some rows have ® on a separate y (±3px) — those rows are skipped as ®-only.
// Page 2 is legal disclaimers — no data rows.
//
// Output: array of { vendor, priceList, product, packSize, pricePerBox }

const { extractPages, groupIntoRows, parsePrice } = require('./pdf-utils');

const VENDOR     = 'Johnson & Johnson';
const PRICE_LIST = 'Jonhson o Jonhson prislista 2026.pdf';

const COL_PRODUCT_MIN = 100;
const COL_PRODUCT_MAX = 170;
const COL_PACKSIZE    = 328;
const COL_PRICE       = 441;
const T = 20; // tolerance

// Patterns that identify non-data rows
const SKIP_PATTERNS = [
  /^(Land|Sverige|Synologen|Antal\/Box|Listpris|Ditt pris)$/i,
  /ACUVUE.*kontaktlinser/i,
  /bruksanvisning|varumärken|Johnson.*Johnson|^\s*©/i,
  /ACUVUE.*PRISLISTA/i,
];

function shouldSkip(texts) {
  return texts.some(t => SKIP_PATTERNS.some(re => re.test(t)));
}

async function parseJJ(filePath) {
  const pages = await extractPages(filePath);
  const entries = [];

  for (const pageItems of pages) {
    const rows = groupIntoRows(pageItems);

    for (const row of rows) {
      const texts = row.items.map(i => i.text);

      // Skip ®-only rows and header/footer rows
      if (texts.every(t => t === '®')) continue;
      if (shouldSkip(texts)) continue;

      // Product item: left-most column
      const productItem = row.items.find(i =>
        i.x >= COL_PRODUCT_MIN && i.x <= COL_PRODUCT_MAX
      );
      if (!productItem) continue;

      // Pack size: "30P", "90P", "12P", "27P" etc.
      const packItem = row.items.find(i =>
        Math.abs(i.x - COL_PACKSIZE) <= T && /^\d+P$/i.test(i.text)
      );
      if (!packItem) continue;

      // Ditt pris (customer price)
      const priceItem = row.items.find(i => Math.abs(i.x - COL_PRICE) <= T);
      if (!priceItem) continue;

      const packSize = parseInt(packItem.text, 10);
      const price    = parsePrice(priceItem.text);
      if (!packSize || price === null) continue;

      // Assemble product name from all items in the product zone, strip trademarks
      const nameItems = row.items.filter(i =>
        i.x >= COL_PRODUCT_MIN && i.x < COL_PACKSIZE - T
      );
      const product = nameItems
        .map(i => i.text)
        .join(' ')
        .replace(/[®™]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!product) continue;

      entries.push({ vendor: VENDOR, priceList: PRICE_LIST, product, packSize, pricePerBox: price });
    }
  }

  return entries;
}

module.exports = { parseJJ };
