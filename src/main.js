// main.js
// Invoice checker — entry point.
//
// Usage:
//   node src/main.js [--input <detaljer.xlsx>] [--output <dir>] [--send-email]
//
// What it does:
//   1. Load line items from the Detaljer Excel export
//   2. Route each item to a vendor using routing-rules.json
//   3. Parse all price lists and run the matchers
//   4. Write a two-sheet Excel report to the output directory
//   5. Optionally send the report by email (--send-email flag)

const path = require('path');
const fs = require('fs');

const { downloadDetaljer }  = require('./scraper');
const { loadLineItems }     = require('./loader');
const { routeLineItems }    = require('./router');
const { parseCZV }          = require('./parsers/czv');
const { parseSynchrony }    = require('./parsers/synchrony');
const { parseCooperVision } = require('./parsers/coopervision');
const { parseAlcon }        = require('./parsers/alcon');
const { parseJJ }           = require('./parsers/jj');
const { parseClearlii }     = require('./parsers/clearlii');
const { parseBausch }       = require('./parsers/bausch');
const { parseMauiJim }      = require('./parsers/mauijim');
const { matchCZV }          = require('./matcher/czv');
const { matchSynchrony }    = require('./matcher/synchrony');
const { matchCooperVision } = require('./matcher/coopervision');
const { matchAlcon }        = require('./matcher/alcon');
const { matchJJ }           = require('./matcher/jj');
const { matchClearlii }     = require('./matcher/clearlii');
const { matchBausch }       = require('./matcher/bausch');
const { matchMauiJim }      = require('./matcher/mauijim');
const { writeReport }                       = require('./output');
const { sendReport }                        = require('./email');
const { checkNoPriceList, findAddons, applyAddons } = require('./addons');

// --- Config ---

const CONFIG_PATH = path.join(__dirname, '../config.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

// --- CLI args ---

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : null;
  };
  return {
    input:     get('--input'),
    output:    get('--output'),
    sendEmail: args.includes('--send-email'),
  };
}

// --- Price list loading ---

async function loadPriceLists(config) {
  const plDir = path.join(__dirname, '../data/price-lists');
  const resolve = (key, fallback) => {
    const configured = config.priceLists?.[key];
    return configured ? path.join(__dirname, '..', configured) : path.join(plDir, fallback);
  };

  const paths = {
    zeiss:     resolve('zeiss',        '2026.04 Price list ZEISS.pdf'),
    synchrony: resolve('czv-synchrony','SYNCHRONY Prislista 2025.pdf'),
    cooper:    resolve('cooper',       'Cooper Vision 2026.pdf'),
    alcon:     resolve('alcon',        'Alcon 2026.pdf'),
    jj:        resolve('jj',           'Jonhson o Jonhson prislista 2026.pdf'),
    clearlii:  resolve('clearlii',     'Clearlii Professional_2025 - Synologen_Priser_Inkl MF.pdf'),
    bausch:    resolve('bausch-lomb',  'Bausch+Lomb prislista Synologen 1 april 2026.pdf'),
    mauijim:   resolve('maui-jim',     'Price List MAUI JIM_2026-03-01_SEK Plano (WHLS+MSRP).pdf'),
  };

  const missing = Object.entries(paths).filter(([, p]) => !fs.existsSync(p));
  if (missing.length > 0) {
    console.warn('Price list files not found (those suppliers will be skipped):');
    for (const [key, p] of missing) console.warn(`  ${key}: ${path.basename(p)}`);
  }

  const [czv, synchrony, cv, alcon, jj, clearlii, bausch, mauijim] = await Promise.all([
    fs.existsSync(paths.zeiss)      ? parseCZV(paths.zeiss)                : null,
    fs.existsSync(paths.synchrony)  ? parseSynchrony(paths.synchrony)      : null,
    fs.existsSync(paths.cooper)     ? parseCooperVision(paths.cooper)      : null,
    fs.existsSync(paths.alcon)      ? parseAlcon(paths.alcon)              : null,
    fs.existsSync(paths.jj)         ? parseJJ(paths.jj)                    : null,
    fs.existsSync(paths.clearlii)   ? parseClearlii(paths.clearlii)        : null,
    fs.existsSync(paths.bausch)     ? parseBausch(paths.bausch)            : null,
    fs.existsSync(paths.mauijim)    ? parseMauiJim(paths.mauijim)          : null,
  ]);
  return { czv, synchrony, cv, alcon, jj, clearlii, bausch, mauijim };
}

// --- Matching ---

