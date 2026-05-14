// parsers/mauijim.js
// Parser for the Maui Jim 2026 Plano price list (four pages).
//
// Table columns: Style Name | Style # | Wholesale | MSRP | ...
//   Style Name at x≈73, Style # at x≈190, Wholesale at x≈237
//
// Output: array of { vendor, priceList, styleName, styleNumber, wholesale }

const { extractPages, groupIntoRows, parsePrice } = require('./pdf-utils');

const VENDOR     = 'Maui Jim';
const PRICE_LIST = 'Price List MAUI JIM_2026-03-01_SEK Plano (WHLS+MSRP).pdf';

const COL_STYLE_NAME  = 73;
const COL_STYLE_NUM   = 190;
const COL_WHOLESALE   = 237;
const T = 25;

// Header row texts to skip
const SKIP_TEXTS = new Set(['Style Name', 'Style #', 'Wholesale', 'MSRP', 'RX', 'MyMaui', 'Reader']);

function isHeaderRow(texts) {
  return texts.some(t => SKIP_TEXTS.has(t));
}

function isInfoRow(texts) {
  // Skip updated/note rows
  return texts.some(t => /Updated|Sweden|SEK|Plano|Wholesale\s*\+/i.test(t));
}

async function parseMauiJim(filePath) {
  const pages = await extractPages(filePath);
  const entries = [];

  for (const pageItems of pages) {
    const rows = groupIntoRows(pageItems);

    for (const row of rows) {
      const texts = row.items.map(i => i.text);
      if (isHeaderRow(texts) || isInfoRow(texts)) continue;

      const nameItem = row.items.find(i => Math.abs(i.x - COL_STYLE_NAME) <= T);
      if (!nameItem) continue;

      const numItem  = row.items.find(i => Math.abs(i.x - COL_STYLE_NUM)  <= T);
      const whlsItem = row.items.find(i => Math.abs(i.x - COL_WHOLESALE)  <= T);
      if (!whlsItem) continue;

      const wholesale = parsePrice(whlsItem.text);
      if (wholesale === null) continue;

      const styleName   = nameItem.text.trim();
      const styleNumber = numItem ? parseInt(numItem.text, 10) || null : null;

      entries.push({ vendor: VENDOR, priceList: PRICE_LIST, styleName, styleNumber, wholesale });
    }
  }

  return entries;
}

module.exports = { parseMauiJim };
