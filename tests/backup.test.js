const test = require('node:test');
const assert = require('node:assert');
const storage = require('../storage/storageRepository.js');
const { setupTestStorage, clearTestStorage } = require('./test-helper.js');

test('Backup & Restore: versioned backup export and restore roundtrip full dossiers', async () => {
  clearTestStorage();

  // Tạo sản phẩm có đầy đủ bằng chứng và watchlist
  await storage.saveProduct({
    productId: 'backup_prod_1',
    titleKr: '바디홈 차량용 암막커튼 4P',
    salesPriceKrw: 120000,
    cogs1688Cny: 150,
    isWatchlist: true,
    niche: 'car_camping',
    nicheName: 'Phụ kiện ô tô',
    economics: {
      targetSalesPriceKrw: 120000,
      exchangeRateCnyKrw: 190,
      platformCommissionRate: 0.11,
      buyingAgentFeeRate: 0,
      otherCostPerOrderKrw: 0,
      weightGram: 300,
      shippingBasis: 'REVIEWED_WEIGHT',
      adCostPerOrderKrw: 5000,
      returnAllowanceRate: 3
    }
  });

  await storage.saveSourcingDossier('coupang_backup_prod_1', {
    supplierUrl: 'https://detail.1688.com/offer/111.html',
    variant: 'Bộ 4 món',
    cogs1688Cny: 150,
    unitPriceCny: 150,
    quantity: 50,
    moq: 10,
    quoteDate: '2026-10-01',
    isVerified: true
  });

  await storage.saveEvidenceDossier('coupang_backup_prod_1', {
    demand: {
      keyword: '차량용 암막커튼',
      geography: 'KR',
      period: '2025-01 ~ 2025-12',
      source: 'Naver DataLab',
      unit: 'SEARCHES',
      peakMonthlySearches: 18000,
      seasonalityReviewed: true,
      seasonalityFinding: 'Bán chạy mùa hè'
    },
    rocketCompetition: {
      sampleSize: 50,
      rocketCount: 15,
      keywordOrCategory: '차량용 암막커튼',
      inspectedAt: '2026-10-01T12:00:00.000Z'
    },
    sellerEvidence: {
      offerUrl: 'https://www.coupang.com/vp/products/111',
      sellerId: 'SELLER_001',
      sellerReviewCount: 40,
      isInternationalDelivery: true,
      inspectedAt: '2026-10-01T12:00:00.000Z'
    },
    priceReview: {
      isReviewed: true,
      justification: 'Khoảng giá tối ưu'
    },
    kcReview: {
      reviewStatus: 'EXEMPT',
      source: 'SafetyKorea 2026',
      reviewDate: '2026-10-01',
      rationale: 'Gia dụng an toàn không điện/pin'
    },
    fulfillment: {
      shippingBasis: 'REVIEWED_WEIGHT',
      shippingBasisSource: 'Cân mẫu 300g',
      deliveryEstimate: '5-7 ngày',
      returnArrangement: 'Kho Incheon'
    }
  });

  // 1. Xuất file backup v2
  const backup = await storage.exportBackup();
  assert.strictEqual(backup.version, 2, 'Versioned backup phải có version = 2');
  assert.ok(backup.exportedAt);
  assert.ok(Array.isArray(backup.products));
  assert.strictEqual(backup.products.length, 1);
  assert.strictEqual(backup.summary.readyForTrialCount, 1);

  // 2. Làm rỗng danh sách sản phẩm trong storage nhưng giữ initialized
  globalThis.__kdrop_test_storage__ = {
    [storage.KEY_INITIALIZED]: true,
    [storage.KEY_PRODUCTS]: []
  };
  const emptyList = await storage.getAllProducts();
  assert.strictEqual(emptyList.length, 0);

  // 3. Khôi phục từ backup
  const importedCount = await storage.importBackup(backup);
  assert.strictEqual(importedCount, 1);

  // 4. Kiểm tra dữ liệu sau khi khôi phục
  const restored = (await storage.getAllProducts())[0];
  assert.strictEqual(restored.productId, 'backup_prod_1');
  assert.strictEqual(restored.isWatchlist, true, 'Watchlist được khôi phục');
  assert.strictEqual(restored.sourcingDossier.isVerified, true, 'Báo giá đã xác minh được khôi phục');
  assert.strictEqual(restored.evidenceDossier.demand.peakMonthlySearches, 18000, 'Bằng chứng tìm kiếm được khôi phục');
  assert.strictEqual(restored.trialEligibility.status, 'ready_for_trial', 'Trạng thái đủ điều kiện thử bán được khôi phục');
});

