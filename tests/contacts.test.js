// tests/contacts.test.js
// Unit tests for the generic contact lens matcher (Alcon, J&J, Clearlii, Bausch+Lomb).

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { matchContacts } = require('../src/matcher/contacts');

function entry(product, packSize, pricePerBox) {
  return { product, packSize, pricePerBox };
}

function item(product, netto, { quantity = null, isReturn = false } = {}) {
  const m = product.match(/\((\d+)\)/);
  const packSize = m ? parseInt(m[1], 10) : 1;
  return { product, netto, quantity: quantity ?? packSize, isReturn };
}

// --- Pack size extraction ---
describe('pack size extraction', () => {
  test('parentheses format: DAILIES TOTAL 1 (30)', () => {
    const entries = [entry('DAILIES TOTAL 1', 30, 220.31)];
    const result = matchContacts(item('DAILIES TOTAL 1 (30)', 220.31), entries);
    assert.equal(result.status, 'CORRECT');
    assert.equal(result.delta, 0);
  });

  test('embedded "-pack" format: DAILIES TOTAL 1 30-pack', () => {
    const entries = [entry('DAILIES TOTAL 1', 30, 220.31)];
    const result = matchContacts(
      { product: 'DAILIES TOTAL 1 30-pack', netto: 220.31, quantity: 30, isReturn: false },
      entries
    );
    assert.equal(result.status, 'CORRECT');
  });

  test('embedded "30p" format (Bausch)', () => {
    const entries = [entry('Bausch+Lomb UltraONEDAY SVS', 30, 182)];
    const result = matchContacts(
      { product: 'Bausch+Lomb UltraONEDAY SVS 30p', netto: 182, quantity: 30, isReturn: false },
      entries
    );
    assert.equal(result.status, 'CORRECT');
  });

  test('embedded "6pk" format (Bausch monthly)', () => {
    const entries = [entry('Ultra SVS 6pk', 6, 216)];
    const result = matchContacts(
      { product: 'Ultra SVS 6pk', netto: 216, quantity: 6, isReturn: false },
      entries
    );
    assert.equal(result.status, 'CORRECT');
  });

  test('no pack size → NOT_FOUND', () => {
    const result = matchContacts(
      { product: 'DAILIES TOTAL 1', netto: 220.31, quantity: 30, isReturn: false },
      []
    );
    assert.equal(result.status, 'NOT_FOUND');
  });

  test('wrong pack size → NOT_FOUND', () => {
    const entries = [entry('DAILIES TOTAL 1', 30, 220.31)];
    const result = matchContacts(item('DAILIES TOTAL 1 (90)', 640.09, { quantity: 90 }), entries);
    assert.equal(result.status, 'NOT_FOUND');
  });
});

// --- Name normalization ---
describe('name normalization', () => {
  test('brand prefix in invoice not in price list (contains match)', () => {
    // Invoice: "ACUVUE OASYS 1-Day (30)", price list: "ACUVUE OASYS 1-Day"
    const entries = [entry('ACUVUE OASYS 1-Day', 30, 187.60)];
    const result = matchContacts(item('ACUVUE OASYS 1-Day (30)', 187.60, { quantity: 30 }), entries);
    assert.equal(result.status, 'CORRECT');
  });

  test('price list has brand prefix, invoice does not', () => {
    // Invoice: "Ultra SVS (6)", price list: "Ultra SVS 6pk"
    const entries = [entry('Bausch+Lomb Ultra SVS 6pk', 6, 216)];
    const result = matchContacts(
      { product: 'Ultra SVS (6)', netto: 216, quantity: 6, isReturn: false },
      entries
    );
    assert.equal(result.status, 'CORRECT');
  });

  test('trademark symbols stripped from both names', () => {
    // Price list: "Biotrue One Day SVS 30pk" — invoice may show "Biotrue® One Day SVS (30)"
    const entries = [entry('Biotrue One Day SVS 30pk', 30, 127)];
    const result = matchContacts(
      { product: 'Biotrue® One Day SVS (30)', netto: 127, quantity: 30, isReturn: false },
      entries
    );
    assert.equal(result.status, 'CORRECT');
  });
});

// --- Multi-box orders ---
describe('multi-box orders', () => {
  test('qty 90 with pack size 30 = 3 boxes', () => {
    const entries = [entry('DAILIES TOTAL 1', 30, 220.31)];
    const result = matchContacts(
      { product: 'DAILIES TOTAL 1 (30)', netto: 660.93, quantity: 90, isReturn: false },
      entries
    );
    assert.equal(result.status, 'CORRECT');
    assert.ok(Math.abs(result.expectedTotal - 660.93) <= 1);
  });
});

// --- Match outcomes ---
describe('match outcomes', () => {
  const baseEntries = [entry('ACUVUE OASYS 1-Day', 30, 187.60)];

  test('CORRECT within 1 SEK rounding tolerance', () => {
    const result = matchContacts(item('ACUVUE OASYS 1-Day (30)', 188), baseEntries);
    assert.equal(result.status, 'CORRECT');
  });

  test('DISCREPANCY when price differs by more than 1 SEK', () => {
    const result = matchContacts(item('ACUVUE OASYS 1-Day (30)', 200), baseEntries);
    assert.equal(result.status, 'DISCREPANCY');
    assert.ok(result.delta > 0);
  });

  test('WAIVED when netto is 0', () => {
    const result = matchContacts(
      { product: 'ACUVUE OASYS 1-Day (30)', netto: 0, quantity: 30, isReturn: false },
      baseEntries
    );
    assert.equal(result.status, 'WAIVED');
  });

  test('SKIP for return items', () => {
    const result = matchContacts(
      { product: 'ACUVUE OASYS 1-Day (30)', netto: -187.60, quantity: 30, isReturn: true },
      baseEntries
    );
    assert.equal(result.status, 'SKIP');
  });

  test('NOT_FOUND when product not in price list', () => {
    const result = matchContacts(item('ACUVUE OASYS 1-Day (30)', 187.60), []);
    assert.equal(result.status, 'NOT_FOUND');
  });
});

// --- Real-world examples ---
describe('real-world examples', () => {
  test('Alcon DAILIES TOTAL 1 30-pack 220.31kr → CORRECT', () => {
    const entries = [entry('DAILIES TOTAL 1', 30, 220.31)];
    const result = matchContacts(
      { product: 'DAILIES TOTAL 1 30-pack', netto: 220.31, quantity: 30, isReturn: false },
      entries
    );
    assert.equal(result.status, 'CORRECT');
    assert.equal(result.expectedPrice, 220.31);
    assert.equal(result.delta, 0);
  });

  test('J&J ACUVUE OASYS 1-Day (30) 187.60kr → CORRECT', () => {
    const entries = [entry('ACUVUE OASYS 1-Day', 30, 187.60)];
    const result = matchContacts(
      { product: 'ACUVUE OASYS 1-Day (30)', netto: 187.60, quantity: 30, isReturn: false },
      entries
    );
    assert.equal(result.status, 'CORRECT');
    assert.equal(result.delta, 0);
  });

  test('Bausch Ultra SVS (6) 216kr → CORRECT', () => {
    const entries = [entry('Ultra SVS 6pk', 6, 216)];
    const result = matchContacts(
      { product: 'Ultra SVS (6)', netto: 216, quantity: 6, isReturn: false },
      entries
    );
    assert.equal(result.status, 'CORRECT');
  });
});
