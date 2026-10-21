const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('Extractor: honestly extracts observed Coupang data and produces null for unknown fields', () => {
  // Đọc nội dung extractor
  const extractorCode = fs.readFileSync(path.join(__dirname, '../content/coupang_extractor.js'), 'utf8');

  // Tạo mock DOM môi trường trang chi tiết Coupang KHÔNG có rating và review
  global.window = { location: { pathname: '/vp/products/88889999', href: 'https://www.coupang.com/vp/products/88889999', search: '' } };
  global.document = {
    title: '테스트 상품 - 쿠팡!',
    pathname: '/vp/products/88889999',
    querySelector: (selector) => {
      if (selector.includes('prod-buy-header__title')) {
        return { textContent: '차량용 햇빛가리개' };
      }
      if (selector.includes('total-price')) {
        return { textContent: '59,000원' };
      }
      if (selector.includes('prod-image__detail')) {
        return { src: 'https://thumbnail.coupang.com/test.jpg' };
      }
      // Không có rating, review count, hay rank trên trang này
      return null;
    }
  };

  // Chạy extractor trong môi trường giả lập
  const runExtractor = new Function('window', 'document', `${extractorCode}; return window.KDropCoupangExtractor;`);
  const extractor = runExtractor(global.window, global.document);

  const product = extractor.extractSingleProduct();

  assert.ok(product, 'Phải trích xuất được sản phẩm');
  assert.strictEqual(product.productId, '88889999');
  assert.strictEqual(product.salesPriceKrw, 59000);
  assert.strictEqual(product.titleKr, '차량용 햇빛가리개');

  // KHÔNG ĐƯỢC tự bịa đặt rank 1, rating 4.8, hay 100 reviews!
  assert.strictEqual(product.rank, null, 'Rank phải là null khi trang chi tiết không có BSR rank');
  assert.strictEqual(product.rating, null, 'Rating phải là null khi DOM không có rating');
  assert.strictEqual(product.reviewCount, null, 'Review count phải là null khi DOM không có review count');
  assert.strictEqual(product.cogs1688Cny, null, 'Giá vốn 1688 không được tự suy đoán');
});

test('Extractor: returns null when product has no valid price or ID', () => {
  const extractorCode = fs.readFileSync(path.join(__dirname, '../content/coupang_extractor.js'), 'utf8');

  global.window = { location: { pathname: '/vp/products/0', href: 'https://www.coupang.com/vp/products/0', search: '' } };
  global.document = {
    title: 'Lỗi',
    querySelector: () => null
  };

  const runExtractor = new Function('window', 'document', `${extractorCode}; return window.KDropCoupangExtractor;`);
  const extractor = runExtractor(global.window, global.document);

  const product = extractor.extractSingleProduct();
  assert.strictEqual(product, null, 'Sản phẩm ID 0 hoặc không có giá phải trả về null');
});
