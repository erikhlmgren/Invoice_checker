// tests/coopervision.test.js
// Unit tests for the CooperVision matcher.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { matchCooperVision } = require('../src/matcher/coopervision');

function entry(product, packSize, pricePerBox, priceTrial = null) {
  return { product, packSize, pricePerBox, priceTrial };
}

function item(product, netto, { quantity = null, isReturn = false } = {}) {
  // Default quantity = pack size extracted from product name (1 box)
  const match = product.match(/\((\d+)\)/);
  const packSize = match ? parseInt(match[1], 10) : 1;
  return { product, netto, quantity: quantity ?? packSize, isReturn };
}

// --- Real invoice example ---
describe('real invoice example', () => {
  test('Biofinity (6) 246kr → CORRECT', () => {
    const entries = [entry('Biofinity', 6, 246)];
    const result = matchCooperVision(item('Biofinity (6)', 246), entries);
    assert.equal(result.status, 'CORRECT');
    assert.equal(result.expectedPrice, 246);
    assert.equal(result.delta, 0);
  });
});

// --- Pack size extraction ---
describe('pack size extraction', () => {
  test('product without pack size → NOT_FOUND', () => {
    const result = matchCooperVision(item('Biofinity', 246), []);
    assert.equal(result.status, 'NOT_FOUND');
  });

  test('Biofinity toric (6) matches pack size 6', () => {
    const entries = [entry('Biofinity toric', 6, 320)];
    const result = matchCooperVision(item('Biofinity toric (6)', 320), entries);
    assert.equal(result.status, 'CORRECT');
  });

  test('MyDay (30) does not match MyDay (90) entry', () => {
    const entries = [entry('MyDay', 90, 500)];
    const result = matchCooperVision(item('MyDay (30)', 200), entries);
    assert.equal(result.status, 'NOT_FOUND');
  });
});

// --- Product name normalization ---
describe('product name normalization', () => {
  test('case-insensitive match (BIOFINITY → Biofinity)', () => {
    const entries = [entry('Biofinity', 6, 246)];
    const result = matchCooperVision(item('BIOFINITY (6)', 246), entries);
    assert.equal(result.status, 'CORRECT');
  });

  test('trailing SPHERE stripped before matching', () => {
    const entries = [entry('clariti 1 day', 30, 180)];
    const result = matchCooperVision(item('clariti 1 day SPHERE (30)', 180), entries);
    assert.equal(result.status, 'CORRECT');
  });
});

// --- Trial (diag) lenses ---
describe('trial / diag lenses', () => {
  test('diag product uses priceTrial column', () => {
    const entries = [entry('Biofinity', 6, 246, 0)]; // priceTrial = 0 (free)
    const result = matchCooperVision(
      { product: 'Biofinity diag (6)', netto: 0, quantity: 6, isReturn: false },
      entries
    );
    assert.equal(result.status, 'WAIVED');
  });

  test('diag with priceTrial = null → NOT_FOUND', () => {
    const entries = [entry('Biofinity', 6, 246, null)];
    const result = matchCooperVision(
      { product: 'Biofinity diag (6)', netto: 0, quantity: 6, isReturn: false },
      entries
    );
    assert.equal(result.status, 'NOT_FOUND');
  });
});

// --- Multi-box orders ---
describe('multi-box orders', () => {
  test('qty 12 with pack size 6 = 2 boxes', () => {
    const entries = [entry('Biofinity', 6, 246)];
    const result = matchCooperVision(
      { product: 'Biofinity (6)', netto: 492, quantity: 12, isReturn: false },
      entries
    );
    assert.equal(result.status, 'CORRECT');
    assert.equal(result.expectedTotal, 492);
  });
});

// --- Match outcomes ---
describe('match outcomes', () => {
  const baseEntries = [entry('Biofinity', 6, 246)];

  test('DISCREPANCY when price differs by more than 1 SEK', () => {
    const result = matchCooperVision(item('Biofinity (6)', 300), baseEntries);
    assert.equal(result.status, 'DISCREPANCY');
    assert.equal(result.delta, 54);
  });

  test('CORRECT within 1 SEK rounding tolerance', () => {
    const result = matchCooperVision(item('Biofinity (6)', 247), baseEntries);
    assert.equal(result.status, 'CORRECT');
  });

  test('WAIVED when netto is 0', () => {
    const result = matchCooperVision(item('Biofinity (6)', 0), baseEntries);
    assert.equal(result.status, 'WAIVED');
  });

  test('SKIP for return items', () => {
    const result = matchCooperVision(
      { product: 'Biofinity (6)', netto: -246, quantity: 6, isReturn: true },
      baseEntries
    );
    assert.equal(result.status, 'SKIP');
  });

  test('NOT_FOUND when product not in price list', () => {
    const result = matchCooperVision(item('Biofinity (6)', 246), []);
    assert.equal(result.status, 'NOT_FOUND');
  });
});
