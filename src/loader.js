// loader.js
// Reads the two Excel exports.
//
// loadLineItems()  -- reads Detaljer (details file): one row per product line.
//                     This is the primary input for price checking.
//
// loadOrderTotals() -- reads Avstamning (reconciliation file): one row per order.
//                      Used only for the sanity check: does the sum of line items
//                      match what was billed at the order level?
//
// Vendor is NOT derived here. It gets attached later by the router (src/router.js),
// which matches product names against routing rules.

const ExcelJS = require('exceljs');

// Returns an array of line item objects from Detaljer.xlsx.
// One object per row (excluding header).
async function loadLineItems(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const sheet = wb.worksheets[0];

  const items = [];

  sheet.eachRow((row, rowIndex) => {
    if (rowIndex === 1) return; // skip header

    const product    = row.getCell(2).value;  // Produkt/Vara
    const addon      = row.getCell(3).value;  // Tillägg
    const reference  = row.getCell(4).value;  // Referens
    const brutto     = row.getCell(5).value;  // Brutto
    const quantity   = row.getCell(6).value;  // Antal
    const discount   = row.getCell(7).value;  // Rabatt (SEK)
    const discountPct = row.getCell(8).value; // Rabatt%
    const netto      = row.getCell(9).value;  // Netto (actual price charged)

    items.push({
      product,
      addon:        addon || null,
      reference,
      brutto,
      quantity,
      discount,
      discountPct,
      netto,
      isReturn:     typeof netto === 'number' && netto < 0,
      vendor:       null,  // filled in by router.js
    });
  });

  return items;
}

// Returns an array of order-level totals from Avstamning.xlsx.
// Used for the sanity check only — not for price matching.
async function loadOrderTotals(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const sheet = wb.worksheets[0];

  const orders = [];

  sheet.eachRow((row, rowIndex) => {
    if (rowIndex === 1) return; // skip header

    const vendor   = row.getCell(2).value;  // Leverantör
    const brutto   = row.getCell(6).value;  // Brutto
    const discount = row.getCell(7).value;  // Rabatt
    const netto    = row.getCell(8).value;  // Netto

    orders.push({ vendor, brutto, discount, netto });
  });

  return orders;
}

module.exports = { loadLineItems, loadOrderTotals };
