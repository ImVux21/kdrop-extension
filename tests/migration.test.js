const test = require('node:test');
const assert = require('node:assert');
const storage = require('../storage/storageRepository.js');

test('Migration: legacy records migrate cleanly and idempotently', () => {
  const legacyRecord = {
    id: 'coupang_7212396652',
    rank: 1,
    productId: '7212396652',
    vendorItemId: '93521267767',
    titleKr: '바디홈 차량용 자석타입 암막커튼 4P, 블랙, 4개',
    salesPriceKrw: 14900,
    originalPriceKrw: 17900,
    discountRate: 16,
    isRocket: true,
    rocketType: 'ROCKET_DELIVERY',
    rating: 4.8,
    reviewCount: 754,
    cogs1688Cny: 21,
    isWatchlist: true,
    niche: 'car_camping',
    nicheName: 'Phụ kiện ô tô & Cắm trại dã ngoại'
  };

  const migrated1 = storage.migrateProduct(legacyRecord);

  // 1. Kiểm tra cấu trúc Schema v2
  assert.strictEqual(migrated1.schemaVersion, 2, 'Phải có schemaVersion = 2');
  assert.strictEqual(migrated1.productId, '7212396652');
  assert.strictEqual(migrated1.id, 'coupang_7212396652');
  assert.strictEqual(migrated1.isWatchlist, true, 'Watchlist phải được bảo toàn');
  assert.strictEqual(migrated1.sourcingDossier.cogs1688Cny, 21, 'Giá vốn cũ phải được giữ nguyên');
  assert.strictEqual(migrated1.sourcingDossier.provenance, 'LEGACY', 'Bản ghi cũ phải có provenance LEGACY');
  assert.strictEqual(migrated1.sourcingDossier.isVerified, false, 'Dữ liệu cũ không tự động claim xác minh');

  // 2. Kiểm tra các trường thị trường
  assert.strictEqual(migrated1.marketData.salesPriceKrw, 14900);
  assert.strictEqual(migrated1.marketData.titleKr, '바디홈 차량용 자석타입 암막커튼 4P, 블랙, 4개');
  assert.strictEqual(migrated1.marketData.isRocket, true);

  // 3. Kiểm tra tính lũy tích (Idempotence)
  const migrated2 = storage.migrateProduct(migrated1);
  assert.deepStrictEqual(migrated1, migrated2, 'Chạy migration lần 2 phải giữ nguyên kết quả (idempotent)');

  // 4. Kiểm tra đánh giá dẫn xuất (derived assessments)
  assert.ok(migrated1.trialEligibility, 'Phải có trialEligibility');
  assert.ok(['ready_for_trial', 'needs_verification', 'not_eligible'].includes(migrated1.trialEligibility.status));
  assert.ok(migrated1.financial, 'Phải có financial');
  assert.ok(migrated1.wpi, 'Phải có wpi');
});

test('Migration: rejects or handles missing product ID properly', () => {
  const invalidRecord = {
    titleKr: 'Sản phẩm không có ID',
    salesPriceKrw: 20000
  };
  const res = storage.migrateProduct(invalidRecord);
  assert.strictEqual(res, null, 'Sản phẩm thiếu product ID không được chấp nhận');
});
