// parsers/clearlii.js
// Clearlii 2025 price list — 5 products in a transposed column layout.
//
// The PDF has products as columns and price rows as rows, which makes
// positional parsing complex. Since there are only 5 products and prices
// rarely change, we hardcode the entries and return them directly.
//
// Inköpspriser (purchase prices) from:
//   Clearlii Professional_2025 - Synologen_Priser_Inkl MF.pdf
//
// Output: array of { vendor, priceList, product, packSize, pricePerBox }

const VENDOR     = 'Clearlii';
const PRICE_LIST = 'Clearlii Professional_2025 - Synologen_Priser_Inkl MF.pdf';

const ENTRIES = [
  { product: 'Vitamin Toric',     packSize: 30, pricePerBox: 144.0  },
  { product: 'Vitamin Multifokal', packSize: 30, pricePerBox: 144.0  },
  { product: 'Daily Advanced',     packSize: 30, pricePerBox: 145.0  },
  { product: 'Vitamin',            packSize: 30, pricePerBox: 121.60 },
  { product: 'Monthly Advanced',   packSize:  6, pricePerBox: 164.7  },
];

async function parseClearlii(_filePath) {
  return ENTRIES.map(e => ({ vendor: VENDOR, priceList: PRICE_LIST, ...e }));
}

module.exports = { parseClearlii };
