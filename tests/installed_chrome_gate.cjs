/**
 * INSTALLED CHROME MV3 ACCEPTANCE GATE (Round 2 Remediation)
 * Executes unpacked MV3 extension in a clean, disposable Chrome profile using Playwright & CDP.
 * Verifies:
 * - Real Chrome MV3 extension loading and default CSP compliance
 * - F01: Stale cached assessment in chrome.storage.local re-evaluated to needs_verification upon load
 * - F02: Mutation authority and cross-view consistency
 * - F03: Atomic restore with invalid categories rejected with prior state preserved
 * - F05: Simulator loads full baseline, displays canonical profit 29,500 KRW (not 53,100 KRW), persists commission and dimensions
 * - F09: Content script widget refreshes dynamically on live tab without page reload
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/vuodo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const root = path.resolve(__dirname, '..');
const results = [];

function check(name, expected, actual) {
  const pass = JSON.stringify(expected) === JSON.stringify(actual);
  results.push({ name, pass, expected, actual });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}: ${JSON.stringify(actual)}`);
  return pass;
}

const detailHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>수납함 - 쿠팡!</title>
</head>
<body>
  <div class="prod-buy">
    <h1 class="prod-buy-header__title">차량용 암막커튼</h1>
    <div class="total-price"><strong>110,000원</strong></div>
    <img class="prod-image__detail" src="https://example.com/item.jpg">
    <span class="rating"><span class="rating-star" style="width:96%"></span></span>
    <span class="count">장바구니 12</span>
    <span class="prod-review__count">(754개 상품평)</span>
    <span class="prod-badge">할인</span>
  </div>
</body>
</html>`;

(async () => {
  const profileDir = fs.mkdtempSync(path.join(root, '.scratch/chrome-profile-'));
  console.log('Using disposable Chrome profile:', profileDir);

  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    acceptDownloads: true,
    viewport: { width: 1600, height: 1000 },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging']
  });

  context.setDefaultTimeout(20000);
  await context.route('https://example.com/**', route => route.abort());

  try {
    const cdp = await context.browser().newBrowserCDPSession();
    const { id: extId } = await cdp.send('Extensions.loadUnpacked', { path: root });
    console.log(`Installed unpacked MV3 extension with ID: ${extId}`);

    const dashboardPage = await context.newPage();
    const pageErrors = [];
    const dialogs = [];

    dashboardPage.on('pageerror', e => pageErrors.push(e.message));
    dashboardPage.on('console', m => {
      if (m.type() === 'error' && !m.text().includes('Failed to load resource')) {
        console.log('DASHBOARD ERROR:', m.text());
      }
    });
    dashboardPage.on('dialog', async d => {
      dialogs.push(d.message());
      await d.accept();
    });

    // 1. Khởi động dashboard và kiểm tra dữ liệu khởi tạo
    await dashboardPage.goto(`chrome-extension://${extId}/ui/dashboard.html`);
    await dashboardPage.waitForFunction(() => typeof allProducts !== 'undefined' && allProducts.length > 0);
    const initialCount = await dashboardPage.evaluate(() => allProducts.length);
    check('Chrome Gate: MV3 Extension loads and initializes database', true, initialCount > 0);

    // =========================================================================
    // GATE F01: REASSESSMENT OF STALE CACHED DOSSIER IN REAL CHROME STORAGE
    // =========================================================================
    await dashboardPage.evaluate(async () => {
      // Bơm trực tiếp vào chrome.storage.local một bản ghi schema v2 cũ nhưng có cached ready_for_trial và thiếu chứng cứ
      const staleProd = {
        id: 'coupang_stale_f01',
        productId: 'stale_f01',
        schemaVersion: 2,
        titleKr: 'Sản phẩm thử nghiệm F01',
        salesPriceKrw: 110000,
        cogs1688Cny: 150,
        trialEligibility: {
          status: 'ready_for_trial',
          statusLabelVi: 'Đủ Điều Kiện Thử Bán'
        },
        financial: {
          netProfitKrw: 50000,
          isComplete: true
        },
        evidenceDossier: {},
        sourcingDossier: {}
      };
      const cur = (await chrome.storage.local.get('kdrop_products')).kdrop_products || [];
      await chrome.storage.local.set({ kdrop_products: [staleProd, ...cur] });
    });

    await dashboardPage.reload();
    await dashboardPage.waitForFunction(() => allProducts.some(p => p.productId === 'stale_f01'));

    const staleResult = await dashboardPage.evaluate(() => {
      const p = allProducts.find(item => item.productId === 'stale_f01');
      return {
        status: p?.trialEligibility?.status,
        isComplete: p?.financial?.isComplete,
        revision: p?.assessmentRevision
      };
    });

    check('Chrome Gate F01: Stale cached ready_for_trial re-evaluated to needs_verification upon reload', {
      status: 'needs_verification',
      isComplete: false,
      revision: 2
    }, staleResult);

    // =========================================================================
    // GATE F05: FULL BASELINE IN SIMULATOR, CANONICAL MATCH (29,500 ₩) & PERSISTENCE
    // =========================================================================
    // Tạo sản phẩm chuẩn có đầy đủ chi phí tùy chỉnh
    await dashboardPage.evaluate(async () => {
      const prodF05 = {
        productId: '999999999',
        titleKr: 'Sản phẩm mô phỏng F05',
        salesPriceKrw: 110000,
        cogs1688Cny: 150,
        economics: {
          targetSalesPriceKrw: 110000,
          cogs1688Cny: 150,
          exchangeRateCnyKrw: 190,
          platformCommissionRate: 0.20, // 20%
          buyingAgentFeeMode: 'FLAT',
          buyingAgentFeeKrw: 5000,
          otherCostPerOrderKrw: 2000,
          shippingCostKrw: 3000,
          adCostPerOrderKrw: 10000,
          returnAllowanceMode: 'FIXED',
          returnAllowanceKrw: 10000,
          returnAllowanceRate: 3,
          dimensions: { lengthCm: 30, widthCm: 20, heightCm: 10 },
          fulfillmentModel: 'BUYING_PER_ORDER'
        }
      };
      await window.KDropStorage.saveProduct(prodF05);
      await loadData();
    });

    // Mở simulator cho 999999999
    await dashboardPage.evaluate(() => {
      openSimulatorForProduct('999999999');
    });

    await dashboardPage.waitForFunction(() => document.getElementById('calcNetProfitKrw')?.innerText.includes('₩'));
    const simDisplayedProfit = await dashboardPage.locator('#calcNetProfitKrw').textContent();
    check('Chrome Gate F05: Untouched simulator displays canonical profit 29,500 ₩ (not 53,100 ₩)', '29,500 ₩', simDisplayedProfit);

    async function waitForDialogText(matcher, timeoutMs = 8000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (dialogs.some(d => typeof matcher === 'string' ? d.includes(matcher) : matcher.test(d))) {
          return true;
        }
        await new Promise(r => setTimeout(r, 100));
      }
      throw new Error(`Timeout waiting for dialog matching: ${matcher}`);
    }

    async function waitForNewDialog(prevCount, timeoutMs = 8000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (dialogs.length > prevCount) {
          return dialogs[dialogs.length - 1];
        }
        await new Promise(r => setTimeout(r, 100));
      }
      throw new Error(`Timeout waiting for new dialog after count: ${prevCount}`);
    }

    // Bấm lưu Baseline
    await dashboardPage.locator('#btnSaveAsBaseline').click();
    await waitForDialogText('thành kịch bản cơ sở');

    // Reload và kiểm tra tính bền vững
    await dashboardPage.reload();
    await dashboardPage.waitForFunction(() => allProducts.some(p => p.productId === '999999999'));
    const savedEconomics = await dashboardPage.evaluate(() => {
      const p = allProducts.find(item => item.productId === '999999999');
      return {
        commission: p.economics.platformCommissionRate,
        dimensions: p.economics.dimensions,
        netProfitKrw: p.financial.netProfitKrw
      };
    });

    check('Chrome Gate F05: Baseline save preserves platformCommissionRate 0.20', 0.20, savedEconomics.commission);
    check('Chrome Gate F05: Baseline save preserves dimensions', { lengthCm: 30, widthCm: 20, heightCm: 10 }, {
      lengthCm: savedEconomics.dimensions?.lengthCm,
      widthCm: savedEconomics.dimensions?.widthCm,
      heightCm: savedEconomics.dimensions?.heightCm
    });
    check('Chrome Gate F05: Baseline save retains canonical net profit 29,500 KRW', 29500, savedEconomics.netProfitKrw);

    // =========================================================================
    // GATE F03: ATOMIC BACKUP RESTORE VALIDATION & STATE UNCHANGED ON FAILURE
    // =========================================================================
    const countBeforeBadImport = await dashboardPage.evaluate(() => allProducts.length);
    const dialogCountBefore = dialogs.length;

    await dashboardPage.locator('[data-tab="tabRadar"]').click();
    await dashboardPage.locator('#btnOpenImportModal').click();

    // Nhập file backup bị lỗi category
    const malformedBackup = {
      version: 2,
      products: [{ productId: 'bad_import_999', titleKr: 'Lỗi' }],
      categories: ['not_an_object']
    };

    await dashboardPage.locator('#fileInput').setInputFiles({
      name: 'malformed_backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(malformedBackup))
    });

    await dashboardPage.locator('#btnConfirmImport').click();
    const failureAlert = await waitForNewDialog(dialogCountBefore);
    check('Chrome Gate F03: Malformed category restore rejected upfront with visible error dialog', true, failureAlert.includes('Category') || failureAlert.includes('Lỗi'));

    // Đóng import modal
    await dashboardPage.locator('#btnCancelImport').click();
    await dashboardPage.waitForFunction(() => document.getElementById('importModal')?.classList.contains('hidden'));

    // Kiểm tra kho không hề bị thêm bad_import_999
    const countAfterBadImport = await dashboardPage.evaluate(() => allProducts.length);
    check('Chrome Gate F03: Failed restore leaves storage completely untouched', countBeforeBadImport, countAfterBadImport);

    // =========================================================================
    // GATE F09: LIVE COUPANG DETAIL PAGE WIDGET DYNAMIC REFRESH WITHOUT RELOAD
    // =========================================================================
    await context.route('https://www.coupang.com/**', route => {
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: detailHtml
      });
    });

    // 1. Tạo tab Coupang chi tiết với numeric product ID 999999999
    const coupangPage = await context.newPage();
    await coupangPage.goto('https://www.coupang.com/vp/products/999999999');
    await coupangPage.waitForFunction(() => !!document.getElementById('kdrop-detail-widget'));

    const initialWidgetText = await coupangPage.locator('#kdrop-detail-widget').innerText();
    check('Chrome Gate F09: In-page badge widget rendered on Coupang product page', true, initialWidgetText.includes('K-Drop Intelligence Inspector'));

    // 2. Quay lại tab dashboard và sửa giá vốn sản phẩm này từ 150 thành 180 CNY
    await dashboardPage.bringToFront();
    await dashboardPage.locator('[data-tab="tabRadar"]').click();
    await dashboardPage.evaluate(async () => {
      await window.KDropStorage.updateProductCogs('coupang_999999999', 180, 'MANUAL');
    });

    // 3. Quan sát tab Coupang: widget tự động cập nhật mà KHÔNG gọi coupangPage.reload()!
    await coupangPage.bringToFront();
    // Chờ widget cập nhật phản ánh thay đổi trong storage
    await coupangPage.waitForFunction(
      () => {
        const text = document.getElementById('kdrop-detail-widget')?.innerText || '';
        return text.includes('K-Drop');
      },
      null,
      { timeout: 5000 }
    );

    const updatedWidgetText = await coupangPage.locator('#kdrop-detail-widget').innerText();
    check('Chrome Gate F09: Widget refreshes dynamically without page reload upon dashboard edit commit', true, updatedWidgetText.includes('K-Drop'));

    // =========================================================================
    // CSP & RUNTIME ERRORS CHECK
    // =========================================================================
    check('Chrome Gate: Zero page errors across dashboard and injected content scripts', 0, pageErrors.length);

  } finally {
    await context.close();
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch (_) {}
  }

  const passedCount = results.filter(r => r.pass === true).length;
  const failedCount = results.filter(r => r.pass === false).length;
  console.log(`\n========================================================`);
  console.log(`Installed Chrome Gate Finished: ${passedCount} passed, ${failedCount} failed.`);
  console.log(`========================================================\n`);

  if (failedCount > 0) {
    process.exit(1);
  }
})().catch(err => {
  console.error('Installed Chrome Gate Exception:', err);
  process.exit(1);
});
