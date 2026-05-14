// matcher/mauijim.js
// Matches a Maui Jim sunglasses line item against the parsed price list.
//
// Maui Jim products are priced per pair. The invoice product name typically
// contains the style name or style number. Matching tries:
//   1. Style name: case-insensitive substring match (invoice name contains style name)
//   2. Style number: exact match if a number appears in the invoice product name
//
// Expected total = wholesale × |quantity|

function normalizeStyleName(name) {
  return name
    .replace(/[®™]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractStyleNumber(productName) {
  const m = productName.match(/\b(\d{3,4})\b/);
  return m ? parseInt(m[1], 10) : null;
}

function matchMauiJim(item, entries) {
  if (item.isReturn) return { status: 'SKIP', note: 'return' };

  const netto = Math.abs(item.netto || 0);
  if (netto === 0) return { status: 'WAIVED' };
  const actualTotal = netto;

  const product          = item.product || '';
  const normalizedInvoice = normalizeStyleName(product);
  const invoiceStyleNum   = extractStyleNumber(product);

  // Try style name match first (invoice name contains the price list style name)
  let entry = entries.find(e =>
    normalizedInvoice.includes(normalizeStyleName(e.styleName))
  );

  // Fall back to style number match
  if (!entry && invoiceStyleNum) {
    entry = entries.find(e => e.styleNumber === invoiceStyleNum);
  }

  if (!entry) {
    return { status: 'NOT_FOUND', note: `no price for: ${product}` };
  }

  const qty           = Math.abs(item.quantity || 1);
  const expectedTotal  = entry.wholesale * qty;
  const delta          = actualTotal - expectedTotal;
  const status         = delta <= 2 ? 'CORRECT' : 'DISCREPANCY';

  return {
    status,
    expectedPrice: entry.wholesale,
    expectedTotal,
    actualTotal,
    delta: Math.round(delta * 100) / 100,
    styleName:   entry.styleName,
    styleNumber: entry.styleNumber,
  };
}

module.exports = { matchMauiJim };
