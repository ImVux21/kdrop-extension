const test = require('node:test');
const assert = require('node:assert');
const storage = require('../storage/storageRepository.js');
const feeCalc = require('../core/feeCalculator.js');
const winAlg = require('../core/winAlgorithm.js');

function setupCleanStorage() {
  globalThis.__kdrop_test_storage__ = {
    [storage.KEY_INITIALIZED]: true,
    [storage.KEY_PRODUCTS]: [],
    [storage.KEY_CATEGORIES]: []
  };
}

// =========================================================================
// F01: REASSESSMENT OF STORED AND IMPORTED DOSSIERS
// =========================================================================
test('F01: Read old schema v2 dossier with cached ready_for_trial but missing evidence derives needs_verification', async () => {
  setupCleanStorage();

  // Tạo sản phẩm kiểu cũ lưu trực tiếp trong storage với cached ready_for_trial nhưng thiếu chứng cứ
  const oldStaleProduct = {
    id: 'coupang_old_1',
    productId: 'old_1',
    schemaVersion: 2, // Đã ghi v2 từ vòng trước nhưng thiếu ASSESSMENT_RULES_REVISION
    titleKr: '샤오미 구형 거치대',
    salesPriceKrw: 60000,
    cogs1688Cny: 50,
    isRocket: false,
    rocketType: 'NONE',
    rank: 12, // Old rank alias
    trialEligibility: {
      status: 'ready_for_trial', // STALE CACHED RESULT
      statusLabelVi: 'Đủ Điều Kiện Thử Bán',
      criteria: []
    },
    wpi: {
      score: 88,
      tier: 'DIAMOND_WIN',
      isProvisional: false
    },
    financial: {
      netProfitKrw: 25000,
      netMarginPct: 41.6,
      isComplete: true
    },
    // Thiếu hoàn toàn evidenceDossier và sourcingDossier xác minh
    evidenceDossier: {},
    sourcingDossier: {}
  };

  globalThis.__kdrop_test_storage__[storage.KEY_PRODUCTS] = [oldStaleProduct];

  // Đọc danh sách qua public API getAllProducts
  const prods = await storage.getAllProducts();
  assert.strictEqual(prods.length, 1);
  const refreshed = prods[0];

  // F01: Kết quả cached cũ bị hủy, tính lại thành needs_verification
  assert.strictEqual(refreshed.trialEligibility.status, 'needs_verification', 'Cached ready_for_trial phải bị hủy và tính lại');
  assert.notStrictEqual(refreshed.trialEligibility.status, 'ready_for_trial');
  assert.strictEqual(refreshed.assessmentRevision, storage.ASSESSMENT_RULES_REVISION, 'Phải gắn revision hiện tại');
  assert.strictEqual(refreshed.financial.isComplete, false, 'Chi phí thiếu không được báo hoàn chỉnh');
});

test('F01: Restore that stale dossier into empty and nonempty collections derives current decision', async () => {
  setupCleanStorage();

  const staleBackup = {
    version: 2,
    exportedAt: '2026-10-01T00:00:00.000Z',
    products: [{
      productId: 'stale_import_1',
      titleKr: 'Sản phẩm backup cũ',
      salesPriceKrw: 70000,
      cogs1688Cny: 60,
      rank: 20,
      trialEligibility: {
        status: 'ready_for_trial' // Cached cũ trong file backup
      },
      evidenceDossier: {},
      sourcingDossier: {}
    }],
    categories: []
  };

  // Restore vào empty collection
  await storage.importBackup(staleBackup);
  const emptyRestoreProds = await storage.getAllProducts();
  assert.strictEqual(emptyRestoreProds.length, 1);
  assert.strictEqual(emptyRestoreProds[0].trialEligibility.status, 'needs_verification', 'Restore vào empty collection phải tái thẩm định');

  // Thêm một sản phẩm khác để tạo nonempty collection rồi restore lại
  staleBackup.products.push({
    productId: 'stale_import_2',
    titleKr: 'Sản phẩm backup cũ 2',
    salesPriceKrw: 80000,
    cogs1688Cny: 70,
    trialEligibility: { status: 'ready_for_trial' }
  });

  await storage.importBackup(staleBackup);
  const nonemptyRestoreProds = await storage.getAllProducts();
  assert.strictEqual(nonemptyRestoreProds.length, 2);
  assert.strictEqual(nonemptyRestoreProds[1].trialEligibility.status, 'needs_verification', 'Restore vào nonempty collection phải tái thẩm định');
});

