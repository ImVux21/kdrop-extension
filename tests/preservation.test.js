const test = require('node:test');
const assert = require('node:assert');
const { setupTestStorage, clearTestStorage } = require('./test-helper.js');
const storage = require('../storage/storageRepository.js');

test('Preservation: single product rescan preserves manual cost, watchlist, internal ID, and evidence', async () => {
  clearTestStorage();

  // 1. Lưu sản phẩm ban đầu với giá nhập tay 21 CNY và isWatchlist: true
  const initial = await storage.saveProduct({
    productId: '7212396652',
    id: 'coupang_7212396652',
    titleKr: '바디홈 차량용 자석타입 암막커튼 4P',
    salesPriceKrw: 15000,
    cogs1688Cny: 21,
    isWatchlist: true
  });

  // Người dùng cập nhật bằng chứng
  await storage.saveEvidenceDossier('coupang_7212396652', {
    demand: {
      keyword: '차량용 암막커튼',
      peakMonthlySearches: 15000,
      seasonalityReviewed: true
    }
  });

  // Kiểm tra trước khi rescan
  let saved = (await storage.getAllProducts()).find(p => p.productId === '7212396652');
  assert.strictEqual(saved.sourcingDossier.cogs1688Cny, 21);
  assert.strictEqual(saved.isWatchlist, true);
  assert.strictEqual(saved.evidenceDossier.demand.peakMonthlySearches, 15000);
  assert.strictEqual(saved.marketData.salesPriceKrw, 15000);

  // 2. Nhập một lượt quét mới (rescan) với giá Coupang mới 14,900 KRW, giá vốn heuristic 20 CNY và isWatchlist: false
  const scanData = {
    productId: '7212396652',
    titleKr: '바디홈 차량용 자석타입 암막커튼 4P (Cập nhật tên)',
    salesPriceKrw: 14900,
    cogs1688Cny: 20, // heuristic estimate từ lượt quét
    isWatchlist: false // scan không quan tâm watchlist
  };

  await storage.saveProduct(scanData);

  // 3. Kiểm tra sản phẩm sau rescan
  saved = (await storage.getAllProducts()).find(p => p.productId === '7212396652');
  assert.strictEqual(saved.id, 'coupang_7212396652', 'Internal ID phải giữ nguyên');
  assert.strictEqual(saved.sourcingDossier.cogs1688Cny, 21, 'Giá vốn nhập tay 21 CNY phải được giữ nguyên, không bị đè bởi 20 CNY');
  assert.strictEqual(saved.isWatchlist, true, 'Watchlist phải được giữ nguyên là true');
  assert.strictEqual(saved.evidenceDossier.demand.peakMonthlySearches, 15000, 'Bằng chứng phải được giữ nguyên');
  assert.strictEqual(saved.marketData.salesPriceKrw, 14900, 'Giá quan sát Coupang phải được cập nhật mới thành 14900 KRW');
  assert.strictEqual(saved.marketData.titleKr, '바디홈 차량용 자석타입 암막커튼 4P (Cập nhật tên)', 'Tên quan sát phải được cập nhật');
});

test('Preservation: batch rescan retains user inputs across multiple products', async () => {
  clearTestStorage();

  // Tạo sẵn 2 sản phẩm
  await storage.saveProduct({
    productId: 'prod_A',
    salesPriceKrw: 20000,
    cogs1688Cny: 25,
    isWatchlist: true
  });
  await storage.saveProduct({
    productId: 'prod_B',
    salesPriceKrw: 30000,
    cogs1688Cny: 35,
    isWatchlist: false
  });

  // Batch import quét mới
  const batchScans = [
    { productId: 'prod_A', salesPriceKrw: 19500, cogs1688Cny: 15, isWatchlist: false },
    { productId: 'prod_B', salesPriceKrw: 29000, cogs1688Cny: 18, isWatchlist: true },
    { productId: 'prod_C', salesPriceKrw: 40000, cogs1688Cny: 22, isWatchlist: false }
  ];

  await storage.batchImportProducts(batchScans, 'test_batch', 'Danh mục test');

  const products = await storage.getAllProducts();
  const a = products.find(p => p.productId === 'prod_A');
  const b = products.find(p => p.productId === 'prod_B');
  const c = products.find(p => p.productId === 'prod_C');

  assert.strictEqual(a.sourcingDossier.cogs1688Cny, 25, 'prod_A giữ vốn 25 CNY');
  assert.strictEqual(a.isWatchlist, true, 'prod_A giữ watchlist true');
  assert.strictEqual(a.marketData.salesPriceKrw, 19500, 'prod_A cập nhật giá 19500');

  assert.strictEqual(b.sourcingDossier.cogs1688Cny, 35, 'prod_B giữ vốn 35 CNY');
  assert.strictEqual(b.isWatchlist, false, 'prod_B giữ watchlist false');
  assert.strictEqual(b.marketData.salesPriceKrw, 29000, 'prod_B cập nhật giá 29000');

  assert.strictEqual(c.marketData.salesPriceKrw, 40000, 'prod_C là sản phẩm mới được thêm');
});

