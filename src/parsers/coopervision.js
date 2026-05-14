// parsers/coopervision.js
// Parser for the CooperVision 2026 price list (single flat table, one page).
//
// Table columns: Product | Material | Pack size | Price/box | Price/trial
// No sections, no coating columns — contact lenses priced per box.
//
// Output: array of { vendor, priceList, product, packSize, pricePerBox, priceTrial }
// - product: as it appears in the price list ("Biofinity toric", "MyDay", etc.)
// - packSize: integer (6, 30, 90, etc.)
// - priceTrial: SEK per trial pack, or null if no trial price listed

const { extractPages, groupIntoRows, parsePrice } = require('./pdf-utils');

const VENDOR = 'CooperVision';
const PRICE_LIST = 'Cooper Vision 2026 (1).pdf';

// Column x positions (from PDF inspection)
const COL_PRODUCT   = 204;
const COL_PACKSIZE  = 395; // header 387, data 401-403
const COL_PRICEBOX  = 453; // header 448, data 457
const COL_PRICETRIAL = 516; // header 505, data 523-527

const T_PRODUCT  = 20;
const T_PACKSIZE = 20;
const T_PRICE    = 15;
const T_TRIAL    = 25; // wider — trial column has larger offset from header

async function parseCooperVision(filePath) {
  const pages = await extractPages(filePath);
  const entries = [];

  let pendingEntry = null;

  for (const pageItems of pages) {
    const rows = groupIntoRows(pageItems);

    for (const row of rows) {
      const texts = row.items.map(i => i.text);
      const first = texts[0] || '';

      // Skip header row and footer rows
      if (texts.includes('Product') && texts.includes('Pack size')) continue;
      if (/customer service|coopervision reserves|@coopervision|jakob|henrik|jonas|miriam/i.test(first)) continue;
      if (first.includes('@')) continue;

      const productItem = row.items.find(i => Math.abs(i.x - COL_PRODUCT) <= T_PRODUCT);

      if (productItem) {
        // Save previous pending entry before starting a new one
        if (pendingEntry) entries.push(pendingEntry);

        const packItem  = row.items.find(i => Math.abs(i.x - COL_PACKSIZE)  <= T_PACKSIZE);
        const boxItem   = row.items.find(i => Math.abs(i.x - COL_PRICEBOX)  <= T_PRICE);
        const trialItem = row.items.find(i => Math.abs(i.x - COL_PRICETRIAL) <= T_TRIAL);

        if (!packItem || !boxItem) { pendingEntry = null; continue; }

        const packSize   = parseInt(packItem.text, 10);
        const pricePerBox = parsePrice(boxItem.text);
        if (!packSize || pricePerBox === null) { pendingEntry = null; continue; }

        const rawTrial = trialItem ? parsePrice(trialItem.text) : null;

        pendingEntry = {
          vendor: VENDOR,
          priceList: PRICE_LIST,
          product: productItem.text,
          packSize,
          pricePerBox,
          priceTrial: rawTrial, // 0 = free trial, null = no trial listed
        };
      } else {
        // Stray row (only a price/trial value, no product) — attach to previous entry
        if (pendingEntry && pendingEntry.priceTrial === null) {
          const trialItem = row.items.find(i => Math.abs(i.x - COL_PRICETRIAL) <= T_TRIAL);
          if (trialItem) {
            pendingEntry.priceTrial = parsePrice(trialItem.text);
          }
        }
      }
    }

    // End of page — flush pending
    if (pendingEntry) {
      entries.push(pendingEntry);
      pendingEntry = null;
    }
  }

  return entries;
}

module.exports = { parseCooperVision };