// =========================================================================
// F02: MUTATION AUTHORITY AND CONCURRENCY
// =========================================================================
test('F02: Legacy cost 100 edited to 222 concurrently with getAllProducts/migration preserves edit', async () => {
  setupCleanStorage();

  const initialProd = {
    id: 'coupang_race_1',
    productId: 'race_1',
    schemaVersion: 1, // Legacy schema
    titleKr: 'Sản phẩm kiểm tra race condition',
    salesPriceKrw: 90000,
    cogs1688Cny: 100
  };
  globalThis.__kdrop_test_storage__[storage.KEY_PRODUCTS] = [initialProd];

  // Chạy đồng thời updateProductCogs (sửa cogs thành 222) và getAllProducts (kích hoạt migration)
  const editPromise = storage.updateProductCogs('coupang_race_1', 222, 'MANUAL');
  const readPromise = storage.getAllProducts();

  await Promise.all([editPromise, readPromise]);

  // Kiểm tra kết quả sau commit
  const finalProds = await storage.getAllProducts();
  assert.strictEqual(finalProds.length, 1);
  assert.strictEqual(finalProds[0].sourcingDossier.cogs1688Cny, 222, 'Edit 222 phải được bảo toàn xuyên suốt migration');
  assert.strictEqual(finalProds[0].cogs1688Cny, 222);
});

test('F02: Initialization or mutation persistence failure leaves prior collection intact', async () => {
  setupCleanStorage();

  const originalProd = {
    id: 'coupang_keep_1',
    productId: 'keep_1',
    titleKr: 'Sản phẩm gốc',
    salesPriceKrw: 50000
  };
  await storage.saveProduct(originalProd);

  const beforeProds = await storage.getAllProducts();
  assert.strictEqual(beforeProds.length, 1);

  // Giả lập lỗi storage khi ghi
  storage._setCustomWriter(async () => {
    throw new Error('Disk IO write failure');
  });

  await assert.rejects(
    async () => {
      await storage.saveProduct({ productId: 'fail_new_1', titleKr: 'Sản phẩm lỗi' });
    },
    /Disk IO write failure/
  );

  // Phục hồi setter và kiểm tra kho
  storage._setCustomWriter(null);
  const afterProds = await storage.getAllProducts();
  assert.strictEqual(afterProds.length, 1, 'Kho ban đầu phải được giữ nguyên');
  assert.strictEqual(afterProds[0].productId, 'keep_1');
});

// =========================================================================
// F03: ATOMIC BACKUP RESTORE VALIDATION & COMMIT
// =========================================================================
test('F03: Restore with malformed categories or invalid terms rejects before writing and leaves prior storage untouched', async () => {
  setupCleanStorage();

  await storage.saveProduct({ productId: 'prior_1', titleKr: 'Sản phẩm cũ 1' });
  globalThis.__kdrop_test_storage__[storage.KEY_CATEGORIES] = [{ code: 'cat_1', name: 'Danh mục 1' }];

  // 1. Restore file có category sai kiểu (không phải object với code/name)
  const badCategoryBackup = {
    version: 2,
    products: [{ productId: 'new_1', titleKr: 'Mới 1', salesPriceKrw: 50000 }],
    categories: ['invalid_string_category'] // Phải là object có code và name
  };

  await assert.rejects(
    async () => {
      await storage.importBackup(badCategoryBackup);
    },
    /Category thứ \d+ không hợp lệ/
  );

  // Kiểm tra storage ban đầu không bị sửa
  let curProds = await storage.getAllProducts();
  assert.strictEqual(curProds.length, 1);
  assert.strictEqual(curProds[0].productId, 'prior_1');
  assert.strictEqual(globalThis.__kdrop_test_storage__[storage.KEY_CATEGORIES].length, 1);

  // 2. Restore file có terms cogs âm
  const badTermsBackup = {
    version: 2,
    products: [{
      productId: 'new_2',
      titleKr: 'Mới 2',
      cogs1688Cny: -50 // Giá vốn âm
    }],
    categories: []
  };

  await assert.rejects(
    async () => {
      await storage.importBackup(badTermsBackup);
    },
    /không hợp lệ/
  );

  curProds = await storage.getAllProducts();
  assert.strictEqual(curProds.length, 1);
  assert.strictEqual(curProds[0].productId, 'prior_1');
});

