// tests/synchrony.test.js
// Unit tests for the Synchrony matcher.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { matchSynchrony } = require('../src/matcher/synchrony');

function entry(productFamily, index, glastyp, dvColumn, price) {
  return { productFamily, index, glastyp, dvColumn, price };
}

function item(product, netto, { addon = '', quantity = 1, isReturn = false } = {}) {
  return { product, netto, addon, quantity, isReturn };
}

// --- Real invoice example ---
describe('real invoice example', () => {
  test('FSV SPH 1.6 HMC+ → NOT_FOUND (FSV stock product)', () => {
    const result = matchSynchrony(
      item('synchrony FSV SPH 1.6 HMC+', 47),
      []
    );
    assert.equal(result.status, 'NOT_FOUND');
    assert.match(result.note, /FSV/);
  });
});

// --- W&O fix verification ---
describe('W&O family name fix', () => {
  test('PRG W&O HD maps to synchrony Progressive Work & Office HD', () => {
    const entries = [
      entry('synchrony Progressive Work & Office HD', 1.5, 'Klara', 'HMC+', 850),
    ];
    const result = matchSynchrony(
      item('synchrony PRG W&O HD 1.5', 850, { addon: 'HMC+' }),
      entries
    );
    assert.equal(result.status, 'CORRECT');
  });
});

// --- Family extraction ---
describe('family extraction', () => {
  test('PRG Easy View → synchrony Progressive Easy View HD', () => {
    const entries = [
      entry('synchrony Progressive Easy View HD', 1.6, 'Klara', 'HMCX', 900),
    ];
    const result = matchSynchrony(
      item('synchrony PRG Easy View 1.6', 900, { addon: 'HMCX' }),
      entries
    );
    assert.equal(result.status, 'CORRECT');
  });

  test('PRG Easy Wear → synchrony Progressive Easy Wear HD', () => {
    const entries = [
      entry('synchrony Progressive Easy Wear HD', 1.5, 'Klara', 'HC', 750),
    ];
    const result = matchSynchrony(
      item('synchrony PRG Easy Wear 1.5', 750, { addon: 'HC' }),
      entries
    );
    assert.equal(result.status, 'CORRECT');
  });

  test('SV SPH → synchrony Single Vision SPH', () => {
    const entries = [
      entry('synchrony Single Vision SPH', 1.5, 'Klara', 'HMCX', 300),
    ];
    const result = matchSynchrony(
      item('synchrony SV SPH 1.5', 300, { addon: 'HMCX' }),
      entries
    );
    assert.equal(result.status, 'CORRECT');
  });

  test('unknown product name → NOT_FOUND', () => {
    const result = matchSynchrony(item('synchrony UNKNOWN 1.5', 500, { addon: 'HMCX' }), []);
    assert.equal(result.status, 'NOT_FOUND');
  });
});

// --- Glastyp extraction ---
describe('glastyp extraction', () => {
  test('PH suffix → Photo/Pol', () => {
    const entries = [
      entry('synchrony Progressive Easy View HD', 1.6, 'Photo/Pol', 'HMCX', 1100),
    ];
    const result = matchSynchrony(
      item('synchrony PRG Easy View 1.6 PH', 1100, { addon: 'HMCX' }),
      entries
    );
    assert.equal(result.status, 'CORRECT');
  });

  test('no suffix → Klara (default)', () => {
    const entries = [
      entry('synchrony Progressive Easy View HD', 1.6, 'Klara', 'HMCX', 900),
    ];
    const result = matchSynchrony(
      item('synchrony PRG Easy View 1.6', 900, { addon: 'HMCX' }),
      entries
    );
    assert.equal(result.status, 'CORRECT');
  });
});

// --- Coating extraction ---
describe('coating extraction', () => {
  test('HMCX in addon → HMCX column', () => {
    const entries = [entry('synchrony Single Vision SPH', 1.5, 'Klara', 'HMCX', 300)];
    const result = matchSynchrony(item('synchrony SV SPH 1.5', 300, { addon: 'HMCX' }), entries);
    assert.equal(result.status, 'CORRECT');
  });

  test('HMC+ in addon → HMC+ column', () => {
    const entries = [entry('synchrony Single Vision SPH', 1.5, 'Klara', 'HMC+', 270)];
    const result = matchSynchrony(item('synchrony SV SPH 1.5', 270, { addon: 'HMC+' }), entries);
    assert.equal(result.status, 'CORRECT');
  });

  test('no coating in addon → NOT_FOUND', () => {
    const result = matchSynchrony(item('synchrony SV SPH 1.5', 300, { addon: '' }), []);
    assert.equal(result.status, 'NOT_FOUND');
  });

  test('no index in product name → NOT_FOUND', () => {
    const result = matchSynchrony(item('synchrony SV SPH', 300, { addon: 'HMCX' }), []);
    assert.equal(result.status, 'NOT_FOUND');
  });
});

// --- Match outcomes ---
describe('match outcomes', () => {
  const baseEntries = [
    entry('synchrony Progressive Easy View HD', 1.6, 'Klara', 'HMCX', 900),
  ];

  test('DISCREPANCY when price differs by more than 1 SEK', () => {
    const result = matchSynchrony(
      item('synchrony PRG Easy View 1.6', 950, { addon: 'HMCX' }),
      baseEntries
    );
    assert.equal(result.status, 'DISCREPANCY');
    assert.equal(result.delta, 50);
  });

  test('CORRECT within 1 SEK rounding tolerance', () => {
    const result = matchSynchrony(
      item('synchrony PRG Easy View 1.6', 901, { addon: 'HMCX' }),
      baseEntries
    );
    assert.equal(result.status, 'CORRECT');
  });

  test('WAIVED when netto is 0', () => {
    const result = matchSynchrony(
      item('synchrony PRG Easy View 1.6', 0, { addon: 'HMCX' }),
      baseEntries
    );
    assert.equal(result.status, 'WAIVED');
  });

  test('SKIP for return items', () => {
    const result = matchSynchrony(
      item('synchrony PRG Easy View 1.6', -900, { addon: 'HMCX', isReturn: true }),
      baseEntries
    );
    assert.equal(result.status, 'SKIP');
  });

  test('quantity multiplier applied correctly', () => {
    const result = matchSynchrony(
      item('synchrony PRG Easy View 1.6', 1800, { addon: 'HMCX', quantity: 2 }),
      baseEntries
    );
    assert.equal(result.status, 'CORRECT');
    assert.equal(result.expectedTotal, 1800);
  });
});
