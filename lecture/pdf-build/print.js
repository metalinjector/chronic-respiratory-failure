const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME = process.env.CHROME_PATH || path.join(__dirname, 'chrome', 'chromium');
const CHROME_DIR = path.dirname(CHROME);
const htmlPath = path.resolve(process.argv[2]), pdfPath = path.resolve(process.argv[3]);
(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--allow-file-access-from-files','--font-render-hinting=none','--disable-features=IsolateOrigins,site-per-process','--js-flags=--max-old-space-size=2048'],
    env: {...process.env, LD_LIBRARY_PATH: [path.join(CHROME_DIR, 'lib', 'lib'), CHROME_DIR, process.env.LD_LIBRARY_PATH || ''].join(':'), FONTCONFIG_PATH: process.env.FONTCONFIG_PATH || '/etc/fonts'},
    protocolTimeout: 1800000,
  });
  const page = await browser.newPage();
  await page.setViewport({width: 794, height: 1123});
  page.on('pageerror', e => console.log('pageerror:', e.message));
  page.on('console', m => { const t = m.text(); if (!/Download the React DevTools|font/i.test(t)) console.log('console:', t.slice(0, 300)); });
  const t0 = Date.now();
  await page.goto('file://' + htmlPath, {waitUntil: 'load', timeout: 600000});
  console.log('loaded', (Date.now()-t0)/1000, 's');
  await page.waitForFunction('window.__ready === true', {timeout: 900000, polling: 500});
  const err = await page.evaluate(() => window.__err || null);
  if (err) console.log('MERMAID ERROR:', err.slice(0, 1000));
  const stats = await page.evaluate(() => ({ svgs: document.querySelectorAll('.fig svg').length, mermaidErr: document.querySelectorAll('.fig-mermaid .error-text, .fig-mermaid [id^="d"] .error-icon').length, mermaidTotal: document.querySelectorAll('.fig-mermaid').length, pre: document.querySelectorAll('pre.mermaid:not([data-processed])').length }));
  console.log('render stats', JSON.stringify(stats), (Date.now()-t0)/1000, 's');
  await page.emulateMediaType('print');
  await page.pdf({path: pdfPath, preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, timeout: 0, outline: false, tagged: false});
  console.log('pdf written', pdfPath, (Date.now()-t0)/1000, 's');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