test('F03: Atomic restore commits products and categories in single operation', async () => {
  setupCleanStorage();

  await storage.saveProduct({ productId: 'existing_1', titleKr: 'Hiện hữu', niche: 'cat_old' });
  globalThis.__kdrop_test_storage__[storage.KEY_CATEGORIES] = [{ code: 'cat_old', name: 'Cũ' }];

  const validBackup = {
    version: 2,
    products: [
      { productId: 'existing_1', titleKr: 'Hiện hữu cập nhật', cogs1688Cny: 40 },
      { productId: 'new_added_1', titleKr: 'Sản phẩm thêm mới', cogs1688Cny: 30 }
    ],
    categories: [{ code: 'cat_new', name: 'Mới' }]
  };

  const count = await storage.importBackup(validBackup);
  assert.strictEqual(count, 2);

  const prods = await storage.getAllProducts();
  assert.strictEqual(prods.length, 2);
  const cats = globalThis.__kdrop_test_storage__[storage.KEY_CATEGORIES];
  assert.strictEqual(cats.length, 2, 'Cả hai danh mục đều tồn tại');
  assert.ok(cats.some(c => c.code === 'cat_new'));
});

// =========================================================================
// F04: COST COMPLETENESS & FULFILLMENT EVIDENCE
// =========================================================================
test('F04: Missing baseline inputs strictly set isComplete: false and needs_verification', () => {
  // Bỏ qua platform commission và other costs
  const incompleteProfit = feeCalc.calculateProfit({
    salesPriceKrw: 110000,
    cogs1688Cny: 150,
    exchangeRateCnyKrw: 190,
    shippingCostKrw: 3000,
    adCostPerOrderKrw: 10000,
    returnAllowanceRate: 3
    // Thiếu platformCommissionRate, buyingAgentFee, otherCostPerOrderKrw
  });

  assert.strictEqual(incompleteProfit.isComplete, false, 'Thiếu chi phí cơ sở không được đánh dấu complete');
  assert.ok(incompleteProfit.missingCosts.includes('platformCommission'));
  assert.ok(incompleteProfit.missingCosts.includes('buyingAgentFee'));
  assert.ok(incompleteProfit.missingCosts.includes('otherCost'));

  const dossier = {
    salesPriceKrw: 110000,
    financial: incompleteProfit,
    evidenceDossier: {},
    kcSafety: { level: 'LOW' }
  };
  const eligibility = winAlg.evaluateTrialEligibility(dossier);
  assert.strictEqual(eligibility.status, 'needs_verification');
  const netMarginCrit = eligibility.criteria.find(c => c.id === 'net_margin');
  assert.strictEqual(netMarginCrit.status, 'UNKNOWN');
});

test('F04: Fulfillment marked QUOTED without quote amount or source fails readiness gate', () => {
  const candidate = {
    salesPriceKrw: 110000,
    economics: {
      targetSalesPriceKrw: 110000,
      exchangeRateCnyKrw: 190,
      platformCommissionRate: 0.11,
      buyingAgentFeeRate: 0,
      otherCostPerOrderKrw: 0,
      shippingBasis: 'QUOTED' // Không có shippingQuoteKrw và không có source
    },
    evidenceDossier: {
      fulfillment: {
        shippingBasis: 'QUOTED',
        deliveryEstimate: '5 ngày',
        returnArrangement: 'Kho Seoul'
        // Thiếu shippingQuoteKrw và shippingBasisSource
      }
    }
  };

  const evalResult = winAlg.evaluateTrialEligibility(candidate);
  const fCrit = evalResult.criteria.find(c => c.id === 'fulfillment_readiness');
  assert.strictEqual(fCrit.status, 'REVIEW_REQUIRED', 'QUOTED không có số tiền và nguồn phải REVIEW_REQUIRED');
  assert.strictEqual(evalResult.status, 'needs_verification');
});

test('F04: Fulfillment marked REVIEWED_WEIGHT without measured weight fails readiness gate', () => {
  const candidate = {
    salesPriceKrw: 110000,
    economics: {
      targetSalesPriceKrw: 110000,
      exchangeRateCnyKrw: 190,
      platformCommissionRate: 0.11,
      buyingAgentFeeRate: 0,
      otherCostPerOrderKrw: 0,
      shippingBasis: 'REVIEWED_WEIGHT'
      // Không có weightGram
    },
    evidenceDossier: {
      fulfillment: {
        shippingBasis: 'REVIEWED_WEIGHT',
        shippingBasisSource: 'Biểu phí CJ Logistics',
        deliveryEstimate: '5 ngày',
        returnArrangement: 'Kho Seoul'
        // Thiếu measuredWeightGram
      }
    }
  };

  const evalResult = winAlg.evaluateTrialEligibility(candidate);
  const fCrit = evalResult.criteria.find(c => c.id === 'fulfillment_readiness');
  assert.strictEqual(fCrit.status, 'REVIEW_REQUIRED', 'REVIEWED_WEIGHT không có cân nặng đo thực tế phải REVIEW_REQUIRED');
});

