// Installed Chrome MV3: replay the observed category DOM, restart its background,
// lose a commit acknowledgment, then verify sequential paging, limits and cancellation.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/vuodo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/coupang-category-184060.html'), 'utf8');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let checks = 0;
function check(name, expected, actual) { assert.deepEqual(actual, expected, name); console.log(`[PASS] ${name}`); checks++; }

(async () => {
  const profile = fs.mkdtempSync(path.join(root, '.scratch/category-runtime-profile-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
      ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging']
    });
    context.setDefaultTimeout(30000);
    const cdp = await context.browser().newBrowserCDPSession();
    const { id } = await cdp.send('Extensions.loadUnpacked', { path: root });
    const errors = [], dialogs = [], navigations = [];
    let slowNextPage = false;
    let totalPages = 3;
    await context.route('https://**/*', route => route.abort());
    await context.route('https://www.coupang.com/np/categories/184060**', async route => {
      const url = new URL(route.request().url());
      const pageNo = Number(url.searchParams.get('page') || 1);
      navigations.push(pageNo);
      if (slowNextPage && pageNo === 2) await delay(1500);
      let body = fixture;
      if (pageNo > 1) body = body.replaceAll('8680115623', String(900000000 + pageNo * 2)).replaceAll('8194311629', String(900000001 + pageNo * 2));
      const next = new URL(url);
      next.searchParams.set('page', String(pageNo + 1));
      body = body.replace(/<div class="Pagination_pagination[^>]*>[\s\S]*?<\/div>/,
        `<div class="Pagination_pagination__otherHash"><a data-page="${pageNo}" href="${url.href}">${pageNo}</a>${pageNo < totalPages ? `<a class="Pagination_nextBtn__otherHash" data-page="next" href="${next.href}">다음</a>` : '<span class="Pagination_disabled__otherHash">다음</span>'}</div>`);
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
    });
    const dash = await context.newPage();
    await dash.goto(`chrome-extension://${id}/ui/dashboard.html`);
    await dash.waitForFunction(() => typeof allProducts !== 'undefined' && allProducts.length > 0);
    const side = await context.newPage();
    await side.setViewportSize({ width: 420, height: 900 });
    await side.goto(`chrome-extension://${id}/ui/sidepanel.html`);
    const page = await context.newPage();
    for (const p of [dash, side, page]) {
      p.on('pageerror', error => errors.push(error.message));
      p.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
    }
    const reset = () => dash.evaluate(async () => { await chrome.storage.local.set({ kdrop_products: [] }); await loadData(); });
    const records = () => dash.evaluate(async () => (await chrome.storage.local.get('kdrop_products')).kdrop_products || []);
    const openCategory = async () => {
      await page.goto('https://www.coupang.com/np/categories/184060');
      await page.locator('#btnScrapeListing').waitFor();
      await page.bringToFront();
    };
    const stopWorker = async () => {
      const { targetInfos } = await cdp.send('Target.getTargets');
      const target = targetInfos.find(t => t.type === 'service_worker' && t.url.startsWith(`chrome-extension://${id}/`));
      assert.ok(target, 'extension service worker target exists');
      await cdp.send('Target.closeTarget', { targetId: target.targetId });
    };
    const floatingScan = async () => {
      dialogs.length = 0;
      await page.locator('#btnScrapeListing').click();
      await page.waitForFunction(() => !document.getElementById('btnScrapeListing').disabled);
      check('Floating scan acknowledges committed data', true, await page.locator('#btnScrapeListing').innerText().then(t => t.includes('Đã nạp')));
    };

    check('Loaded release is visible as v1.0.1', 'v1.0.1', await side.locator('#extensionVersion').innerText());
    await reset(); await openCategory();
    await stopWorker(); // The next real mutation must wake a fresh worker.
    await floatingScan();
    let saved = await records();
    check('Observed category imports three minimized captured cards after cold worker start', 3, saved.length);
    check('Category sale prices exclude used, original, unit-price and reward amounts', [2500, 7500, 3010], saved.map(p => p.marketData.salesPriceKrw));
    check('Category identity comes from the URL, not data-id=0', ['175498077', '8680115623', '8194311629'], saved.map(p => p.productId));
    check('First observed card vendor is separate', '84525913269', saved[0].vendorItemId);

    await reset(); await page.bringToFront();
    await side.locator('#btnScanCurrentTab').click();
    await side.waitForFunction(() => !document.getElementById('btnScanCurrentTab').disabled);
    check('Sidepanel category import persists through the real repository', 3, (await records()).length);
    await dash.reload();
    await dash.waitForFunction(() => document.querySelector('#productsTableBody')?.textContent.includes('토드 순정형'));
    check('Category appears in Studio table after reload', true, await dash.locator('#productsTableBody').innerText().then(t => t.includes('토드 순정형')));

    await dash.evaluate(async () => {
      const products = (await chrome.storage.local.get('kdrop_products')).kdrop_products;
      products[0].isWatchlist = true;
      products[0].sourcingDossier.cogs1688Cny = 277;
      products[0].sourcingDossier.provenance = 'MANUAL';
      await chrome.storage.local.set({ kdrop_products: products });
    });
    const worker = context.serviceWorkers().find(w => w.url().startsWith(`chrome-extension://${id}/`));
    assert.ok(worker);
    await worker.evaluate(() => {
      const original = self.KDropStorage.batchImportProducts;
      self.KDropStorage.batchImportProducts = async (...args) => {
        await original(...args);
        self.__categoryGateCommitted = true;
        await new Promise(() => {}); // Deliberately lose the reply after a genuine commit.
      };
    });
    await page.bringToFront();
    dialogs.length = 0;
    await page.locator('#btnScrapeListing').click();
    let committed = false;
    for (let i = 0; i < 100 && !committed; i++) { committed = await worker.evaluate(() => Boolean(self.__categoryGateCommitted)); if (!committed) await delay(30); }
    assert.ok(committed, 'first mutation actually committed before disconnect');
    check('A commit with its reply pending does not acknowledge success', false, await page.locator('#btnScrapeListing').isEnabled());
    await stopWorker();
    const recoveredAcknowledgment = await page.waitForFunction(() => !document.getElementById('btnScrapeListing').disabled && document.getElementById('btnScrapeListing').innerText.includes('Đã nạp'));
    check('Lost reply retry acknowledges success only after the recovered response', true, await recoveredAcknowledgment.jsonValue());
    saved = await records();
    check('Lost reply recovers without surfacing a port error', [], dialogs);
    check('Lost reply retry does not duplicate committed category products', 3, saved.length);
    check('Lost reply retry preserves manual dossier and watchlist', { cost: 277, watch: true }, { cost: saved[0].sourcingDossier.cogs1688Cny, watch: saved[0].isWatchlist });

    await reset(); await openCategory(); navigations.length = 0;
    await side.locator('#scanPageLimit').selectOption('10');
    await side.locator('#btnScanPages').click();
    await side.waitForFunction(() => !document.getElementById('btnScanPages').disabled);
    check('Sequential paging visits pages 2 and 3 exactly once', [2, 3], navigations);
    check('Cross-page duplicate products are upserted once', 7, (await records()).length);
    check('Progress confirms the last observed page and unique product count', true, await side.locator('#scanPagesStatus').innerText().then(t => t.includes('trang cuối') && t.includes('3 trang, 7 sản phẩm')));
    await side.screenshot({ path: path.join(root, '.scratch/coupang-scan-fix/verification/category-pagination.png') });

    await reset(); await openCategory(); navigations.length = 0; slowNextPage = true;
    await side.locator('#btnScanPages').click();
    await side.waitForFunction(() => document.getElementById('scanPagesStatus').textContent.includes('Đang đọc trang 2'));
    await side.locator('#btnStopScanPages').click();
    await side.waitForFunction(() => !document.getElementById('btnScanPages').disabled);
    check('Cancellation preserves the already committed first page', 3, (await records()).length);
    check('Cancellation never navigates to page 3', false, navigations.includes(3));
    check('Cancellation is visible in progress and controls recover', true, await side.locator('#scanPagesStatus').innerText().then(t => t.includes('Đã dừng theo yêu cầu')));
    check('Single-page scan control recovers after pagination', true, await side.locator('#btnScanCurrentTab').isEnabled());

    slowNextPage = false; totalPages = 7;
    await reset(); await openCategory(); navigations.length = 0;
    await side.locator('#scanPageLimit').selectOption('5');
    await side.locator('#btnScanPages').click();
    await side.waitForFunction(() => !document.getElementById('btnScanPages').disabled);
    check('Configured limit stops navigation after five pages', [2, 3, 4, 5], navigations);
    check('Limit preserves five committed pages with cross-page deduplication', 11, (await records()).length);
    check('Limit is reported without claiming the last page was reached', true, await side.locator('#scanPagesStatus').innerText().then(t => t.includes('giới hạn') && !t.includes('trang cuối')));

    await openCategory();
    await page.locator('[data-page="next"]').evaluate(link => link.setAttribute('href', 'https://example.com/np/categories/184060?page=2'));
    const unsafeNext = await dash.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: 'https://www.coupang.com/np/categories/184060*' });
      const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.KDropCoupangExtractor.getPaginationState() });
      return result.result;
    });
    check('An external pagination link is rejected without claiming a last page', { supported: false, nextUrl: null }, { supported: unsafeNext.supported, nextUrl: unsafeNext.nextUrl });

    totalPages = 3;
    await reset();
    await page.goto('https://www.coupang.com/np/categories/184060?sorter=SALES_COUNT');
    await page.locator('#btnScrapeListing').waitFor(); await page.bringToFront();
    await side.locator('#btnScanPages').click();
    await side.waitForFunction(() => !document.getElementById('btnScanPages').disabled);
    check('Pagination retains the selected sort on every subsequent page', 'SALES_COUNT', new URL(page.url()).searchParams.get('sorter'));
    check('A sales-sort listing still does not invent BSR ranks', true, (await records()).every(p => p.marketData.rank === null));
    check('No unhandled page errors', [], errors);
    console.log(`Category/runtime gate: ${checks} checks passed.`);
  } finally {
    if (context) await context.close();
    const resolved = path.resolve(profile);
    if (!resolved.startsWith(path.join(root, '.scratch') + path.sep)) throw new Error('Unexpected test profile path');
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
