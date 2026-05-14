// parsers/bausch.js
// Parser for the Bausch+Lomb 2025 price list (three pages).
//
// Page 1: two-column contact lens table.
//   Left column  — daily lenses:   product x≈20, price x≈227  ("N kr")
//   Right column — monthly lenses: product x≈309, price x≈542 ("N kr")
//   Pack size is embedded in every product name ("30p", "90pk", "6pk", "30 pk").
//
// Pages 2–3: lens care solutions and gas-permeable products. Same column layout.
//
// Output: array of { vendor, priceList, product, packSize, pricePerBox }

const { extractPages, groupIntoRows, parsePrice } = require('./pdf-utils');

const VENDOR     = 'Bausch+Lomb';
const PRICE_LIST = 'BAUSCH&LOMB Prislista 2025-02.pdf';

// Left column
const LEFT_PROD_MIN  = 15;
const LEFT_PROD_MAX  = 200;
const LEFT_PRICE_MIN = 215;
const LEFT_PRICE_MAX = 265;

// Right column
const RIGHT_PROD_MIN  = 300;
const RIGHT_PROD_MAX  = 540;
const RIGHT_PRICE_MIN = 530;
const RIGHT_PRICE_MAX = 570;

// Pack size pattern: "30p", "90p", "6pk", "30 pk", "3x360ml" etc.
function extractPackSize(name) {
  const m = name.match(/(\d+)\s*p(?:k)?(?!\w)/i);
  return m ? parseInt(m[1], 10) : null;
}

// Strip "N kr" suffix and parse
function parseBauschPrice(text) {
  if (!text) return null;
  const stripped = text.replace(/\s*kr\s*$/i, '').trim();
  return parsePrice(stripped);
}

function tryEntry(productItem, priceItem) {
  if (!productItem || !priceItem) return null;
  const price = parseBauschPrice(priceItem.text);
  if (price === null) return null; // covers "Pris" header

  const product = productItem.text.replace(/[®™]/g, '').replace(/\s+/g, ' ').trim();
  const packSize = extractPackSize(product);
  if (!packSize) return null;

  return { vendor: VENDOR, priceList: PRICE_LIST, product, packSize, pricePerBox: price };
}

async function parseBausch(filePath) {
  const pages = await extractPages(filePath);
  const entries = [];

  for (const pageItems of pages) {
    const rows = groupIntoRows(pageItems);

    for (const row of rows) {
      // Left column
      const leftProd  = row.items.find(i => i.x >= LEFT_PROD_MIN  && i.x <= LEFT_PROD_MAX);
      const leftPrice = row.items.find(i => i.x >= LEFT_PRICE_MIN && i.x <= LEFT_PRICE_MAX);
      const left = tryEntry(leftProd, leftPrice);
      if (left) entries.push(left);

      // Right column
      const rightProd  = row.items.find(i => i.x >= RIGHT_PROD_MIN  && i.x <= RIGHT_PROD_MAX);
      const rightPrice = row.items.find(i => i.x >= RIGHT_PRICE_MIN && i.x <= RIGHT_PRICE_MAX);
      const right = tryEntry(rightProd, rightPrice);
      if (right) entries.push(right);
    }
  }

  return entries;
}

module.exports = { parseBausch };
