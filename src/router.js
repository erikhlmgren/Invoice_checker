// router.js
// Attaches vendor and priceList to each line item by matching the product name
// against routing-rules.json. Rules are checked in order; first match wins.
//
// After routing, each item will have:
//   vendor    -- e.g. "Carl Zeiss Vision", "CooperVision", "SHIPPING", or null
//   priceList -- filename in data/price-lists/, or null (shipping/unknown)
//   status    -- "routed" | "shipping" | "unknown"

const path = require('path');
const rules = require('../config/routing-rules.json').rules;

function routeLineItems(items) {
  return items.map(item => {
    const match = findMatch(item.product);

    if (!match) {
      return { ...item, vendor: null, priceList: null, status: 'unknown' };
    }

    if (match.vendor === 'SHIPPING') {
      return { ...item, vendor: 'SHIPPING', priceList: null, status: 'shipping' };
    }

    return {
      ...item,
      vendor: match.vendor,
      priceList: match.priceList,
      status: 'routed',
    };
  });
}

// Returns the first rule whose pattern appears in the product name (case-insensitive).
// Returns null if no rule matches.
function findMatch(productName) {
  if (!productName) return null;
  const name = productName.toString().toLowerCase();
  for (const rule of rules) {
    if (name.includes(rule.pattern.toLowerCase())) {
      return rule;
    }
  }
  return null;
}

module.exports = { routeLineItems };