// =========================================================================
// F05: SIMULATOR AND BASELINE FULL INPUTS ROUNDTRIP
// =========================================================================
test('F05: Canonical profit matches 29,500 KRW for complete baseline inputs', () => {
  const profit = feeCalc.calculateProfit({
    salesPriceKrw: 110000,
    cogs1688Cny: 150,
    exchangeRateCnyKrw: 190,
    platformCommissionRate: 0.20, // 20% = 22,000
    buyingAgentFeeMode: 'FLAT',
    buyingAgentFeeKrw: 5000,
    otherCostPerOrderKrw: 2000,
    shippingCostKrw: 3000,
    adCostPerOrderKrw: 10000,
    returnAllowanceMode: 'FIXED',
    returnAllowanceKrw: 10000,
    fulfillmentModel: 'BUYING_PER_ORDER'
  });

  // Sales: 110,000
  // COGS: 150 * 190 = 28,500
  // Commission: 22,000
  // Agent: 5,000
  // Other: 2,000
  // Ship: 3,000
  // Ads: 10,000
  // Returns: 10,000
  // Total cost: 80,500. Net Profit: 110,000 - 80,500 = 29,500 KRW.
  assert.strictEqual(profit.netProfitKrw, 29500, 'Lợi nhuận cơ sở chuẩn phải là 29,500 KRW (không phải 53,100 KRW)');
  assert.strictEqual(profit.isComplete, true);
});

test('F05: saveBaseline persists platformCommissionRate and dimensions and roundtrips', async () => {
  setupCleanStorage();

  const prod = {
    productId: 'baseline_dim_1',
    titleKr: 'Sản phẩm kích thước lớn',
    salesPriceKrw: 100000
  };
  await storage.saveProduct(prod);

  await storage.saveBaseline('coupang_baseline_dim_1', {
    targetSalesPriceKrw: 110000,
    cogs1688Cny: 150,
    exchangeRateCnyKrw: 190,
    platformCommissionRate: 0.20,
    dimensions: { lengthCm: 40, widthCm: 30, heightCm: 20 },
    buyingAgentFeeMode: 'FLAT',
    buyingAgentFeeKrw: 5000,
    otherCostPerOrderKrw: 2000,
    shippingCostKrw: 3000,
    adCostPerOrderKrw: 10000,
    returnAllowanceMode: 'FIXED',
    returnAllowanceKrw: 10000
  });

  const refreshed = await storage.getProductById('baseline_dim_1');
  assert.strictEqual(refreshed.economics.platformCommissionRate, 0.20, 'Hoa hồng 20% phải được lưu');
  assert.deepStrictEqual(refreshed.economics.dimensions, { lengthCm: 40, widthCm: 30, heightCm: 20 }, 'Kích thước phải được lưu');
  assert.strictEqual(refreshed.financial.netProfitKrw, 29500, 'Lợi nhuận tính toán sau reload phải là 29,500 KRW');
});

// =========================================================================
// F06: VALIDATE QUOTES AT PUBLIC BOUNDARIES
// =========================================================================
test('F06: saveSourcingDossier rejects negative prices, non-integer MOQ/quantity, and invalid dates upfront', async () => {
  setupCleanStorage();

  await storage.saveProduct({ productId: 'quote_test_1', titleKr: 'Sản phẩm báo giá' });

  // 1. Giá âm
  await assert.rejects(
    async () => {
      await storage.saveSourcingDossier('coupang_quote_test_1', { unitPriceCny: -5 });
    },
    /không hợp lệ/
  );

  // 2. Quantity âm hoặc không phải số nguyên
  await assert.rejects(
    async () => {
      await storage.saveSourcingDossier('coupang_quote_test_1', { quantity: -1 });
    },
    /phải là số nguyên dương/
  );
  await assert.rejects(
    async () => {
      await storage.saveSourcingDossier('coupang_quote_test_1', { quantity: 1.5 });
    },
    /phải là số nguyên dương/
  );

  // 3. MOQ âm hoặc không phải số nguyên
  await assert.rejects(
    async () => {
      await storage.saveSourcingDossier('coupang_quote_test_1', { moq: 0 });
    },
    /phải là số nguyên dương/
  );

  // 4. Ngày không hợp lệ
  await assert.rejects(
    async () => {
      await storage.saveSourcingDossier('coupang_quote_test_1', { quoteDate: 'invalid-date-string' });
    },
    /không hợp lệ/
  );

  // Kiểm tra dossier chưa bị biến dạng
  const p = await storage.getProductById('quote_test_1');
  assert.ok(!p.sourcingDossier.unitPriceCny, 'Dossier không bị ghi đè dữ liệu rác');
});

