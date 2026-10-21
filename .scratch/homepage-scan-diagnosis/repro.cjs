// Diagnostic only. Replays a minimal observed homepage banner in disposable Chrome.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/vuodo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '../..');
const homepage = '<!doctype html><meta charset="utf-8"><title>Coupang</title><div id="todayDiscoveryUnit" class="today-discovery"><div class="discovery-list"><ul class="banner-list prod-list"><li class="half-width" data-vendor-item-id="0"><a href="https://shop.coupang.com/lionkoreaofficial/533245"><img alt=""><div class="go-btn"><p>구매하기</p></div></a></li></ul></div></div>';
const control = '<!doctype html><meta charset="utf-8"><title>Search control</title><ul class="search-product-list"><li class="search-product" data-product-id="123456789"><a href="/vp/products/123456789?vendorItemId=999"><span class="name">수납함</span><strong class="price-value">110,000원</strong></a></li></ul>';
(async () => {
  const profile = fs.mkdtempSync(path.join(__dirname, 'chrome-profile-'));
  let context;
  const observations = [];
  try {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
      ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging']
    });
    context.setDefaultTimeout(10000);
    const cdp = await context.browser().newBrowserCDPSession();
    const { id } = await cdp.send('Extensions.loadUnpacked', { path: root });
    const dashboard = await context.newPage();
    await dashboard.goto(`chrome-extension://${id}/ui/dashboard.html`);
    await dashboard.waitForFunction(() => typeof allProducts !== 'undefined' && allProducts.length > 0);
    await dashboard.evaluate(() => chrome.storage.local.set({ kdrop_products: [] }));
    await context.route('https://www.coupang.com/**', route => {
      const url = new URL(route.request().url());
      let body = url.pathname === '/' ? homepage : control;
      if (url.searchParams.has('modern')) {
        body = fs.readFileSync(path.join(__dirname, 'modern-search-card.html'), 'utf8');
        // Each step changes one additional DOM input in the replay only.
        const step = Number(url.searchParams.get('probe') || 0);
        if (step >= 1) body = body.replace('ProductUnit_productUnit__Qd6sv', 'ProductUnit_productUnit__Qd6sv search-product');
        if (step >= 2) body = body.replace('data-id="95921999183"', 'data-id="95921999183" data-product-id="9693648728"');
        if (step >= 3) body = body.replace('ProductUnit_productNameV2__cV9cw', 'ProductUnit_productNameV2__cV9cw name');
        if (step >= 4) body = body.replace('<span>195,800원</span>', '<span class="price-value">195,800원</span>');
      }
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
    });
    const page = await context.newPage();
    const dialogs = [];
    page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
    for (let run = 1; run <= 2; run++) {
      await page.goto('https://www.coupang.com/');
      await page.locator('#btnScrapeListing').click();
      await page.waitForFunction(() => document.getElementById('btnScrapeListing').innerText.includes('Nạp Coupang'));
      const observation = {
        run, url: page.url(), buttonVisible: await page.locator('#btnScrapeListing').isVisible(),
        alert: dialogs.at(-1), storedCount: await dashboard.evaluate(async () => (await chrome.storage.local.get('kdrop_products')).kdrop_products.length)
      };
      assert.equal(observation.alert, 'Không tìm thấy danh sách sản phẩm trên trang này!');
      assert.equal(observation.storedCount, 0);
      observations.push(observation);
      console.log('HOMEPAGE', JSON.stringify(observation));
    }
    if (process.argv.includes('--expect-import')) {
      assert.ok(observations[0].storedCount > 0, 'Nút nạp trên trang chủ không nạp được sản phẩm');
    }
    await page.goto('https://www.coupang.com/np/search?q=control');
    await page.locator('#btnScrapeListing').click();
    await page.waitForFunction(() => document.getElementById('btnScrapeListing').innerText.includes('Đã nạp'));
    const stored = await dashboard.evaluate(async () => (await chrome.storage.local.get('kdrop_products')).kdrop_products);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].productId, '123456789');
    assert.equal(stored[0].rank, null);
    console.log('CONTROL', JSON.stringify({ storedCount: stored.length, productId: stored[0].productId, rank: stored[0].rank }));
    await page.goto('https://www.coupang.com/np/search?q=수납함&modern=1');
    await page.locator('#btnScrapeListing').click();
    await page.waitForFunction(() => document.getElementById('btnScrapeListing').innerText.includes('Nạp Coupang'));
    const modern = {
      visibleProductLinks: await page.locator('a[href*="/vp/products/"]').count(),
      legacyCards: await page.locator('li.search-product, li.baby-product, .search-product-list li').count(),
      alert: dialogs.at(-1),
      storedCount: await dashboard.evaluate(async () => (await chrome.storage.local.get('kdrop_products')).kdrop_products.length)
    };
    console.log('MODERN', JSON.stringify(modern));
    const probes = [];
    if (process.argv.includes('--probes')) {
      for (let step = 1; step <= 4; step++) {
        await page.goto(`https://www.coupang.com/np/search?modern=1&probe=${step}`);
        await page.locator('#btnScrapeListing').waitFor();
        const extracted = await dashboard.evaluate(async () => {
          const [tab] = await chrome.tabs.query({ url: 'https://www.coupang.com/*' });
          return (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.KDropCoupangExtractor.extractListingProducts() }))[0].result;
        });
        const probe = { step, addedCompatibility: ['container class', 'product ID', 'title class', 'sale-price class'][step - 1], extractedCount: extracted.length };
        assert.equal(extracted.length, step === 4 ? 1 : 0);
        if (step === 4) {
          assert.equal(extracted[0].productId, '9693648728');
          assert.equal(extracted[0].salesPriceKrw, 195800);
          assert.equal(extracted[0].rank, null);
        }
        probes.push(probe);
        console.log('PROBE', JSON.stringify(probe));
      }
    }
    fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({ observations, control: { storedCount: stored.length }, modern, probes }, null, 2));
    if (process.argv.includes('--expect-modern-import')) {
      assert.ok(modern.storedCount > stored.length, 'Trang tìm kiếm thật có sản phẩm nhưng selector cũ trả về rỗng');
    }
  } finally {
    if (context) await context.close();
    const resolved = path.resolve(profile);
    if (resolved.startsWith(path.resolve(__dirname) + path.sep)) fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
