// tests/czv.test.js
// Unit tests for the Carl Zeiss Vision matcher.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { matchCZV } = require('../src/matcher/czv');

// Helper: build a minimal price list entry
function entry(productFamily, index, glastyp, dvColumn, price) {
  return { productFamily, index, glastyp, dvColumn, price };
}

// Helper: build a minimal line item
function item(product, netto, { addon = '', quantity = 1, isReturn = false } = {}) {
  return { product, netto, addon, quantity, isReturn };
}

// --- Real invoice example ---
describe('real invoice example', () => {
  test('PRG SML P Indi3 1.6 DV PLATINUM 1652kr → CORRECT', () => {
    const entries = [
      entry('ZEISS Progressive SmartLife Individual 3', 1.6, 'Klara UVProtect', 'DVP', 1652),
    ];
    const result = matchCZV(
      item('Zeiss PRG SML P Indi3 1.6', 1652, { addon: 'DV PLATINUM' }),
      entries
    );
    assert.equal(result.status, 'CORRECT');
    assert.equal(result.expectedPrice, 1652);
    assert.equal(result.delta, 0);
  });
});

// --- Family extraction ---
describe('family extraction', () => {
  test('PRG SML Indi3 (no P) maps to SmartLife Individual 3', () => {
    const entries = [
      entry('ZEISS Progressive SmartLife Individual 3', 1.6, 'Klara UVProtect', 'DVP', 800),
    ];
    const result = matchCZV(
      item('PRG SML Indi3 1.6', 800, { addon: 'DV PLATINUM' }),
      entries
    );
    assert.equal(result.status, 'CORRECT');
  });

  test('PRG SML P Plus maps to SmartLife Plus', () => {
    const entries = [
      entry('ZEISS Progressive SmartLife Plus', 1.5, 'Klara UVProtect', 'DVG', 600),
    ];
    const result = matchCZV(
      item('PRG SML P Plus 1.5', 600, { addon: 'DV GOLD' }),
      entries
    );
    assert.equal(result.status, 'CORRECT');
  });

  test('unknown product name returns NOT_FOUND', () => {
    const result = matchCZV(item('UNKNOWN LENS 1.6', 500, { addon: 'DV PLATINUM' }), []);
    assert.equal(result.status, 'NOT_FOUND');
  });
});

// --- Glastyp extraction ---
describe('glastyp extraction', () => {
  test('PFX suffix → PhotoFusion X', () => {
    const entries = [
      entry('ZEISS Progressive SmartLife Individual 3', 1.6, 'PhotoFusion X', 'DVP', 1800),
    ];
    const result = matchCZV(
      item('PRG SML Indi3 1.6 PFX', 1800, { addon: 'DV PLATINUM' }),
      entries
    );
    assert.equal(result.status, 'CORRECT');
  });

  test('BL suffix → Klara BlueGuard', () => {
    const entries = [
      entry('ZEISS Progressive SmartLife Individual 3', 1.6, 'Klara BlueGuard', 'DVP', 1700),
    ];
    const result = matchCZV(
      item('PRG SML Indi3 1.6BL', 1700, { addon: 'DV PLATINUM' }),
      entries
    );
    assert.equal(result.status, 'CORRECT');
  });
});

// --- DV column extraction ---
describe('DV column extraction', () => {
  test('DV PLATINUM → DVP', () => {
    const entries = [entry('ZEISS Progressive SmartLife Plus', 1.5, 'Klara UVProtect', 'DVP', 700)];
    const result = matchCZV(item('PRG SML Plus 1.5', 700, { addon: 'DV PLATINUM' }), entries);
    assert.equal(result.status, 'CORRECT');
  });

  test('DV GOLD → DVG', () => {
    const entries = [entry('ZEISS Progressive SmartLife Plus', 1.5, 'Klara UVProtect', 'DVG', 650)];
    const result = matchCZV(item('PRG SML Plus 1.5', 650, { addon: 'DV GOLD' }), entries);
    assert.equal(result.status, 'CORRECT');
  });

  test('DV BLUEPROTECT → DVBP', () => {
    const entries = [entry('ZEISS Progressive SmartLife Plus', 1.5, 'Klara UVProtect', 'DVBP', 680)];
    const result = matchCZV(item('PRG SML Plus 1.5', 680, { addon: 'DV BLUEPROTECT' }), entries);
    assert.equal(result.status, 'CORRECT');
  });

  test('no DV column in addon → NOT_FOUND', () => {
    const result = matchCZV(item('PRG SML Plus 1.5', 700, { addon: '' }), []);
    assert.equal(result.status, 'NOT_FOUND');
  });

  test('no index in product name → NOT_FOUND', () => {
    const result = matchCZV(item('PRG SML Plus', 700, { addon: 'DV PLATINUM' }), []);
    assert.equal(result.status, 'NOT_FOUND');
  });
});

// --- Match outcomes ---
describe('match outcomes', () => {
  const baseEntries = [
    entry('ZEISS Progressive SmartLife Individual 3', 1.6, 'Klara UVProtect', 'DVP', 1652),
  ];

  test('DISCREPANCY when price differs by more than 1 SEK', () => {
    const result = matchCZV(
      item('PRG SML Indi3 1.6', 1700, { addon: 'DV PLATINUM' }),
      baseEntries
    );
    assert.equal(result.status, 'DISCREPANCY');
    assert.equal(result.delta, 48);
  });

  test('CORRECT when price differs by exactly 1 SEK (rounding tolerance)', () => {
    const result = matchCZV(
      item('PRG SML Indi3 1.6', 1653, { addon: 'DV PLATINUM' }),
      baseEntries
    );
    assert.equal(result.status, 'CORRECT');
  });

  test('WAIVED when netto is 0', () => {
    const result = matchCZV(
      item('PRG SML Indi3 1.6', 0, { addon: 'DV PLATINUM' }),
      baseEntries
    );
    assert.equal(result.status, 'WAIVED');
  });

  test('SKIP for return items', () => {
    const result = matchCZV(
      item('PRG SML Indi3 1.6', -1652, { addon: 'DV PLATINUM', isReturn: true }),
      baseEntries
    );
    assert.equal(result.status, 'SKIP');
  });

  test('NOT_FOUND when no matching entry in price list', () => {
    const result = matchCZV(
      item('PRG SML Indi3 1.6', 1652, { addon: 'DV PLATINUM' }),
      [] // empty price list
    );
    assert.equal(result.status, 'NOT_FOUND');
  });

  test('quantity multiplier applied correctly', () => {
    const result = matchCZV(
      item('PRG SML Indi3 1.6', 3304, { addon: 'DV PLATINUM', quantity: 2 }),
      baseEntries
    );
    assert.equal(result.status, 'CORRECT');
    assert.equal(result.expectedTotal, 3304);
  });
});
