// addons.js
// Utilities for add-on price lookup and no-price-list classification.
//
// Both configs are AI-updatable: when the AI layer identifies a pattern
// from invoice data, it proposes an update here. Human approves, config saved.
// Next run picks it up automatically — no code changes needed.

const fs = require('fs');
const path = require('path');

const ADDON_CONFIG_PATH     = path.join(__dirname, '../config/addon-prices.json');
const NO_PRICE_LIST_PATH    = path.join(__dirname, '../config/no-price-list.json');

// Cache configs in memory — only read once per process
let _addonConfig = null;
let _noPriceListConfig = null;

function loadAddonConfig() {
  if (!_addonConfig) {
    _addonConfig = JSON.parse(fs.readFileSync(ADDON_CONFIG_PATH, 'utf8'));
  }
  return _addonConfig;
}

function loadNoPriceListConfig() {
  if (!_noPriceListConfig) {
    _noPriceListConfig = JSON.parse(fs.readFileSync(NO_PRICE_LIST_PATH, 'utf8'));
  }
  return _noPriceListConfig;
}

// Returns { status: 'NO_PRICE_LIST', reason } if the product matches a
// no-price-list category, otherwise null.
function checkNoPriceList(productName) {
  const config = loadNoPriceListConfig();
  for (const category of config.categories) {
    const regex = new RegExp(category.pattern, 'i');
    if (regex.test(productName)) {
      return { status: 'NO_PRICE_LIST', reason: category.reason };
    }
  }
  return null;
}

// Scans the addon field for known add-on patterns.
// Returns an array of matched add-ons: [{ name, pricePerLens, confirmed, note }]
// pricePerLens is null for unconfirmed add-ons.
function findAddons(addonField) {
  if (!addonField || addonField === '-') return [];
  const config = loadAddonConfig();
  const matched = [];
  for (const addon of config.addons) {
    const regex = new RegExp(addon.pattern, 'i');
    if (regex.test(addonField)) {
      matched.push({
        name:         addon.name,
        pricePerLens: addon.pricePerLens,
        confirmed:    addon.confirmed,
        note:         addon.note || null,
      });
    }
  }
  return matched;
}

// Given a base match result and the matched add-ons, returns an updated result.
// - If all add-ons have confirmed prices: folds them into expectedTotal and re-evaluates status
// - If any add-on has null price: notes them as unpriced, keeps status as DISCREPANCY with explanation
function applyAddons(baseResult, addons, qty) {
  if (!addons.length) return baseResult;

  const unpriced = addons.filter(a => a.pricePerLens === null);
  const priced   = addons.filter(a => a.pricePerLens !== null);

  // Add confirmed add-on costs to expected total
  const addonTotal = priced.reduce((sum, a) => sum + a.pricePerLens * qty, 0);
  const newExpected = (baseResult.expectedTotal || 0) + addonTotal;
  const newDelta    = Math.round(((baseResult.actualTotal || 0) - newExpected) * 100) / 100;
  // Negative delta = paid less than price list (discount) — not a problem. 2 SEK rounding tolerance.
  const newStatus   = newDelta <= 2 ? 'CORRECT' : 'DISCREPANCY';

  const addonNotes = [
    ...priced.map(a => `${a.name}: +${a.pricePerLens} SEK/lins`),
    ...unpriced.map(a => `${a.name}: pris okänt${a.note ? ' (' + a.note + ')' : ''}`),
  ];

  // If delta is within tolerance even with unpriced addons, the addon wasn't charged separately.
  const finalStatus = (unpriced.length > 0 && newDelta > 2) ? 'UNIDENTIFIED' : newStatus;

  return {
    ...baseResult,
    status:        finalStatus,
    expectedTotal: newExpected,
    delta:         newDelta,
    addonsCost:    addonTotal,
    addonsNote:    addonNotes.join(' | '),
    unpricedAddons: unpriced.map(a => a.name),
  };
}

module.exports = { checkNoPriceList, findAddons, applyAddons };
