// pdf-utils.js
// Shared utilities for parsing price list PDFs.
//
// The core idea: pdfjs gives us each text item with its x/y position on the page.
// We use those positions to reconstruct the table structure, rather than
// trying to parse the raw text string (which is unreliable for tabular data).

const { readFileSync } = require('fs');

// Dynamically imports pdfjs (ESM-only module) and returns the getDocument function.
// We cache it so we only import once.
let _getDocument = null;
async function getPdfjs() {
  if (!_getDocument) {
    const mod = await import('../../node_modules/pdfjs-dist/legacy/build/pdf.mjs');
    _getDocument = mod.getDocument;
  }
  return _getDocument;
}

// Extracts all pages from a PDF as arrays of positioned text items.
// Returns: array of pages, each page is an array of { x, y, text } objects.
// Whitespace-only items are filtered out.
async function extractPages(filePath) {
  const getDocument = await getPdfjs();
  const data = new Uint8Array(readFileSync(filePath));
  const pdf = await getDocument({ data }).promise;

  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const items = content.items
      .filter(item => item.str.trim() !== '')
      .map(item => ({
        x: Math.round(item.transform[4]),
        y: Math.round(item.transform[5]),
        text: item.str.trim(),
      }));
    pages.push(items);
  }
  return pages;
}

// Groups items from a single page into rows, based on y-coordinate.
// Items within `tolerance` pixels of each other are in the same row.
// Each row is sorted left-to-right by x-coordinate.
function groupIntoRows(items, tolerance = 2) {
  const rows = [];

  for (const item of items) {
    const existing = rows.find(r => Math.abs(r.y - item.y) <= tolerance);
    if (existing) {
      existing.items.push(item);
    } else {
      rows.push({ y: item.y, items: [item] });
    }
  }

  // Sort rows top-to-bottom (higher y = higher on page in PDF coordinates)
  rows.sort((a, b) => b.y - a.y);

  // Sort items within each row left-to-right
  rows.forEach(r => r.items.sort((a, b) => a.x - b.x));

  return rows;
}

// Parses a price string like "1 139" or "796*" into a number.
// Returns null for "-" (not available).
function parsePrice(str) {
  if (!str || str === '-') return null;
  const cleaned = str.replace(/\s/g, '').replace('*', '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// Given a row of items and a set of column x-positions,
// finds the item closest to each column and returns its text.
// tolerance: how many pixels away an item can be from a column x and still match.
function extractColumns(rowItems, columnXPositions, tolerance = 15) {
  return columnXPositions.map(colX => {
    const match = rowItems.find(item => Math.abs(item.x - colX) <= tolerance);
    return match ? match.text : null;
  });
}

module.exports = { extractPages, groupIntoRows, parsePrice, extractColumns };
