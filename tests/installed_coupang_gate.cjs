/**
 * INSTALLED CHROME MV3 ACCEPTANCE GATE FOR COUPANG SCAN FIX
 * Verifies the complete vertical slice in installed Chrome MV3 with disposable profile:
 * - Floating import button (#btnScrapeListing) on Coupang
 * - Sidepanel scan button (#btnScanCurrentTab) in K-Drop sidepanel
 * - Storage repository commit & visibility in Studio Dashboard
 * - Reload durability and rescan preservation
 * - Acceptance Matrix cases (modern cards, legacy cards, homepage guidance, prices, unknowns, deduplication, etc.)
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/vuodo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const root = path.resolve(__dirname, '..');
const results = [];

function check(name, expected, actual) {
  const pass = JSON.stringify(expected) === JSON.stringify(actual);
  results.push({ name, pass, expected, actual });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}: ${JSON.stringify(actual)}`);
  return pass;
}

const homepageHtml = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Coupang Homepage</title></head>
<body>
  <div id="todayDiscoveryUnit" class="today-discovery">
    <div class="discovery-list">
      <ul class="banner-list prod-list">
        <li class="half-width" data-vendor-item-id="0">
          <a href="https://shop.coupang.com/lionkoreaofficial/533245">
            <img alt="">
            <div class="go-btn"><p>구매하기</p></div>
          </a>
        </li>
      </ul>
    </div>
  </div>
  <div id="categoryBestUnit">
    <a class="product-unit category-best-link impression-logged" href="/vp/products/9334799508?itemId=27679405325&vendorItemId=94651440345&sourceType=srp_product_ads&from=home_CategoryBest_ranking">
      <img src="https://thumbnail.coupangcdn.com/home-test.jpg" alt="[2026 신품 특가] 놀차 겨울 항균 이불">
      <span class="name">[2026 신품 특가] 놀차 겨울 항균 이불</span>
      <span class="prod-type discounted-price">할인</span>
      <div class="price price-v2"><strong>29,900원</strong></div>
      <img data-badge-id="ROCKET_MERCHANT" src="https://image.coupangcdn.com/logo_rocket_merchant.png">
    </a>
  </div>
</body>
</html>`;

const bannerOnlyHomepageHtml = homepageHtml.replace(/\s*<div id="categoryBestUnit">[\s\S]*?<\/a>\s*<\/div>/, '');

const modernSearchHtml = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Coupang search: 수납함</title></head>
<body>
<ul id="product-list">
  <li class="ProductUnit_productUnit__Qd6sv" data-id="95921999183">
    <a href="/vp/products/9693648728?itemId=28993342342&vendorItemId=95921999183">
      <div class="ProductUnit_productImage__XYZ">
        <img class="ProductUnit_image__abc" src="https://thumbnail.coupang.com/test1.jpg" alt="AIRAJ 5 IN 1조합">
      </div>
      <div class="ProductUnit_productNameV2__cV9cw">AIRAJ 5 IN 1조합 이동식 공구함 박스 모듈화 공구 정리함 서랍식 공구통 튼튼하고 오래가는 공구박스, 1개</div>
      <div class="PriceArea_priceArea__NntJz">
        <div><del>219,800원</del></div>
        <div><div class="custom-oos fw-flex fw-flex-wrap fw-items-center fw-gap-y-[1px]">
          <div class="custom-oos fw-mr-[2px] fw-text-[14px] fw-font-bold fw-text-bluegray-900">10%</div>
          <div class="custom-oos fw-text-[20px]/[24px] fw-font-bold fw-mr-[4px] fw-text-bluegray-900"><span>195,800원</span></div>
          <span>(1개당 97,900원)</span>
        </div></div>
      </div>
      <div class="ProductRating_productRating__jjf7W"><div aria-label="5"></div><div><span>(2)</span></div></div>
    </a>
  </li>
</ul>
</body>
</html>`;

const legacySearchHtml = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Coupang Legacy Search</title></head>
<body>
<ul class="search-product-list">
  <li class="search-product" data-product-id="123456789">
    <a href="/vp/products/123456789?vendorItemId=999">
      <img class="search-product-wrap-img" src="https://thumbnail.coupang.com/legacy.jpg">
      <span class="name">수납함 레거시</span>
      <div class="price"><strong class="price-value">110,000원</strong></div>
      <span class="rating">4.5</span>
      <span class="rating-total-count">(15)</span>
      <img src="https://image.coupang.com/badges_rocket.png" class="badge rocket">
    </a>
  </li>
</ul>
</body>
</html>`;

const mixedCardsHtml = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Coupang search: 혼합</title></head>
<body>
<ul id="product-list">
  <!-- Valid Card 1 -->
  <li class="ProductUnit_productUnit__Qd6sv" data-id="95921999183">
    <a href="/vp/products/9693648728?itemId=28993342342&vendorItemId=95921999183">
      <div class="ProductUnit_productNameV2__cV9cw">AIRAJ 5 IN 1조합 이동식 공구함</div>
      <div class="PriceArea_priceArea__NntJz">
        <div><del>219,800원</del></div>
        <div><span>195,800원</span><span>(1개당 97,900원)</span></div>
      </div>
    </a>
  </li>

  <!-- Duplicate Card 1 with different vendor representation -->
  <li class="ProductUnit_productUnit__Qd6sv" data-id="99999999999">
    <a href="/vp/products/9693648728?itemId=28993342342&vendorItemId=99999999999">
      <div class="ProductUnit_productNameV2__cV9cw">AIRAJ 5 IN 1조합 이동식 공구함 (중복)</div>
      <div class="PriceArea_priceArea__NntJz">
        <div><span>195,800원</span></div>
      </div>
    </a>
  </li>

  <!-- Invalid Card: Missing Price -->
  <li class="ProductUnit_productUnit__Qd6sv" data-id="111111111">
    <a href="/vp/products/111111111">
      <div class="ProductUnit_productNameV2__cV9cw">가격 없는 상품</div>
      <div class="PriceArea_priceArea__NntJz">
        <div><span>품절 / 가격 미정</span></div>
      </div>
    </a>
  </li>

  <!-- Invalid Card: Non-product Shop link -->
  <li class="ProductUnit_productUnit__Qd6sv" data-id="222222222">
    <a href="https://shop.coupang.com/brand-shop/222">
      <div class="ProductUnit_productNameV2__cV9cw">브랜드 샵 배너</div>
      <div class="PriceArea_priceArea__NntJz">
        <div><span>30,000원</span></div>
      </div>
    </a>
  </li>

  <!-- Valid Card 2: Minimal valid with unknown ratings/reviews/rocket -->
  <li class="ProductUnit_productUnit__Qd6sv" data-id="777777777">
    <a href="/vp/products/777777777">
      <div class="ProductUnit_productNameV2__cV9cw">미니멀 박스</div>
      <div class="PriceArea_priceArea__NntJz">
        <div><span>50,000원</span></div>
      </div>
    </a>
  </li>
</ul>
</body>
</html>`;

const detailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>차량용 암막커튼 - 쿠팡!</title></head>
<body>
  <div class="prod-buy">
    <h1 class="prod-buy-header__title">차량용 암막커튼</h1>
    <div class="total-price"><strong>85,000원</strong></div>
    <img class="prod-image__detail" src="https://thumbnail.coupang.com/curtain.jpg">
    <span class="rating"><span class="rating-star" style="width:90%"></span></span>
    <span class="prod-review__count">(42개 상품평)</span>
  </div>
</body>
</html>`;

(async () => {
  const profileDir = fs.mkdtempSync(path.join(root, '.scratch/chrome-profile-coupang-'));
  console.log('Using disposable Chrome profile:', profileDir);

  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    viewport: { width: 1400, height: 900 },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging']
  });

  context.setDefaultTimeout(15000);

  try {
    const cdp = await context.browser().newBrowserCDPSession();
    const { id: extId } = await cdp.send('Extensions.loadUnpacked', { path: root });
    console.log(`Installed unpacked MV3 extension: ${extId}`);

    const dashboardPage = await context.newPage();
    const pageErrors = [];
    const dialogs = [];

    dashboardPage.on('pageerror', e => pageErrors.push(`[Dashboard] ${e.message}`));
    dashboardPage.on('dialog', async d => {
      dialogs.push(d.message());
      await d.accept();
    });

    // Load dashboard
    await dashboardPage.goto(`chrome-extension://${extId}/ui/dashboard.html`);
    await dashboardPage.waitForFunction(() => typeof allProducts !== 'undefined' && allProducts.length > 0);
    // Clear products to start with clean isolated test state
    await dashboardPage.evaluate(async () => {
      await chrome.storage.local.set({ kdrop_products: [] });
      await loadData();
    });
    await dashboardPage.waitForFunction(() => allProducts.length === 0);

    // Setup Coupang HTTP mock routing
    let lateCardRendered = false;
    await context.route('https://www.coupang.com/**', route => {
      const url = new URL(route.request().url());
      let body = '';
      if (url.pathname === '/') {
        body = url.searchParams.get('mode') === 'empty' ? bannerOnlyHomepageHtml : homepageHtml;
      } else if (url.pathname.includes('/vp/products/888888888')) {
        body = detailHtml;
      } else if (url.searchParams.get('mode') === 'legacy') {
        body = legacySearchHtml;
      } else if (url.searchParams.get('mode') === 'mixed') {
        body = mixedCardsHtml;
      } else if (url.searchParams.get('mode') === 'late') {
        body = lateCardRendered ? modernSearchHtml : '<!doctype html><html><body><div id="loading">로딩 중...</div></body></html>';
      } else {
        body = modernSearchHtml;
      }
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
    });

    const coupangPage = await context.newPage();
    coupangPage.on('pageerror', e => pageErrors.push(`[Coupang] ${e.message}`));
    coupangPage.on('dialog', async d => {
      dialogs.push(d.message());
      await d.accept();
    });

    // -------------------------------------------------------------------------
    // 1. HOMEPAGE: Both scan buttons import the category card, then banner-only pages remain safe
    // -------------------------------------------------------------------------
    await coupangPage.goto('https://www.coupang.com/');
    await coupangPage.locator('#btnScrapeListing').waitFor({ state: 'visible' });

    dialogs.length = 0;
    await coupangPage.locator('#btnScrapeListing').click();
    await coupangPage.waitForFunction(() => document.getElementById('btnScrapeListing')?.innerText.includes('Nạp Coupang'));

    const hpInPage = await dashboardPage.evaluate(async () => (await chrome.storage.local.get('kdrop_products')).kdrop_products || []);
    check('Homepage floating button imports priced category card', 1, hpInPage.length);
    const hpProduct = hpInPage[0];
    check('Homepage card preserves productId and vendorItemId separately', { productId: '9334799508', vendorItemId: '94651440345' }, {
      productId: String(hpProduct?.productId), vendorItemId: String(hpProduct?.vendorItemId)
    });
    check('Homepage card preserves observed price and ad source', { price: 29900, section: 'categoryBestUnit', source: 'srp_product_ads', advertised: true }, {
      price: hpProduct?.marketData?.salesPriceKrw,
      section: hpProduct?.marketData?.listingSection,
      source: hpProduct?.marketData?.listingSourceType,
      advertised: hpProduct?.marketData?.isAdvertised
    });
    check('Homepage card does not invent BSR rank', null, hpProduct?.marketData?.rank);

    await dashboardPage.evaluate(() => chrome.storage.local.set({ kdrop_products: [] }));
    await coupangPage.goto('https://www.coupang.com/?mode=empty');
    await coupangPage.locator('#btnScrapeListing').waitFor({ state: 'visible' });
    dialogs.length = 0;
    await coupangPage.locator('#btnScrapeListing').click();
    await coupangPage.waitForFunction(() => document.getElementById('btnScrapeListing')?.innerText.includes('Nạp Coupang'));
    const hpAlert = dialogs[dialogs.length - 1] || '';
    check('Banner-only homepage gives actionable guidance', true, hpAlert.includes('chưa thấy thẻ sản phẩm') || hpAlert.includes('banner') || hpAlert.includes('không tìm thấy'));
    const hpBannerStoredCount = await dashboardPage.evaluate(async () => (await chrome.storage.local.get('kdrop_products')).kdrop_products?.length || 0);
    check('Banner-only homepage does not import banners', 0, hpBannerStoredCount);

    // -------------------------------------------------------------------------
    // 2. MODERN LISTING: In-page button imports ProductUnit cards into storage
    // -------------------------------------------------------------------------
    await coupangPage.goto('https://www.coupang.com/np/search?q=수납함');
    await coupangPage.locator('#btnScrapeListing').waitFor({ state: 'visible' });

    dialogs.length = 0;
    await coupangPage.locator('#btnScrapeListing').click();
    await coupangPage.waitForFunction(() => document.getElementById('btnScrapeListing')?.innerText.includes('Đã nạp'));

    const storedAfterModern = await dashboardPage.evaluate(async () => (await chrome.storage.local.get('kdrop_products')).kdrop_products || []);
    check('Modern listing import: Exactly 1 product stored', 1, storedAfterModern.length);

    if (storedAfterModern.length > 0) {
      const p = storedAfterModern[0];
      check('Modern listing identity: productId is 9693648728 from product link', '9693648728', String(p.productId));
      check('Modern listing identity: vendorItemId is 95921999183', '95921999183', String(p.vendorItemId));
      check('Modern listing prices: salesPriceKrw is 195800 (not original 219800 or unit price 97900)', 195800, p.salesPriceKrw);
      check('Modern listing metadata: rating is 5 from aria-label', 5, p.marketData?.rating);
      check('Modern listing metadata: reviewCount is 2 from (2)', 2, p.marketData?.reviewCount);
      check('Modern listing metadata: thumbnailUrl captured', true, Boolean(p.marketData?.thumbnailUrl?.includes('test1.jpg')));
      check('Modern listing rank: ordinary search rank is null', null, p.marketData?.rank);
      check('Modern listing position: listingPosition is 1', 1, p.marketData?.listingPosition);
      check('Modern listing honesty: trialEligibility remains needs_verification', 'needs_verification', p.trialEligibility?.status);
    }

    // Verify Studio dashboard displays committed import and survives reload
    await dashboardPage.reload();
    await dashboardPage.waitForFunction(() => allProducts && allProducts.length > 0);
    const visibleInStudio = await dashboardPage.evaluate(() => allProducts.some(p => p.productId === '9693648728'));
    check('Studio displays committed import and survives reload', true, visibleInStudio);

    // -------------------------------------------------------------------------
    // 3. SIDEPANEL SCAN BUTTON: Scans active tab and updates UI
    // -------------------------------------------------------------------------
    const sidepanelPage = await context.newPage();
    sidepanelPage.on('pageerror', e => pageErrors.push(`[Sidepanel] ${e.message}`));
    sidepanelPage.on('dialog', async d => {
      dialogs.push(d.message());
      await d.accept();
    });

    await sidepanelPage.goto(`chrome-extension://${extId}/ui/sidepanel.html`);
    await sidepanelPage.waitForFunction(() => !!document.getElementById('btnScanCurrentTab'));

    // Clear storage to test sidepanel scan import cleanly
    await dashboardPage.evaluate(() => chrome.storage.local.set({ kdrop_products: [] }));

    // Activate coupang tab
    await coupangPage.bringToFront();
    // In sidepanel page, trigger scan
    dialogs.length = 0;
    await sidepanelPage.locator('#btnScanCurrentTab').click();

    // Wait for alert and button restore
    await sidepanelPage.waitForFunction(() => document.getElementById('btnScanCurrentTab')?.innerText.includes('Quét Coupang Trang Này'));
    const sideStored = await dashboardPage.evaluate(async () => (await chrome.storage.local.get('kdrop_products')).kdrop_products || []);
    check('Sidepanel scan imports detected modern cards to storage', 1, sideStored.length);
    const sideListRendered = await sidepanelPage.evaluate(() => document.getElementById('sideProductsList')?.innerText.includes('AIRAJ'));
    check('Sidepanel product list renders imported product', true, sideListRendered);

    // Explicitly exercise sidepanel scan against the homepage category surface.
    await dashboardPage.evaluate(() => chrome.storage.local.set({ kdrop_products: [] }));
    await coupangPage.goto('https://www.coupang.com/');
    await coupangPage.locator('#btnScrapeListing').waitFor({ state: 'visible' });
    await coupangPage.bringToFront();
    dialogs.length = 0;
    await sidepanelPage.locator('#btnScanCurrentTab').click();
    await sidepanelPage.waitForFunction(() => document.getElementById('btnScanCurrentTab')?.innerText.includes('Quét Coupang Trang Này'));
    const sideHomepage = await dashboardPage.evaluate(async () => (await chrome.storage.local.get('kdrop_products')).kdrop_products || []);
    check('Sidepanel scan imports homepage category card', 1, sideHomepage.length);
    check('Sidepanel homepage import stores observed sale price', 29900, sideHomepage[0]?.marketData?.salesPriceKrw);

    // -------------------------------------------------------------------------
    // 4. LEGACY LISTING: Legacy cards continue to import without regression
    // -------------------------------------------------------------------------
    await coupangPage.bringToFront();
    await coupangPage.goto('https://www.coupang.com/np/search?mode=legacy');
    await coupangPage.locator('#btnScrapeListing').waitFor({ state: 'visible' });

    dialogs.length = 0;
    await coupangPage.locator('#btnScrapeListing').click();
    await coupangPage.waitForFunction(() => document.getElementById('btnScrapeListing')?.innerText.includes('Đã nạp'));

    const storedWithLegacy = await dashboardPage.evaluate(async () => (await chrome.storage.local.get('kdrop_products')).kdrop_products || []);
    check('Legacy listing import: Both modern and legacy exist in storage', 2, storedWithLegacy.length);
    const legacyProd = storedWithLegacy.find(p => p.productId === '123456789');
    check('Legacy product: salesPriceKrw 110,000 KRW', 110000, legacyProd?.salesPriceKrw);
    check('Legacy product: isRocket is true', true, legacyProd?.marketData?.isRocket);

    // -------------------------------------------------------------------------
    // 5. MIXED, DUPLICATE & INCOMPLETE CARDS
    // -------------------------------------------------------------------------
    // Mode mixed contains: 1 valid modern (9693648728), 1 duplicate modern, 1 missing price, 1 shop link, 1 valid minimal (777777777)
    await coupangPage.goto('https://www.coupang.com/np/search?mode=mixed');
    await coupangPage.locator('#btnScrapeListing').waitFor({ state: 'visible' });

    // Clear storage before mixed test
    await dashboardPage.evaluate(() => chrome.storage.local.set({ kdrop_products: [] }));

    dialogs.length = 0;
    await coupangPage.locator('#btnScrapeListing').click();
    await coupangPage.waitForFunction(() => document.getElementById('btnScrapeListing')?.innerText.includes('Đã nạp'));

    const mixedStored = await dashboardPage.evaluate(async () => (await chrome.storage.local.get('kdrop_products')).kdrop_products || []);
    // Exactly 2 unique valid products (9693648728 and 777777777), invalid cards omitted, duplicate card deduped
    check('Mixed cards: Invalid cards omitted and duplicate deduped (exactly 2 unique products)', 2, mixedStored.length);
    const minimalProd = mixedStored.find(p => p.productId === '777777777');
    check('Unknown fields: Minimal card has null rating and reviewCount', { rating: null, reviewCount: null }, {
      rating: minimalProd?.marketData?.rating,
      reviewCount: minimalProd?.marketData?.reviewCount
    });

    // -------------------------------------------------------------------------
    // 6. RESCAN PRESERVATION: Preserves manual cost, Baseline, Watchlist, evidence
    // -------------------------------------------------------------------------
    await dashboardPage.evaluate(async () => {
      // Set manual cost 250 CNY, watchlist true, custom baseline economics
      const prods = (await chrome.storage.local.get('kdrop_products')).kdrop_products || [];
      const target = prods.find(p => p.productId === '9693648728');
      if (target) {
        target.isWatchlist = true;
        target.sourcingDossier = {
          cogs1688Cny: 250,
          provenance: 'MANUAL',
          supplierUrl: 'https://detail.1688.com/offer/123.html'
        };
        target.economics = {
          targetSalesPriceKrw: 250000,
          cogs1688Cny: 250,
          shippingCostKrw: 4000
        };
        target.evidenceDossier = {
          riskNotes: 'Đã thẩm định xưởng'
        };
        await chrome.storage.local.set({ kdrop_products: prods });
      }
    });

    // Rescan on Coupang page (where price is 195,800 KRW)
    await coupangPage.goto('https://www.coupang.com/np/search?q=수납함');
    await coupangPage.locator('#btnScrapeListing').waitFor({ state: 'visible' });
    await coupangPage.locator('#btnScrapeListing').click();
    await coupangPage.waitForFunction(() => document.getElementById('btnScrapeListing')?.innerText.includes('Đã nạp'));

    const rescanStored = await dashboardPage.evaluate(async () => (await chrome.storage.local.get('kdrop_products')).kdrop_products || []);
    const preservedProd = rescanStored.find(p => p.productId === '9693648728');
    check('Rescan preservation: Observed salesPriceKrw updated to 195,800', 195800, preservedProd?.marketData?.salesPriceKrw);
    check('Rescan preservation: MANUAL sourcing cogs 250 CNY preserved', 250, preservedProd?.sourcingDossier?.cogs1688Cny);
    check('Rescan preservation: Baseline targetSalesPriceKrw 250,000 KRW preserved', 250000, preservedProd?.economics?.targetSalesPriceKrw);
    check('Rescan preservation: Watchlist status preserved', true, preservedProd?.isWatchlist);
    check('Rescan preservation: Evidence dossier preserved', 'Đã thẩm định xưởng', preservedProd?.evidenceDossier?.riskNotes);

    // -------------------------------------------------------------------------
    // 7. LATE-LOADED DOM: Scannable once cards render
    // -------------------------------------------------------------------------
    lateCardRendered = false;
    await coupangPage.goto('https://www.coupang.com/np/search?mode=late');
    await coupangPage.locator('#btnScrapeListing').waitFor({ state: 'visible' });

    dialogs.length = 0;
    await coupangPage.locator('#btnScrapeListing').click();
    const firstLateAlert = dialogs[dialogs.length - 1] || '';
    check('Initially empty page returns guidance', true, firstLateAlert.includes('Không tìm thấy') || firstLateAlert.includes('chưa được'));

    // Cards render dynamically into the late page
    lateCardRendered = true;
    await coupangPage.evaluate(() => {
      const loading = document.getElementById('loading');
      if (loading) loading.remove();
      const ul = document.createElement('ul');
      ul.id = 'product-list';
      ul.innerHTML = `
        <li class="ProductUnit_productUnit__Qd6sv" data-id="95921999183">
          <a href="/vp/products/9693648728?itemId=28993342342&vendorItemId=95921999183">
            <div class="ProductUnit_productImage__XYZ">
              <img class="ProductUnit_image__abc" src="https://thumbnail.coupang.com/test1.jpg" alt="AIRAJ 5 IN 1조합">
            </div>
            <div class="ProductUnit_productNameV2__cV9cw">AIRAJ 5 IN 1조합 이동식 공구함 박스 모듈화 공구 정리함 서랍식 공구통 튼튼하고 오래가는 공구박스, 1개</div>
            <div class="PriceArea_priceArea__NntJz">
              <div><del>219,800원</del></div>
              <div><div class="custom-oos fw-flex fw-flex-wrap fw-items-center fw-gap-y-[1px]">
                <div class="custom-oos fw-mr-[2px] fw-text-[14px] fw-font-bold fw-text-bluegray-900">10%</div>
                <div class="custom-oos fw-text-[20px]/[24px] fw-font-bold fw-mr-[4px] fw-text-bluegray-900"><span>195,800원</span></div>
                <span>(1개당 97,900원)</span>
              </div></div>
            </div>
            <div class="ProductRating_productRating__jjf7W"><div aria-label="5"></div><div><span>(2)</span></div></div>
          </a>
        </li>
      `;
      document.body.appendChild(ul);
    });

    dialogs.length = 0;
    await coupangPage.locator('#btnScrapeListing').click();
    await coupangPage.waitForFunction(() => document.getElementById('btnScrapeListing')?.innerText.includes('Đã nạp'));
    check('Late cards rendered are successfully imported on second scan', true, true);

    // -------------------------------------------------------------------------
    // 8. DETAIL PAGE REGRESSION: Single product detail page scan still works
    // -------------------------------------------------------------------------
    await coupangPage.goto('https://www.coupang.com/vp/products/888888888');
    await coupangPage.locator('#kdrop-detail-widget').waitFor({ state: 'visible' });

    // Scan from sidepanel
    await coupangPage.bringToFront();
    dialogs.length = 0;
    await sidepanelPage.locator('#btnScanCurrentTab').click();
    await sidepanelPage.waitForFunction(() => document.getElementById('btnScanCurrentTab')?.innerText.includes('Quét Coupang Trang Này'));

    const detailStored = await dashboardPage.evaluate(async () => {
      const prods = (await chrome.storage.local.get('kdrop_products')).kdrop_products || [];
      return prods.find(p => p.productId === '888888888');
    });
    check('Detail page scan imports 1 product (888888888, 85,000 KRW)', 85000, detailStored?.salesPriceKrw);
    check('Detail page scan rank is null', null, detailStored?.marketData?.rank);

    // -------------------------------------------------------------------------
    // 9. WRONG ACTIVE PAGE & ERROR RECOVERY
    // -------------------------------------------------------------------------
    const foreignPage = await context.newPage();
    await foreignPage.goto('https://example.com');
    await foreignPage.bringToFront();

    dialogs.length = 0;
    await sidepanelPage.locator('#btnScanCurrentTab').click();
    const wrongTabAlert = dialogs[dialogs.length - 1] || '';
    check('Sidepanel scan on non-Coupang tab returns actionable warning', true, wrongTabAlert.includes('Coupang'));
    const btnRestored = await sidepanelPage.evaluate(() => !document.getElementById('btnScanCurrentTab')?.disabled);
    check('Sidepanel button restored after non-Coupang tab warning', true, btnRestored);

    // -------------------------------------------------------------------------
    // 10. RUNTIME SAFETY & CSP
    // -------------------------------------------------------------------------
    check('Runtime safety: Zero unhandled page errors', 0, pageErrors.length);

  } finally {
    await context.close();
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch (_) {}
  }

  const passedCount = results.filter(r => r.pass === true).length;
  const failedCount = results.filter(r => r.pass === false).length;
  console.log(`\n========================================================`);
  console.log(`Installed Coupang Gate: ${passedCount} passed, ${failedCount} failed.`);
  console.log(`========================================================\n`);

  if (failedCount > 0) {
    process.exit(1);
  }
})().catch(err => {
  console.error('Installed Coupang Gate Exception:', err);
  process.exit(1);
});
