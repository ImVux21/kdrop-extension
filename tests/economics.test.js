const test = require('node:test');
const assert = require('node:assert');
const feeCalc = require('../core/feeCalculator.js');
const storage = require('../storage/storageRepository.js');
const { setupTestStorage, clearTestStorage } = require('./test-helper.js');

test('Economics: heavy product uses calculated weight or saved shipping basis', () => {
  // Sản phẩm 1500g (vượt mốc 500g: 3000 + 2*1000 = 5000 KRW)
  const heavyResult = feeCalc.calculateProfit({
    salesPriceKrw: 30000,
    cogs1688Cny: 20,
    weightGram: 1500
  });

  assert.strictEqual(heavyResult.shippingCostKrw, 5000, 'Sản phẩm 1500g phải tính cước 5000 KRW chứ không phải 3000 KRW của 300g');
  assert.strictEqual(heavyResult.shippingBasis, 'WEIGHT_ESTIMATE');

  // Nếu có báo giá thực tế đã lưu (ví dụ báo giá 4,500 KRW)
  const quotedResult = feeCalc.calculateProfit({
    salesPriceKrw: 30000,
    cogs1688Cny: 20,
    shippingCostKrw: 4500
  });

  assert.strictEqual(quotedResult.shippingCostKrw, 4500, 'Phải ưu tiên cước vận chuyển thực tế đã báo');
  assert.strictEqual(quotedResult.shippingBasis, 'QUOTED');
});

test('Economics: explicit zero advertising or return allowance remains zero', () => {
  // Khi người dùng nhập rõ ràng chi phí Ads là 0 và return allowance là 0
  const zeroResult = feeCalc.calculateProfit({
    salesPriceKrw: 20000,
    cogs1688Cny: 15,
    exchangeRateCnyKrw: 190,
    platformCommissionRate: 0.11,
    shippingCostKrw: 3000,
    buyingAgentFeeRate: 0,
    otherCostPerOrderKrw: 0,
    adCostPerOrderKrw: 0,
    returnAllowanceRate: 0
  });

  assert.strictEqual(zeroResult.adCostKrw, 0, 'Phải giữ nguyên 0 Ads, không bị đè bởi giá trị mặc định');
  assert.strictEqual(zeroResult.hasAdCost, true, 'Đã nhập 0 tường minh');
  assert.strictEqual(zeroResult.returnReserveKrw, 0, 'Phải giữ nguyên 0 hoàn hủy');
  assert.strictEqual(zeroResult.hasReturnAllowance, true, 'Đã nhập 0 tường minh');
  assert.strictEqual(zeroResult.isComplete, true, 'Đủ chi phí hoàn chỉnh');

  // Khi chưa nhập (missing)
  const missingResult = feeCalc.calculateProfit({
    salesPriceKrw: 20000,
    cogs1688Cny: 15
    // Không truyền adCostPerOrderKrw và returnAllowance
  });

  assert.strictEqual(missingResult.hasAdCost, false, 'Chưa nhập chi phí Ads');
  assert.strictEqual(missingResult.isComplete, false, 'Chưa hoàn chỉnh do thiếu chi phí');
  assert.ok(missingResult.missingCosts.includes('adCost'));
});

test('Economics: negative and non-finite inputs are rejected', () => {
  const invalid1 = feeCalc.calculateProfit({
    salesPriceKrw: -10000,
    cogs1688Cny: 20
  });
  assert.strictEqual(invalid1.isValid, false, 'Giá bán âm bị từ chối');
  assert.ok(invalid1.validationErrors.length > 0);

  const invalid2 = feeCalc.calculateProfit({
    salesPriceKrw: 20000,
    cogs1688Cny: NaN
  });
  assert.strictEqual(invalid2.isValid, false, 'NaN bị từ chối');

  const invalid3 = feeCalc.calculateProfit({
    salesPriceKrw: 20000,
    cogs1688Cny: 20,
    returnAllowanceRate: 150 // > 100%
  });
  assert.strictEqual(invalid3.isValid, false, 'Tỷ lệ hoàn hủy > 100% bị từ chối');
});

test('Economics: simulator scenario vs baseline preservation in storage', async () => {
  clearTestStorage();

  // Tạo sản phẩm ban đầu trong storage
  const baselineProduct = await storage.saveProduct({
    productId: 'sim_test_prod',
    salesPriceKrw: 25000,
    cogs1688Cny: 15,
    economics: {
      targetSalesPriceKrw: 25000,
      shippingCostKrw: 3000,
      adCostPerOrderKrw: 2000,
      returnAllowanceRate: 3
    }
  });

  // Chạy mô phỏng Unit Economics với các tham số kịch bản khác (ví dụ kịch bản xấu: cước tăng, ads tăng)
  const unitEco = feeCalc.calculateUnitEconomics({
    salesPriceKrw: 25000,
    cogs1688Cny: 15,
    shippingCostKrw: 5000, // thử nghiệm tăng ship
    adCostPerOrderKrw: 7000 // thử nghiệm tăng ads
  });

  // Kiểm tra kịch bản giả định
  assert.strictEqual(unitEco.scenarios.isAssumption, true, 'Kịch bản phải được đánh dấu là giả định');
  assert.ok(unitEco.scenarios.favorable.contributionKrw !== undefined);
  assert.ok(unitEco.scenarios.adverse.contributionKrw !== undefined);

  // ĐẢM BẢO baseline trong storage không hề bị ảnh hưởng bởi việc mô phỏng tạm thời!
  const storedProduct = (await storage.getAllProducts()).find(p => p.productId === 'sim_test_prod');
  assert.strictEqual(storedProduct.marketData.salesPriceKrw, 25000);
  assert.strictEqual(storedProduct.economics.shippingCostKrw, 3000, 'Baseline ship vẫn là 3000, không bị đè bởi 5000 của simulator');
  assert.strictEqual(storedProduct.economics.adCostPerOrderKrw, 2000, 'Baseline ads vẫn là 2000, không bị đè bởi 7000 của simulator');
});

