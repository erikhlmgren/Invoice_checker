// matcher/contacts.js
// Generic contact lens matcher — shared by Alcon, J&J, Clearlii, Bausch+Lomb.
//
// Matching logic:
//   1. Extract pack size from invoice product name — parentheses "(N)" first,
//      then embedded pack suffix ("30p", "6pk", "30 pk", "30-pack", etc.)
//   2. Normalize both invoice and price-list product names (strip pack size,
//      trademarks, lowercase) — accept if either name contains the other
//   3. Expected total = pricePerBox × (|qty| / packSize)
//
// Returns: { status, expectedPrice, expectedTotal, actualTotal, delta, product, packSize }
// Status: CORRECT | DISCREPANCY | NOT_FOUND | WAIVED | SKIP

function extractPackSizeFromParens(name) {
  const m = name.match(/\((\d+)\)\s*$/);
  return m ? parseInt(m[1], 10) : null;
}

function extractPackSizeFromName(name) {
  // Matches: "30-pack", "30pack", "30p", "30pk", "30 pk", "90-pack" etc.
  // The (?!\w) prevents matching e.g. "30-days"
  const m = name.match(/(\d+)\s*-?\s*p(?:ack|k)?(?!\w)/i);
  return m ? parseInt(m[1], 10) : null;
}

function stripPackSize(name) {
  return name
    .replace(/\s*\(\d+\)\s*$/, '')                          // trailing "(N)"
    .replace(/\s+\d+\s*-?\s*p(?:ack|k)?(?!\w)[\w™®]*/i, '') // embedded "30-pack", "6pk", etc.
    .replace(/[®™]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function matchContacts(item, entries) {
  if (item.isReturn) return { status: 'SKIP', note: 'return' };

  const netto = Math.abs(item.netto || 0);
  if (netto === 0) return { status: 'WAIVED' };
  const actualTotal = netto;

  const product = item.product || '';
  const invoicePackSize =
    extractPackSizeFromParens(product) ||
    extractPackSizeFromName(product);

  if (!invoicePackSize) {
    return { status: 'NOT_FOUND', note: `no pack size in: ${product}` };
  }

  const normalizedInvoice = stripPackSize(product);

  const entry = entries.find(e => {
    if (e.packSize !== invoicePackSize) return false;
    const normalizedEntry = stripPackSize(e.product);
    return (
      normalizedEntry === normalizedInvoice ||
      normalizedInvoice.includes(normalizedEntry) ||
      normalizedEntry.includes(normalizedInvoice)
    );
  });

  if (!entry) {
    return {
      status: 'NOT_FOUND',
      note: `no price: ${normalizedInvoice} | pack ${invoicePackSize}`,
    };
  }

  const qty          = Math.abs(item.quantity || 1);
  const boxes        = qty / invoicePackSize;
  const expectedTotal = entry.pricePerBox * boxes;
  const delta        = actualTotal - expectedTotal;
  const status       = delta <= 2 ? 'CORRECT' : 'DISCREPANCY';

  return {
    status,
    expectedPrice: entry.pricePerBox,
    expectedTotal,
    actualTotal,
    delta: Math.round(delta * 100) / 100,
    product: entry.product,
    packSize: invoicePackSize,
  };
}

module.exports = { matchContacts, extractPackSizeFromParens, extractPackSizeFromName, stripPackSize };