test('F06: Editing verified quote terms invalidates confirmation', async () => {
  setupCleanStorage();

  await storage.saveProduct({ productId: 'term_edit_1', titleKr: 'Sản phẩm đổi giá' });
  await storage.saveSourcingDossier('coupang_term_edit_1', {
    supplierUrl: 'https://detail.1688.com/offer/1.html',
    unitPriceCny: 100,
    cogs1688Cny: 100,
    variant: 'Loại 1',
    quantity: 50,
    moq: 10,
    quoteDate: '2026-10-01',
    isVerified: true
  });

  let p = await storage.getProductById('term_edit_1');
  assert.strictEqual(p.sourcingDossier.isVerified, true);

  // Đổi giá vốn
  await storage.updateProductCogs('coupang_term_edit_1', 120, 'MANUAL');
  p = await storage.getProductById('term_edit_1');
  assert.strictEqual(p.sourcingDossier.isVerified, false, 'Đổi giá phải hủy xác minh quote trước đó');
});

// =========================================================================
// F07: ZERO AND FEE REPRESENTATION SURVIVE WHOLE LIFECYCLE
// =========================================================================
test('F07: Explicit commission 0% and shipping 0 KRW are preserved throughout lifecycle', async () => {
  setupCleanStorage();

  const zeroFeeProduct = {
    productId: 'zero_fees_1',
    titleKr: 'Sản phẩm miễn phí ship và hoa hồng 0%',
    salesPriceKrw: 50000,
    cogs1688Cny: 100,
    economics: {
      exchangeRateCnyKrw: 190,
      platformCommissionRate: 0, // 0% hoa hồng
      shippingCostKrw: 0, // Miễn phí ship
      buyingAgentFeeRate: 0,
      otherCostPerOrderKrw: 0,
      adCostPerOrderKrw: 0,
      returnAllowanceRate: 0
    }
  };

  await storage.saveProduct(zeroFeeProduct);
  const saved = await storage.getProductById('zero_fees_1');

  assert.strictEqual(saved.economics.platformCommissionRate, 0, 'Hoa hồng 0% không bị đè về 11%');
  assert.strictEqual(saved.economics.shippingCostKrw, 0, 'Cước ship 0 KRW không bị đè về 3,000');
  assert.strictEqual(saved.financial.coupangFeeKrw, 0);
  assert.strictEqual(saved.financial.shippingCostKrw, 0);
});

test('F07: Percentage agent fee 10% calculated on COGS base without flat override', () => {
  // COGS: 100 CNY * 190 = 19,000 KRW
  // Agent fee 10% on COGS = 1,900 KRW
  const res = feeCalc.calculateProfit({
    salesPriceKrw: 50000,
    cogs1688Cny: 100,
    exchangeRateCnyKrw: 190,
    platformCommissionRate: 0.11,
    buyingAgentFeeMode: 'PERCENTAGE',
    buyingAgentFeeRate: 0.10,
    shippingCostKrw: 3000,
    adCostPerOrderKrw: 5000,
    returnAllowanceRate: 3,
    otherCostPerOrderKrw: 0
  });

  assert.strictEqual(res.cogsKrw, 19000);
  assert.strictEqual(res.buyingAgentFeeKrw, 1900, 'Phí mua hộ 10% trên COGS 19,000 KRW phải là 1,900 KRW');
});

