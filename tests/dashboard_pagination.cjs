// Runs the real dashboard in a disposable MV3 Chrome profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/vuodo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const profile = fs.mkdtempSync(path.join(root, '.scratch/pagination-profile-'));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging']
  });
  try {
    const cdp = await context.browser().newBrowserCDPSession();
    const { id } = await cdp.send('Extensions.loadUnpacked', { path: root });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.goto(`chrome-extension://${id}/ui/dashboard.html`);
    await page.waitForFunction(() => document.getElementById('resultCount').textContent.includes('sản phẩm'));
    await page.evaluate(async () => {
      const products = Array.from({ length: 45 }, (_, index) => ({
        productId: `page-${index + 1}`, id: `page-${index + 1}`,
        titleKr: `Pagination item ${index + 1}`, salesPriceKrw: 100000 + index,
        niche: 'pagination', nicheName: 'Pagination', cogs1688Cny: 20
      }));
      await window.KDropStorage._setStorage(window.KDropStorage.KEY_PRODUCTS, products);
      await loadData();
    });
    const rows = () => page.locator('#productsTableBody > tr').count();
    assert.equal(await rows(), 20);
    assert.match(await page.locator('#pageRange').textContent(), /1–20 \/ 45/);
    await page.locator('#btnNextPage').click();
    assert.equal(await rows(), 20);
    assert.match(await page.locator('#pageRange').textContent(), /21–40/);
    await page.locator('#btnNextPage').click();
    assert.equal(await rows(), 5);
    assert.equal(await page.locator('#btnNextPage').isDisabled(), true);
    await page.evaluate(() => loadData());
    assert.equal(await page.locator('#pageNumber').inputValue(), '3');
    await page.locator('#searchInput').fill('item 45');
    assert.equal(await rows(), 1);
    assert.equal(await page.locator('#pageNumber').inputValue(), '1');
    await page.locator('#searchInput').fill('no match');
    assert.equal(await page.locator('#pageRange').textContent(), '0 sản phẩm');
    assert.equal(await page.locator('#btnNextPage').isDisabled(), true);
    await page.locator('#btnResetFilters').click();
    await page.locator('#pageSizeSelect').selectOption('10');
    assert.equal(await rows(), 10);
    await page.locator('#pageNumber').fill('5');
    await page.locator('#pageNumber').press('Tab');
    assert.equal(await rows(), 5);
    await page.locator('#sortSelect').selectOption('price_desc');
    assert.equal(await page.locator('#pageNumber').inputValue(), '1');
    assert.match(await page.locator('#productsTableBody').textContent(), /Pagination item 45/);
    await page.locator('#pageSizeSelect').selectOption('50');
    assert.equal(await rows(), 45);
    await page.setViewportSize({ width: 390, height: 844 });
    const fits = await page.locator('.table-pagination').evaluate(el => el.scrollWidth <= el.clientWidth);
    assert.equal(fits, true, 'Pagination controls fit a mobile viewport');
    assert.deepEqual(errors, []);
    console.log('PASS: page boundaries, reload preservation, filters, empty results, page jump, sorting, sizes, mobile layout, no runtime errors');
  } finally {
    await context.close();
    const resolved = path.resolve(profile);
    assert.equal(path.dirname(resolved), path.join(root, '.scratch'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