function matchItem(item, priceLists) {
  // 1. Check no-price-list categories first (frames, safety, cases)
  const noPriceList = checkNoPriceList(item.product || '');
  if (noPriceList) return noPriceList;

  // 2. Run the vendor matcher
  let result;
  switch (item.vendor) {
    case 'Carl Zeiss Vision':
      if (!priceLists.czv) return { status: 'NOT_FOUND', note: 'zeiss price list not loaded' };
      result = matchCZV(item, priceLists.czv);
      break;
    case 'Synchrony':
      if (!priceLists.synchrony) return { status: 'NOT_FOUND', note: 'synchrony price list not loaded' };
      result = matchSynchrony(item, priceLists.synchrony);
      break;
    case 'CooperVision':
      if (!priceLists.cv) return { status: 'NOT_FOUND', note: 'coopervision price list not loaded' };
      result = matchCooperVision(item, priceLists.cv);
      break;
    case 'Alcon':
      if (!priceLists.alcon) return { status: 'NOT_FOUND', note: 'alcon price list not loaded' };
      result = matchAlcon(item, priceLists.alcon);
      break;
    case 'Johnson & Johnson':
      if (!priceLists.jj) return { status: 'NOT_FOUND', note: 'jj price list not loaded' };
      result = matchJJ(item, priceLists.jj);
      break;
    case 'Clearlii':
      if (!priceLists.clearlii) return { status: 'NOT_FOUND', note: 'clearlii price list not loaded' };
      result = matchClearlii(item, priceLists.clearlii);
      break;
    case 'Bausch+Lomb':
      if (!priceLists.bausch) return { status: 'NOT_FOUND', note: 'bausch price list not loaded' };
      result = matchBausch(item, priceLists.bausch);
      break;
    case 'Maui Jim':
      if (!priceLists.mauijim) return { status: 'NOT_FOUND', note: 'mauijim price list not loaded' };
      result = matchMauiJim(item, priceLists.mauijim);
      break;
    case 'SHIPPING':
      return { status: 'SHIPPING', note: 'frakt' };
    default:
      return {
        status: 'NOT_FOUND',
        note: `no matcher for vendor: ${item.vendor || 'unknown'} | ${item.product}`,
      };
  }

  // 3. Apply add-on prices on top of the base result.
  // Only runs on DISCREPANCY — if the base already matched (CORRECT), leave it alone.
  // Add-ons explain deltas; they don't invalidate confirmed matches.
  if (result.status === 'DISCREPANCY') {
    const addons = findAddons(item.addon);
    if (addons.length > 0) {
      const qty = Math.abs(item.quantity || 1);
      result = applyAddons(result, addons, qty);
    }
  }

  return result;
}

// --- Summary ---

function buildSummary(results) {
  const counts = { total: results.length };
  let netDelta = 0;
  for (const r of results) {
    counts[r.status] = (counts[r.status] || 0) + 1;
    if (r.status === 'DISCREPANCY') netDelta += r.delta || 0;
  }
  counts.netDelta = Math.round(netDelta * 100) / 100;
  return counts;
}

function printSummary(summary, items, results) {
  console.log('\n=== Invoice Check Summary ===');
  console.log(`Total lines:   ${summary.total}`);
  console.log(`CORRECT:          ${summary.CORRECT        || 0}`);
  console.log(`DISCREPANCY:      ${summary.DISCREPANCY    || 0}`);
  console.log(`NOT_FOUND:        ${summary.NOT_FOUND      || 0}`);
  console.log(`NO_PRICE_LIST:    ${summary.NO_PRICE_LIST  || 0}  (frames, safety, cases — not checked)`);
  console.log(`WAIVED:           ${summary.WAIVED         || 0}`);
  console.log(`SKIP (return):    ${summary.SKIP           || 0}`);
  console.log(`SHIPPING:         ${summary.SHIPPING       || 0}`);

  if (summary.DISCREPANCY > 0) {
    console.log(`\nNet delta on discrepancies: ${summary.netDelta >= 0 ? '+' : ''}${summary.netDelta.toFixed(2)} SEK`);
    console.log('\nDiscrepancies:');
    for (let i = 0; i < items.length; i++) {
      if (results[i].status === 'DISCREPANCY') {
        const item = items[i];
        const r    = results[i];
        const addon = item.addon && item.addon !== '-' ? ` / ${item.addon}` : '';
        console.log(`  ${item.product}${addon} → delta: ${r.delta >= 0 ? '+' : ''}${r.delta} SEK`);
      }
    }
  } else {
    console.log('\nNo discrepancies found.');
  }
}

// --- Main ---

async function main() {
  const args   = parseArgs();
  const config = loadConfig();

  // Resolve paths: CLI args override config, config overrides defaults
  let inputFile = args.input
    || (config.localFiles?.detaljer && path.join(__dirname, '..', config.localFiles.detaljer));

  const outputDir = args.output
    || path.join(__dirname, '../output');

  const sendEmail = args.sendEmail || config.sendEmail === true;

  const offline = process.argv.includes('--offline');

  if (!inputFile && !offline) {
    // Auto-download from Synologen
    const downloadDir = path.join(__dirname, '../data/downloads');
    console.log('No local file configured — downloading from Synologen...');
    inputFile = await downloadDetaljer(config, downloadDir);
  }

  if (!inputFile) {
    console.error('No input file. Use --input <file>, set localFiles.detaljer in config.json, or run without --offline.');
    process.exit(1);
  }

  if (!fs.existsSync(inputFile)) {
    console.error(`Input file not found: ${inputFile}`);
    process.exit(1);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  console.log(`Input:  ${inputFile}`);
  console.log('Loading line items...');
  const raw = await loadLineItems(inputFile);

  console.log('Routing items...');
  const items = routeLineItems(raw);

  console.log('Loading price lists...');
  const priceLists = await loadPriceLists(config);

  console.log('Matching...');
  const results = items.map(item => matchItem(item, priceLists));

  const summary = buildSummary(results);
  printSummary(summary, items, results);

  // Derive period label from input filename (detaljer-2026-03.xlsx → "Mar 2026")
  const MONTH_SV = ['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];
  const periodMatch = inputFile.match(/(\d{4})-(\d{2})/);
  const period = periodMatch
    ? `${MONTH_SV[parseInt(periodMatch[2], 10) - 1]} ${periodMatch[1]}`
    : 'Mars 2026';

  console.log('\nWriting report...');
  const reportPath = await writeReport(items, results, outputDir, period);
  console.log(`Report: ${reportPath}`);

  if (sendEmail) {
    const smtp = config.smtp;
    if (!smtp?.user || smtp.user === 'your-email@company.se') {
      console.error('\nEmail skipped — SMTP not configured. Edit smtp section in config.json.');
    } else {
      console.log('\nSending email...');
      const msgId = await sendReport(reportPath, summary, smtp);
      console.log(`Email sent: ${msgId}`);
    }
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