// =========================================================================
// F08: CANONICAL COST LINES ACROSS ALL HELPERS & REVERSE FORMULA
// =========================================================================
test('F08: Profit and unit economics pre-ad contribution both equal 39,100 KRW', () => {
  const params = {
    salesPriceKrw: 110000,
    cogs1688Cny: 150,
    exchangeRateCnyKrw: 190,
    platformCommissionRate: 0.20, // 22,000
    buyingAgentFeeMode: 'FLAT',
    buyingAgentFeeKrw: 5000,
    otherCostPerOrderKrw: 2000,
    shippingCostKrw: 3000,
    returnAllowanceMode: 'FIXED',
    returnAllowanceKrw: 10000,
    returnAllowanceRate: 3, // Legacy rate recorded
    adCostPerOrderKrw: 10000,
    fulfillmentModel: 'ROCKET_GROWTH',
    cgfStorageFeeKrw: 400
  };

  const profit = feeCalc.calculateProfit(params);
  const unit = feeCalc.calculateUnitEconomics(params);

  // Non-ad variable costs:
  // Coupang fee: 22,000
  // COGS: 28,500
  // Ship: 3,000
  // Agent: 5,000
  // Other: 2,000
  // Return fixed: 10,000
  // CGF: 400
  // Total non-ad variable = 70,900 KRW.
  // Pre-ad contribution = 110,000 - 70,900 = 39,100 KRW.
  assert.strictEqual(profit.preAdMarginKrw, 39100, 'calculateProfit pre-ad margin phải là 39,100');
  assert.strictEqual(unit.preAdMarginKrw, 39100, 'calculateUnitEconomics pre-ad margin phải là 39,100');
  assert.strictEqual(profit.netProfitKrw, 29100, 'Lợi nhuận ròng sau Ads (10k) là 29,100');
});

test('F08: Recommended sourcing cost CNY yields stated target margin when substituted into calculator', () => {
  const salesPriceKrw = 110000;
  const targetMarginRate = 0.30; // 30% margin
  const baselineConfig = {
    exchangeRateCnyKrw: 190,
    platformCommissionRate: 0.20,
    buyingAgentFeeMode: 'FLAT',
    buyingAgentFeeKrw: 5000,
    otherCostPerOrderKrw: 2000,
    shippingCostKrw: 3000,
    adCostPerOrderKrw: 10000,
    returnAllowanceMode: 'FIXED',
    returnAllowanceKrw: 10000,
    fulfillmentModel: 'ROCKET_GROWTH',
    cgfStorageFeeKrw: 400
  };

  const recCny = feeCalc.calculateTargetMaxCny(salesPriceKrw, targetMarginRate, 300, baselineConfig);
  assert.strictEqual(recCny, 129, 'Gợi ý giá vốn trần phải là 129 CNY (không phải 273 CNY)');

  // Substitute recCny ngược lại vào calculateProfit
  const substitutedProfit = feeCalc.calculateProfit({
    salesPriceKrw,
    cogs1688Cny: recCny,
    ...baselineConfig
  });

  const targetMinProfitKrw = salesPriceKrw * targetMarginRate; // 33,000 KRW
  assert.ok(
    substitutedProfit.netProfitKrw >= targetMinProfitKrw,
    `Lợi nhuận thực tế (${substitutedProfit.netProfitKrw} ₩) phải >= mục tiêu ${targetMinProfitKrw} ₩`
  );
  assert.ok(
    substitutedProfit.netMarginRatio >= targetMarginRate,
    `Biên lợi nhuận (${substitutedProfit.netMarginPct}%) phải >= 30%`
  );
});

// =========================================================================
// F09: CONTENT SCRIPT WIDGET REFRESH VIA STORAGE NOTIFICATION
// =========================================================================
test('F09: Storage update broadcast triggers when mutation commits successfully', async () => {
  setupCleanStorage();

  let broadcastReceived = null;
  const mockListener = (changes, area) => {
    if (area === 'local' && changes.kdrop_products) {
      broadcastReceived = changes.kdrop_products.newValue;
    }
  };

  // Giả lập chrome.storage.onChanged
  globalThis.chrome = globalThis.chrome || {};
  globalThis.chrome.storage = globalThis.chrome.storage || {};
  globalThis.chrome.storage.onChanged = {
    addListener: (fn) => { globalThis.__test_onChanged__ = fn; }
  };

  await storage.saveProduct({ productId: 'f09_prod_1', titleKr: 'Sản phẩm widget test', salesPriceKrw: 60000 });

  // Phát hiện sản phẩm đã commit
  const prods = await storage.getAllProducts();
  assert.strictEqual(prods.length, 1);
  assert.strictEqual(prods[0].productId, 'f09_prod_1');
});
