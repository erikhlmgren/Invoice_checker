// parsers/alcon.js
// Parser for Alcon 2026 price list (single flat table, one page).
//
// Table columns: Product | Pack Size | Invoice Price
// Product name sometimes spans two text items at different x positions.
// ® trademark symbols appear as standalone rows between data rows — skip them.
//
// Output: array of { vendor, priceList, product, packSize, pricePerBox }

const { extractPages, groupIntoRows, parsePrice } = require('./pdf-utils');

const VENDOR = 'Alcon';
const PRICE_LIST = 'Alcon 2026.pdf';

// Pack size column is at x≈261–290, price column is at x≈317–345
const COL_PACKSIZE_MIN = 250;
const COL_PACKSIZE_MAX = 295;
const COL_PRICE_MIN    = 310;
const COL_PRICE_MAX    = 360;

async function parseAlcon(filePath) {
  const pages = await extractPages(filePath);
  const entries = [];

  for (const pageItems of pages) {
    const rows = groupIntoRows(pageItems);

    for (const row of rows) {
      // Skip rows that are only ® trademark markers
      if (row.items.every(i => i.text === '®')) continue;

      // Pack size item must be present and contain "-pack" (e.g. "30-pack")
      const packItem = row.items.find(i =>
        i.x >= COL_PACKSIZE_MIN && i.x <= COL_PACKSIZE_MAX && /-pack/i.test(i.text)
      );
      if (!packItem) continue;

      // Price item
      const priceItem = row.items.find(i => i.x >= COL_PRICE_MIN && i.x <= COL_PRICE_MAX);
      if (!priceItem) continue;

      const packMatch = packItem.text.match(/(\d+)-pack/i);
      if (!packMatch) continue;
      const packSize = parseInt(packMatch[1], 10);
      const price = parsePrice(priceItem.text);
      if (!packSize || price === null) continue;

      // Product name = all items to the left of the pack size column, excluding standalone ®
      const nameItems = row.items.filter(i =>
        i.x < COL_PACKSIZE_MIN && i.text !== '®'
      );
      if (!nameItems.length) continue;

      const product = nameItems.map(i => i.text).join(' ')
        .replace(/[®™]/g, '').replace(/\s+/g, ' ').trim();
      if (!product) continue;

      entries.push({
        vendor: VENDOR,
        priceList: PRICE_LIST,
        product,
        packSize,
        pricePerBox: price,
      });
    }
  }

  return entries;
}

module.exports = { parseAlcon };
