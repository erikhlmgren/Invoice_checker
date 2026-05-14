// scraper.js
// Logs into Synologen and downloads the Detaljer Excel for the previous month.
// Called by main.js before price checking when --offline is not set.
//
// Download flow (discovered from exportdetails.js source):
//   1. exportdetails.html calls vis.table.exportData() via Qlik Engine WebSocket
//   2. Engine generates the xlsx and returns a tempcontent URL
//      e.g. https://host/synologen/tempcontent/<hash>/file.xlsx
//   3. exportdetails calls window.open(link) → new tab → HTTP GET to tempcontent
//   4. Server responds with xlsx body (Content-Disposition: attachment)
//   5. exportdetails calls window.close() (JS bug — immediate, not a callback)
//
// Capture: listen for new pages, then capture the first HTTP response that
// contains 'tempcontent' in the URL, OR the Playwright download event.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const MONTH_ABBR = ['JAN','FEB','MAR','APR','MAJ','JUN','JUL','AUG','SEP','OKT','NOV','DEC'];

async function downloadDetaljer(config, downloadDir) {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthAbbr = MONTH_ABBR[prev.getMonth()];
  const year = prev.getFullYear();
  const monthNum = String(prev.getMonth() + 1).padStart(2, '0');

  const absDownloadDir = path.resolve(downloadDir);
  fs.mkdirSync(absDownloadDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });

  try {
    console.log(`Scraper: downloading Detaljer for ${monthAbbr} ${year}...`);
    console.log(`Save dir: ${absDownloadDir}`);

    // --- Step 1: Cookie consent ---
    const page = await context.newPage();
    await page.goto(config.synologen.loginUrl);
    const cookieBtn = page.getByRole('button', { name: 'Tillåt urval' });
    if (await cookieBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await cookieBtn.click();
    }

    // --- Step 2: Microsoft SSO login ---
    const [page1] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('link', { name: 'Login Insyn' }).click(),
    ]);
    await page1.waitForLoadState('domcontentloaded');

    await page1.getByRole('textbox', { name: 'Enter your email, phone, or' }).fill(config.synologen.step1.username);
    await page1.getByRole('button', { name: 'Next' }).click();
    await page1.getByRole('textbox', { name: 'Enter the password for' }).fill(config.synologen.step1.password);
    await page1.getByRole('button', { name: 'Sign in' }).click();
    await page1.getByRole('button', { name: 'No' }).click();

    // --- Step 3: Genomfakturering ---
    const [page3] = await Promise.all([
      context.waitForEvent('page'),
      page1.getByRole('link', { name: 'Genom-fakturering' }).click(),
    ]);
    await page3.waitForLoadState('domcontentloaded');

    await page3.getByRole('textbox', { name: 'Användarnamn' }).fill(config.synologen.step2.username);
    await page3.getByRole('textbox', { name: 'Lösenord' }).fill(config.synologen.step2.password);
    await page3.getByRole('button', { name: 'Log in' }).click();

    // --- Step 4: Navigate to Följesedels-Avstämning ---
    const frame = page3.locator('#main').contentFrame();
    await frame.getByRole('link', { name: 'F Ö L J E S E D E L S - A V S' }).click();

    // --- Step 5: Filter by previous month ---
    await frame.locator('.MuiGrid-root.MuiGrid-container.css-q0qbej').first().click();
    console.log('Filter pane opened');
    await frame.getByTestId('filterpane-listbox-container').getByTitle(monthAbbr).click();
    console.log(`Month ${monthAbbr} selected`);
    await frame.locator('.MuiBackdrop-root').click();
    console.log('Filter closed');
    await page3.waitForTimeout(2000);

    // --- Step 6: Intercept window.open → download URL directly ---
    //
    // exportdetails.js calls:
    //   vis.table.exportData().then(link => window.open(link).then(window.close()))
    //
    // `link` is a tempcontent URL: https://host/synologen/tempcontent/<hash>/file.xlsx
    //
    // Strategy: inject an init script (context-level, runs before page scripts)
    // that patches window.open. When the extension calls window.open(link) with
    // a tempcontent URL, we capture the URL and return null (suppress new tab).
    // Then we fetch the file directly from Node.js using the browser's session
    // cookies (context.request inherits the browser context cookies).

    const TIMEOUT_MS = 120_000;
    const savePath   = path.join(absDownloadDir, `detaljer-${year}-${monthNum}.xlsx`);

    let urlResolve, urlReject;
    const urlPromise = new Promise((res, rej) => { urlResolve = res; urlReject = rej; });
    setTimeout(() => urlReject(new Error('url-capture-timeout')), TIMEOUT_MS);

    // exposeFunction makes __onTempcontentUrl() callable from any page in context.
    await context.exposeFunction('__onTempcontentUrl', (url) => {
      console.log(`Tempcontent URL captured: ${url}`);
      urlResolve(url);
    });

    // addInitScript runs before any scripts on every page in this context.
    // Patches window.open to intercept the tempcontent URL.
    await context.addInitScript(() => {
      const _origOpen = window.open.bind(window);
      window.open = function(url, ...args) {
        if (typeof url === 'string') {
          // Resolve relative URLs (exportData may return a relative path).
          const abs = new URL(url, window.location.href).toString();
          if (abs.includes('tempcontent')) {
            window.__onTempcontentUrl(abs);
            return null; // suppress the new tab
          }
        }
        return _origOpen(url, ...args);
      };
    });

    console.log('Clicking export button — waiting for tempcontent URL...');
    await frame.getByRole('button', { name: 'Exportera detaljer till Excel' }).click();
    await page3.screenshot({ path: path.join(absDownloadDir, 'debug-after-click.png') });

    let tempcontentUrl;
    try {
      tempcontentUrl = await urlPromise;
    } catch (err) {
      await page3.screenshot({ path: path.join(absDownloadDir, 'debug-download-fail.png') });
      throw new Error(
        `window.open(tempcontentUrl) was not called within ${TIMEOUT_MS / 1000}s. ` +
        `Qlik Engine may be taking longer than expected to generate the export.`
      );
    }

    // Download the file using the browser's session cookies.
    console.log(`Downloading via context.request: ${tempcontentUrl}`);
    const response = await context.request.get(tempcontentUrl);
    if (!response.ok()) {
      throw new Error(`Tempcontent fetch failed: ${response.status()} ${response.statusText()}`);
    }
    const buffer = await response.body();
    fs.writeFileSync(savePath, buffer);
    console.log(`Scraper: saved ${buffer.length} bytes to ${savePath}`);

    return savePath;

  } finally {
    await browser.close();
  }
}

module.exports = { downloadDetaljer };
