// output.js
// Generates a 2-sheet Excel report (3 if unidentified rows exist).
//
// Sheet 1: Sammanfattning  — summary with totals
// Sheet 2: Avvikelser      — confirmed overcharges, with reference + per-unit breakdown
// Sheet 3: Okända tillägg  — unconfirmed addon rows (only written if any exist)

const ExcelJS = require('exceljs');
const path    = require('path');

const BLUE   = 'FF4472C4';
const WHITE  = 'FFFFFFFF';
const RED    = 'FFFF9999';
const YELLOW = 'FFFFF2CC';
const GREY   = 'FFF2F2F2';
const GREEN  = 'FFD9F0D3';

function addHeaderRow(sheet, labels, widths) {
  const row = sheet.addRow(labels);
  row.eachCell(cell => {
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    cell.font      = { bold: true, color: { argb: WHITE }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  row.height = 28;
  widths.forEach((w, i) => { sheet.getColumn(i + 1).width = w; });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function fillRow(row, argb) {
  row.eachCell({ includeEmpty: true }, cell => {
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
    cell.alignment = { vertical: 'middle' };
  });
}

function sek(val) {
  return typeof val === 'number' ? Math.round(val * 100) / 100 : '';
}

// Returns per-unit billed and expected prices.
// For contact lenses (packSize present): per box.
// For glasses: per lens.
function perUnit(item, result) {
  const qty   = Math.abs(item.quantity || 1);
  const netto = Math.abs(item.netto    || 0);
  if (result.packSize) {
    const boxes = qty / result.packSize;
    return {
      billed:   boxes > 0 ? Math.round((netto / boxes) * 100) / 100 : null,
      expected: result.expectedPrice || null,
    };
  }
  return {
    billed:   qty > 0 ? Math.round((netto / qty) * 100) / 100 : null,
    expected: result.expectedPrice || null,
  };
}

// --- Sheet 1: Sammanfattning ---
function writeSummary(wb, items, results, period) {
  const sheet = wb.addWorksheet('Sammanfattning');

  sheet.mergeCells('A1:C1');
  const title = sheet.getCell('A1');
  title.value     = `Fakturakontroll – ${period}`;
  title.font      = { bold: true, size: 18 };
  title.alignment = { horizontal: 'left', vertical: 'middle' };
  sheet.getRow(1).height = 36;
  sheet.addRow([]);

  // Count only rows where something was actually charged (netto > 0)
  const counts   = {};
  let netDelta   = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const charged = Math.abs(items[i].netto || 0) > 0;
    if (charged) counts[r.status] = (counts[r.status] || 0) + 1;
    if (r.status === 'DISCREPANCY') netDelta += r.delta || 0;
  }
  netDelta = Math.round(netDelta);

  const correct      = counts['CORRECT']      || 0;
  const discrepancy  = counts['DISCREPANCY']  || 0;
  const unidentified = counts['UNIDENTIFIED'] || 0;
  const noPriceList  = counts['NO_PRICE_LIST']|| 0;
  const notFound     = counts['NOT_FOUND']    || 0;

  const hdr = sheet.addRow(['Kategori', 'Antal rader', 'Belopp (SEK)']);
  hdr.font = { bold: true, color: { argb: WHITE }, size: 11 };
  hdr.eachCell(cell => {
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    cell.alignment = { vertical: 'middle' };
  });

  const addStat = (label, count, amount, argb) => {
    const r = sheet.addRow([label, count, amount != null ? amount : '–']);
    r.eachCell({ includeEmpty: true }, cell => {
      cell.alignment = { vertical: 'middle' };
    });
    if (argb) fillRow(r, argb);
  };

  addStat('Korrekt fakturerade', correct, null, GREEN);
  addStat('Verifierade avvikelser (överdebitering)', discrepancy, netDelta, RED);
  addStat('Okänt tillägg – ej bekräftat pris', unidentified, null, YELLOW);
  addStat('Ej prissatt (ramar, säkerhetsglas m.m.)', noPriceList, null, GREY);
  addStat('Okänd produkt (ej i prislista)', notFound, null, GREY);

  sheet.addRow([]);

  const tot = sheet.addRow(['Total verifierad avvikelse', '', netDelta]);
  tot.font = { bold: true, size: 13 };
  fillRow(tot, RED);
  sheet.addRow([]);

  const note1 = sheet.addRow(['* Avvikelse = fakturerat belopp överstiger prislistans pris. Antal rader avser fakturerade rader med belopp > 0.']);
  note1.font = { italic: true, color: { argb: 'FF666666' } };
  sheet.mergeCells(`A${note1.number}:C${note1.number}`);

  if (unidentified > 0) {
    const note2 = sheet.addRow(['* Okänt tillägg = fakturan innehåller ett tillägg vars pris saknas i prislistan (t.ex. STANDARD DIA., OPTIMA VERSION). Se fliken "Okända tillägg".']);
    note2.font = { italic: true, color: { argb: 'FF666666' } };
    sheet.mergeCells(`A${note2.number}:C${note2.number}`);
  }

  sheet.getColumn(1).width = 50;
  sheet.getColumn(2).width = 14;
  sheet.getColumn(3).width = 16;
}

// --- Sheet 2: Avvikelser ---
function writeDiscrepancies(wb, items, results) {
  const sheet = wb.addWorksheet('Avvikelser');

  addHeaderRow(sheet,
    ['Referens', 'Leverantör', 'Produkt', 'Tillägg', 'Antal',
     'Pris/enhet (faktura)', 'Pris/enhet (prislista)',
     'Fakturerat (SEK)', 'Förväntat (SEK)', 'Avvikelse (SEK)'],
    [16,          18,           38,          28,         7,
     20,                        20,
     18,                18,               16           ]
  );

  const rows = items
    .map((item, i) => ({ item, result: results[i] }))
    .filter(({ result }) => result.status === 'DISCREPANCY')
    .sort((a, b) => (b.result.delta || 0) - (a.result.delta || 0));

  let total = 0;
  for (const { item, result } of rows) {
    const pu = perUnit(item, result);
    const r = sheet.addRow([
      item.reference || '',
      item.vendor    || '',
      item.product   || '',
      item.addon && item.addon !== '-' ? item.addon : '',
      Math.abs(item.quantity || 0),
      sek(pu.billed),
      sek(pu.expected),
      sek(item.netto),
      sek(result.expectedTotal),
      sek(result.delta),
    ]);
    fillRow(r, RED);
    total += result.delta || 0;
  }

  if (rows.length > 0) {
    sheet.addRow([]);
    const tot = sheet.addRow(['', '', '', '', '', '', '', '', 'Total avvikelse:', Math.round(total * 100) / 100]);
    tot.font = { bold: true };
    tot.getCell(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } };
  }

  sheet.autoFilter = { from: 'A1', to: 'J1' };
}

// --- Sheet 3: Okända tillägg (only if rows exist) ---
function writeUnidentified(wb, items, results) {
  const rows = items
    .map((item, i) => ({ item, result: results[i] }))
    .filter(({ result }) => result.status === 'UNIDENTIFIED');

  if (rows.length === 0) return;

  const sheet = wb.addWorksheet('Okända tillägg');

  addHeaderRow(sheet,
    ['Referens', 'Leverantör', 'Produkt', 'Okänt tillägg', 'Antal',
     'Fakturerat (SEK)', 'Grundpris ex. tillägg (SEK)', 'Möjlig avvikelse (SEK)'],
    [16,          18,           38,          28,              7,
     18,                        28,                           22                  ]
  );

  for (const { item, result } of rows) {
    const r = sheet.addRow([
      item.reference || '',
      item.vendor    || '',
      item.product   || '',
      item.addon && item.addon !== '-' ? item.addon : '',
      Math.abs(item.quantity || 0),
      sek(item.netto),
      sek(result.expectedTotal),
      sek(result.delta),
    ]);
    fillRow(r, YELLOW);
  }

  sheet.addRow([]);
  const noteRow = sheet.addRow([
    'Dessa rader innehåller tillägg vars pris inte finns bekräftat i prislistan. Kontakta leverantör för prisuppgift.'
  ]);
  noteRow.font = { italic: true, color: { argb: 'FF666666' } };
  sheet.mergeCells(`A${noteRow.number}:H${noteRow.number}`);

  sheet.autoFilter = { from: 'A1', to: 'H1' };
}

// --- Entry point ---
async function writeReport(items, results, outDir, period) {
  const wb = new ExcelJS.Workbook();

  const periodStr = period || 'Mars 2026';
  writeSummary(wb, items, results, periodStr);
  writeDiscrepancies(wb, items, results);
  writeUnidentified(wb, items, results);

  const timestamp = new Date().toISOString().slice(0, 10);
  const outPath   = path.join(outDir, `rapport_${timestamp}.xlsx`);
  await wb.xlsx.writeFile(outPath);
  return outPath;
}

module.exports = { writeReport };