test('Backup & Restore: restore over modified existing record replaces user fields', async () => {
  clearTestStorage();

  // Tạo bản ghi ban đầu
  await storage.saveProduct({
    productId: 'existing_item_1',
    titleKr: 'Sản phẩm thử nghiệm khôi phục',
    salesPriceKrw: 50000,
    cogs1688Cny: 30,
    isWatchlist: true
  });

  // Xuất bản sao lưu với vốn 30 CNY và watchlist: true
  const backup = await storage.exportBackup();

  // Người dùng chỉnh sửa bản ghi cục bộ: đổi vốn thành 99 CNY, đổi watchlist thành false
  await storage.updateProductCogs('coupang_existing_item_1', 99);
  await storage.toggleWatchlist('coupang_existing_item_1');

  let current = (await storage.getAllProducts())[0];
  assert.strictEqual(current.sourcingDossier.cogs1688Cny, 99);
  assert.strictEqual(current.isWatchlist, false);

  // R05: Tiến hành khôi phục từ backup -> phải ghi đè lại các trường người dùng theo file backup
  const count = await storage.importBackup(backup);
  assert.strictEqual(count, 1);

  const restored = (await storage.getAllProducts())[0];
  assert.strictEqual(restored.productId, 'existing_item_1');
  assert.strictEqual(restored.id, 'coupang_existing_item_1', 'Internal ID phải được bảo toàn');
  assert.strictEqual(restored.sourcingDossier.cogs1688Cny, 30, 'Giá vốn phải được hoàn nguyên về 30 CNY');
  assert.strictEqual(restored.isWatchlist, true, 'Watchlist phải được hoàn nguyên về true');
});

test('Backup: backward compatible with legacy array format', async () => {
  clearTestStorage();

  const legacyArray = [
    {
      productId: 'legacy_import_1',
      titleKr: 'Sản phẩm danh sách cũ',
      salesPriceKrw: 25000,
      cogs1688Cny: 10,
      isWatchlist: true
    }
  ];

  const count = await storage.importBackup(legacyArray, 'old_niche', 'Ngách cũ');
  assert.strictEqual(count, 1);

  const restored = (await storage.getAllProducts())[0];
  assert.strictEqual(restored.productId, 'legacy_import_1');
  assert.strictEqual(restored.schemaVersion, 2, 'Tự động nâng cấp lên Schema v2');
  assert.strictEqual(restored.sourcingDossier.provenance, 'LEGACY', 'Provenance là LEGACY');
});

test('Backup: invalid imports reject cleanly without altering existing records', async () => {
  clearTestStorage();

  await storage.saveProduct({
    productId: 'existing_prod',
    salesPriceKrw: 30000,
    cogs1688Cny: 20
  });

  // 1. Object không hợp lệ
  await assert.rejects(
    async () => {
      await storage.importBackup({ invalidField: true });
    },
    /Định dạng file JSON không hợp lệ/
  );

  // 2. Phiên bản backup không được hỗ trợ (ví dụ version 3)
  await assert.rejects(
    async () => {
      await storage.importBackup({ version: 3, products: [{ productId: 'bad_v3' }] });
    },
    /Phiên bản backup không được hỗ trợ/
  );

  // 3. Mảng products chứa phần tử không có productId
  await assert.rejects(
    async () => {
      await storage.importBackup({ version: 2, products: [{ titleKr: 'Thiếu productId' }] });
    },
    /thiếu Coupang Product ID hợp lệ/
  );

  // Bộ nhớ hiện tại hoàn toàn không bị ảnh hưởng
  const existing = await storage.getAllProducts();
  assert.strictEqual(existing.length, 1);
  assert.strictEqual(existing[0].productId, 'existing_prod');
});
