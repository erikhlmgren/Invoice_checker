// matcher/coopervision.js
// Matches a CooperVision purchase line item against the parsed price list.
//
// Contact lens pricing rules:
//   - Pack size is encoded in the product name: "BIOFINITY TORIC (6)" → packSize = 6
//   - Quantity in purchase data = individual lenses (e.g. qty:12 for BIOFINITY TORIC (6) = 2 boxes)
//   - Expected total = pricePerBox × (|qty| / packSize)
//
// Trial/diagnostic lenses:
//   - "diag (N)" in product name → use priceTrial column, pack size = N
//   - Expected total = priceTrial × (|qty| / packSize)
//   - netto = 0 → WAIVED (free trial)
//
// Product name normalization (purchase data → price list):
//   - Strip trailing " diag" and pack size "(N)"
//   - Strip trailing " SPHERE" (plain sphere variant — price list omits this word)
//   - Case-insensitive lookup against price list product names

function extractPackSize(productName) {
  const match = productName.match(/\((\d+)\)\s*$/);
  return match ? parseInt(match[1], 10) : null;
}

function isDiag(productName) {
  return /\bdiag\b/i.test(productName);
}

function normalizeName(productName) {
  return productName
    .replace(/\s*\(\d+\)\s*$/, '')     // strip pack size "(N)" first — it's at the end
    .replace(/\s+diag\s*$/i, '')       // then strip trailing " diag"
    .replace(/\s+SPHERE\s*$/i, '')     // strip trailing " SPHERE"
    .trim()
    .toLowerCase();
}

function matchCooperVision(item, entries) {
  if (item.isReturn) return { status: 'SKIP', note: 'return' };

  const product = item.product || '';
  const packSize = extractPackSize(product);
  if (!packSize) return { status: 'NOT_FOUND', note: `no pack size in: ${product}` };

  const diag = isDiag(product);
  const normalizedName = normalizeName(product);

  let entry;
  if (diag) {
    // For diag, match product name only — any pack size (we just need priceTrial)
    entry = entries.find(e => e.product.toLowerCase() === normalizedName);
  } else {
    // For regular orders, match product name + pack size
    entry = entries.find(e =>
      e.product.toLowerCase() === normalizedName &&
      e.packSize === packSize
    );
  }

  if (!entry) {
    return {
      status: 'NOT_FOUND',
      note: `no price for: ${normalizedName}${diag ? ' [diag]' : ` | pack ${packSize}`}`,
    };
  }

  const qty = Math.abs(item.quantity || 1);
  const boxes = qty / packSize;
  const netto = Math.abs(item.netto || 0);
  const actualTotal = netto;

  if (diag) {
    const unitPrice = entry.priceTrial;
    // priceTrial = null means no trial price listed for this product
    if (unitPrice === null) {
      return { status: 'NOT_FOUND', note: `no trial price for: ${normalizedName}` };
    }
    // priceTrial = 0 means free trial
    if (netto === 0) return { status: 'WAIVED', product: entry.product, packSize };
    const expectedTotal = unitPrice * boxes;
    const delta = actualTotal - expectedTotal;
    const status = delta <= 2 ? 'CORRECT' : 'DISCREPANCY';
    return {
      status,
      expectedPrice: unitPrice,
      expectedTotal,
      actualTotal,
      delta: Math.round(delta * 100) / 100,
      product: entry.product,
      packSize,
      note: 'diag',
    };
  }

  // Regular box purchase
  if (netto === 0) return { status: 'WAIVED', product: entry.product, packSize };

  const expectedTotal = entry.pricePerBox * boxes;
  const delta = actualTotal - expectedTotal;
  const status = Math.abs(delta) <= 1 ? 'CORRECT' : 'DISCREPANCY';

  return {
    status,
    expectedPrice: entry.pricePerBox,
    expectedTotal,
    actualTotal,
    delta: Math.round(delta * 100) / 100,
    product: entry.product,
    packSize,
  };
}

module.exports = { matchCooperVision };