test('Preservation: two closely spaced independent edits serialize safely', async () => {
  clearTestStorage();

  await storage.saveProduct({
    productId: 'prod_concurrent',
    salesPriceKrw: 50000,
    cogs1688Cny: 10,
    isWatchlist: false
  });

  // Chạy 2 tác vụ cập nhật gần như đồng thời: sửa cogs và toggle watchlist
  const p1 = storage.updateProductCogs('coupang_prod_concurrent', 45);
  const p2 = storage.toggleWatchlist('coupang_prod_concurrent');

  await Promise.all([p1, p2]);

  const finalProd = (await storage.getAllProducts()).find(p => p.productId === 'prod_concurrent');
  assert.strictEqual(finalProd.sourcingDossier.cogs1688Cny, 45, 'Vốn phải là 45');
  assert.strictEqual(finalProd.isWatchlist, true, 'Watchlist phải là true');
});

test('Preservation: observed Coupang price updates while operator targetSalesPriceKrw remains strictly preserved (R03)', async () => {
  clearTestStorage();

  // 1. Tạo sản phẩm ban đầu: giá Coupang quan sát là 100,000 KRW, người vận hành đặt giá bán mục tiêu là 130,000 KRW
  await storage.saveProduct({
    productId: 'price_partition_prod',
    salesPriceKrw: 100000,
    cogs1688Cny: 100,
    economics: {
      targetSalesPriceKrw: 130000
    }
  });

  let p = (await storage.getAllProducts()).find(item => item.productId === 'price_partition_prod');
  assert.strictEqual(p.marketData.salesPriceKrw, 100000, 'Giá quan sát ban đầu là 100k');
  assert.strictEqual(p.economics.targetSalesPriceKrw, 130000, 'Giá mục tiêu của operator là 130k');

  // 2. Coupang quét lại (rescan): giá trên web đổi xuống 90,000 KRW
  await storage.saveProduct({
    productId: 'price_partition_prod',
    salesPriceKrw: 90000
  });

  p = (await storage.getAllProducts()).find(item => item.productId === 'price_partition_prod');
  assert.strictEqual(p.marketData.salesPriceKrw, 90000, 'Giá Coupang quan sát cập nhật xuống 90k');
  assert.strictEqual(p.economics.targetSalesPriceKrw, 130000, 'R03: Giá bán mục tiêu 130k của operator KHÔNG bị đè bởi giá quét Coupang 90k');

  // 3. Người vận hành lưu giá mục tiêu mới qua saveEconomics (140,000 KRW)
  await storage.saveEconomics('coupang_price_partition_prod', {
    targetSalesPriceKrw: 140000
  });

  p = (await storage.getAllProducts()).find(item => item.productId === 'price_partition_prod');
  assert.strictEqual(p.economics.targetSalesPriceKrw, 140000, 'Giá mục tiêu cập nhật thành 140k');
  assert.strictEqual(p.marketData.salesPriceKrw, 90000, 'R03: Giá quan sát thị trường vẫn giữ nguyên 90k, không bị can thiệp bởi operator');
});

test('Preservation: editing cost invalidates previous sourcing quote verification (R06)', async () => {
  clearTestStorage();

  // 1. Tạo sản phẩm với hồ sơ báo giá đã xác minh (isVerified: true, provenance: EVIDENCE)
  await storage.saveProduct({
    productId: 'quote_inval_prod',
    salesPriceKrw: 80000,
    cogs1688Cny: 50
  });

  await storage.saveSourcingDossier('coupang_quote_inval_prod', {
    supplierUrl: 'https://detail.1688.com/offer/999.html',
    variant: 'Loại A tiêu chuẩn',
    cogs1688Cny: 50,
    unitPriceCny: 50,
    quantity: 100,
    moq: 10,
    quoteDate: '2026-10-01',
    isVerified: true
  });

  let p = (await storage.getAllProducts()).find(item => item.productId === 'quote_inval_prod');
  assert.strictEqual(p.sourcingDossier.isVerified, true, 'Ban đầu đã xác minh');
  assert.strictEqual(p.sourcingDossier.provenance, 'EVIDENCE');
  assert.ok(p.sourcingDossier.verifiedAt);

  // 2. Người vận hành chỉnh sửa giá vốn nhập tay (thay đổi thành 55 CNY)
  await storage.updateProductCogs('coupang_quote_inval_prod', 55);

  p = (await storage.getAllProducts()).find(item => item.productId === 'quote_inval_prod');
  assert.strictEqual(p.sourcingDossier.cogs1688Cny, 55, 'Giá vốn mới là 55 CNY');
  assert.strictEqual(p.sourcingDossier.isVerified, false, 'R06: Trạng thái xác minh cũ bị hủy bỏ (isVerified = false)');
  assert.strictEqual(p.sourcingDossier.verifiedAt, null, 'verifiedAt được reset về null');
  assert.strictEqual(p.sourcingDossier.provenance, 'MANUAL', 'Provenance được chuyển về MANUAL');
});
