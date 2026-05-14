# Invoice Checker

Automated invoice verification tool for optical retail. Logs into the Synologen purchasing portal, downloads the monthly invoice export, compares every line item against supplier price lists, and emails a discrepancy report.

Built as a freelance AI solutions project — [erikholmgren.se](https://erikholmgren.se)

## What It Does

1. Logs into Synologen (two-step login via Playwright)
2. Downloads the Detaljer invoice export (Excel)
3. Routes each line item to the correct supplier matcher
4. Looks up the expected price from the supplier's price list
5. Flags overcharges, computes total discrepancy in SEK
6. Writes a color-coded Excel report (summary + discrepancy breakdown)
7. Emails the report automatically

## Suppliers Covered

| Supplier | Products |
|---|---|
| Carl Zeiss Vision | Progressive + SV SmartLife ophthalmic lenses |
| CZV Synchrony | Synchrony progressive/SV/bifocal ophthalmic lenses |
| CooperVision | Biofinity, Proclear, MyDay, Clariti, etc. |
| Bausch + Lomb | Ultra, Biotrue, SofLens, PureVision, etc. |
| Johnson & Johnson | ACUVUE range |
| Alcon | DAILIES, AIR OPTIX, TOTAL 30, PRECISION |
| Clearlii | Vitamin, Daily Advanced, Monthly Advanced |
| Maui Jim | Plano sunglasses |

## Stack

- **Node.js** — core runtime
- **Playwright** — headless login + file download
- **ExcelJS** — invoice parsing + report generation
- **pdf-parse** — price list extraction
- **Nodemailer** — email delivery
- **Windows Task Scheduler** — monthly automation

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure
cp config.example.json config.json
# Fill in: Synologen credentials, SMTP settings, price list paths

# 3. Add price list PDFs to data/price-lists/

# 4. Run
node src/main.js
```

Or use `run-manual.bat` on Windows for a menu-driven run.

For automated monthly runs, `setup/install.bat` registers a Windows Task Scheduler job.

## Report Format

The output Excel has up to three sheets:

| Sheet | Contents |
|---|---|
| Sammanfattning | Summary: row counts and total discrepancy in SEK |
| Avvikelser | Confirmed overcharges with per-unit breakdown |
| Okända tillägg | Add-on rows with unconfirmed pricing (if any) |

## Configuration

Copy `config.example.json` to `config.json` (git-ignored) and fill in:

- `synologen` — login credentials (two-step)
- `smtp` — outbound email (Gmail App Password recommended)
- `priceLists` — paths to supplier PDF price lists
- `localFiles.detaljer` — path to a local invoice file (skips scraper, for testing)

## Project Structure

```
src/
  main.js          — entry point, CLI args, orchestration
  loader.js        — Excel invoice parser
  router.js        — routes line items to vendor by product name
  addons.js        — add-on surcharge lookup and application
  output.js        — Excel report writer
  email.js         — SMTP delivery
  scraper.js       — Playwright login + download
  matcher/         — one matcher per supplier
  parsers/         — one PDF parser per supplier price list
config/
  routing-rules.json    — vendor routing patterns
  addon-prices.json     — confirmed add-on surcharge prices
  no-price-list.json    — products exempt from price checking (frames, cases, etc.)
tests/             — unit tests per supplier
```

## License

Private. Built for a specific client deployment.