test('Economics: atomic saveBaseline persists all simulator parameters and roundtrips cleanly (R08)', async () => {
  clearTestStorage();

  await storage.saveProduct({
    productId: 'baseline_roundtrip_prod',
    salesPriceKrw: 30000,
    cogs1688Cny: 20
  });

  // Lưu toàn bộ kịch bản cơ sở trong một atomic mutation
  const baselineData = {
    targetSalesPriceKrw: 32000,
    cogs1688Cny: 25,
    exchangeRateCnyKrw: 195,
    shippingCostKrw: 3500,
    weightGram: 450,
    adCostPerOrderKrw: 1500,
    returnAllowanceRate: 4,
    targetContributionPct: 20,
    ordersPerDay: 15,
    settlementCycleDays: 45,
    fulfillmentModel: 'BUYING_PER_ORDER'
  };

  await storage.saveBaseline('coupang_baseline_roundtrip_prod', baselineData);

  const saved = (await storage.getAllProducts()).find(p => p.productId === 'baseline_roundtrip_prod');
  assert.strictEqual(saved.economics.targetSalesPriceKrw, 32000);
  assert.strictEqual(saved.sourcingDossier.cogs1688Cny, 25);
  assert.strictEqual(saved.economics.exchangeRateCnyKrw, 195);
  assert.strictEqual(saved.economics.shippingCostKrw, 3500);
  assert.strictEqual(saved.economics.weightGram, 450);
  assert.strictEqual(saved.economics.adCostPerOrderKrw, 1500);
  assert.strictEqual(saved.economics.returnAllowanceRate, 4);
  assert.strictEqual(saved.economics.targetContributionPct, 20);
  assert.strictEqual(saved.economics.ordersPerDay, 15);
  assert.strictEqual(saved.economics.settlementCycleDays, 45);
  assert.strictEqual(saved.economics.fulfillmentModel, 'BUYING_PER_ORDER');

  // Đảm bảo không ghi đè giá quan sát Coupang
  assert.strictEqual(saved.marketData.salesPriceKrw, 30000);
});

test('Economics: input normalization and unrounded threshold comparisons in decision verdict (R10 & R11)', () => {
  // R10: Normalization xử lý đúng chuỗi số và aliases
  const normalized = feeCalc.normalizeFinancialInputs({
    salesPriceKrw: '25000',
    cogs: '15.5',
    exchangeRate: '190',
    weight: '350',
    shippingCost: '3000',
    adCost: '2000',
    returnRate: '3'
  });

  assert.strictEqual(normalized.salesPriceKrw, 25000);
  assert.strictEqual(normalized.cogs1688Cny, 15.5);
  assert.strictEqual(normalized.exchangeRateCnyKrw, 190);
  assert.strictEqual(normalized.weightGram, 350);
  assert.strictEqual(normalized.shippingCostKrw, 3000);
  assert.strictEqual(normalized.adCostPerOrderKrw, 2000);
  assert.strictEqual(normalized.returnAllowanceRate, 3);

  // R10: Validation từ chối tỷ giá <= 0 và hoa hồng ngoài 0..1
  const badRate = feeCalc.validateFinancialInputs({ exchangeRateCnyKrw: -10 });
  assert.strictEqual(badRate.isValid, false);
  assert.ok(badRate.errors.some(e => e.includes('Tỷ giá')));

  const badComm = feeCalc.validateFinancialInputs({ coupangCommissionRate: 1.5 });
  assert.strictEqual(badComm.isValid, false);
  assert.ok(badComm.errors.some(e => e.includes('hoa hồng')));

  // R11: Quyết định ngưỡng verdict đánh giá tỷ lệ thực tế chưa làm tròn
  // 24.96% margin: (netProfit 24,960 / 100,000 = 0.2496 < 0.25) -> MODERATE, KHÔNG làm tròn lên GOOD_WIN
  const r24_96 = feeCalc.calculateProfit({
    salesPriceKrw: 100000,
    cogs1688Cny: 330, // 330 * 190 = 62,700
    shippingCostKrw: 3000,
    adCostPerOrderKrw: 0,
    returnAllowanceRate: 0,
    coupangCommissionRate: 0.0934 // 9,340 -> 100,000 - 62,700 - 3,000 - 9,340 = 24,960 net profit (24.96%)
  }, { coupangCommissionRate: 0.0934 });

  assert.strictEqual(r24_96.netMarginRatio < 0.25, true, 'Ratio thực tế phải < 0.25');
  assert.strictEqual(r24_96.verdict, 'MODERATE', '24.96% không được làm tròn lên GOOD_WIN');

  // 25.00% margin -> GOOD_WIN
  const r25_00 = feeCalc.calculateProfit({
    salesPriceKrw: 100000,
    cogs1688Cny: 330,
    shippingCostKrw: 3000,
    adCostPerOrderKrw: 0,
    returnAllowanceRate: 0,
    coupangCommissionRate: 0.0930 // 9,300 -> 100,000 - 62,700 - 3,000 - 9,300 = 25,000 net profit (25.00%)
  }, { coupangCommissionRate: 0.0930 });

  assert.strictEqual(r25_00.netMarginRatio >= 0.25, true, 'Ratio thực tế phải >= 0.25');
  assert.strictEqual(r25_00.verdict, 'GOOD_WIN', '25.00% đạt chuẩn GOOD_WIN');
});
