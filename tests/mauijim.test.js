// tests/mauijim.test.js
// Unit tests for the Maui Jim matcher.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { matchMauiJim } = require('../src/matcher/mauijim');

function entry(styleName, styleNumber, wholesale) {
  return { styleName, styleNumber, wholesale };
}

function item(product, netto, { quantity = 1, isReturn = false } = {}) {
  return { product, netto, quantity, isReturn };
}

const baseEntries = [
  entry('Akau', 442, 840),
  entry('2nd Reef', 607, 1430),
  entry("'Olu'Olu", 537, 1158),
];

// --- Style name matching ---
describe('style name matching', () => {
  test('exact style name match (case-insensitive)', () => {
    const result = matchMauiJim(item('MAUI JIM Akau', 840), baseEntries);
    assert.equal(result.status, 'CORRECT');
    assert.equal(result.expectedPrice, 840);
  });

  test('style name substring in invoice product', () => {
    const result = matchMauiJim(item('Maui Jim 2nd Reef 607', 1430), baseEntries);
    assert.equal(result.status, 'CORRECT');
  });
});

// --- Style number fallback ---
describe('style number matching', () => {
  test('invoice contains style number → matches by number', () => {
    const result = matchMauiJim(item('MAUI 442', 840), baseEntries);
    assert.equal(result.status, 'CORRECT');
    assert.equal(result.styleNumber, 442);
  });

  test('style number 607 matches 2nd Reef', () => {
    const result = matchMauiJim(item('MJ 607', 1430), baseEntries);
    assert.equal(result.status, 'CORRECT');
  });
});

// --- NOT_FOUND ---
describe('not found', () => {
  test('unknown style → NOT_FOUND', () => {
    const result = matchMauiJim(item('MAUI JIM Unknown Style', 999), baseEntries);
    assert.equal(result.status, 'NOT_FOUND');
  });
});

// --- Match outcomes ---
describe('match outcomes', () => {
  test('DISCREPANCY when price differs by more than 1 SEK', () => {
    const result = matchMauiJim(item('MAUI JIM Akau', 900), baseEntries);
    assert.equal(result.status, 'DISCREPANCY');
    assert.equal(result.delta, 60);
  });

  test('CORRECT within 1 SEK rounding tolerance', () => {
    const result = matchMauiJim(item('MAUI JIM Akau', 841), baseEntries);
    assert.equal(result.status, 'CORRECT');
  });

  test('WAIVED when netto is 0', () => {
    const result = matchMauiJim(item('MAUI JIM Akau', 0), baseEntries);
    assert.equal(result.status, 'WAIVED');
  });

  test('SKIP for return items', () => {
    const result = matchMauiJim(
      { product: 'MAUI JIM Akau', netto: -840, quantity: 1, isReturn: true },
      baseEntries
    );
    assert.equal(result.status, 'SKIP');
  });

  test('quantity multiplier applied', () => {
    const result = matchMauiJim(item('MAUI JIM Akau', 1680, { quantity: 2 }), baseEntries);
    assert.equal(result.status, 'CORRECT');
    assert.equal(result.expectedTotal, 1680);
  });
});
