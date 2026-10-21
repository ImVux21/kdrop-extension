const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const extractorCode = fs.readFileSync(path.join(__dirname, '../content/coupang_extractor.js'), 'utf8');

class MockElement {
  constructor(tag, attrs = {}, text = '', children = []) {
    this.tagName = tag.toUpperCase();
    this.attributes = { ...attrs };
    this.className = attrs.class || '';
    this.id = attrs.id || '';
    this._text = text;
    this.children = [];
    this.parentNode = null;

    for (const child of children) {
      this.appendChild(child);
    }
  }

  get textContent() {
    return (this._text || '') + this.children.map(c => c.textContent).join('');
  }

  set textContent(val) {
    this._text = val;
    this.children = [];
  }

  contains(other) {
    let curr = other;
    while (curr) {
      if (curr === this) return true;
      curr = curr.parentNode;
    }
    return false;
  }

  get src() {
    return this.attributes.src || '';
  }

  set src(val) {
    this.attributes.src = val;
  }

  getAttribute(name) {
    if (name === 'class') return this.className;
    if (name === 'id') return this.id;
    return this.attributes[name] !== undefined ? this.attributes[name] : null;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
  }

  closest(selector) {
    let curr = this;
    while (curr) {
      if (curr.matchesSelector && curr.matchesSelector(selector)) return curr;
      curr = curr.parentNode;
    }
    return null;
  }

  matchesSelector(sel) {
    const parts = sel.split(',').map(s => s.trim());
    return parts.some(part => {
      const tagMatch = part.match(/^([a-z0-9]+)/i);
      if (tagMatch && this.tagName.toLowerCase() !== tagMatch[1].toLowerCase()) {
        return false;
      }
      const attributeMatch = part.match(/\[([^\]=~^*]+)(\*=|\^=|=)"([^"]*)"\]/);
      if (attributeMatch) {
        const [, attribute, operator, expected] = attributeMatch;
        const actual = this.getAttribute(attribute);
        if (actual === null) return false;
        if (operator === '*=' && !String(actual).includes(expected)) return false;
        if (operator === '^=' && !String(actual).startsWith(expected)) return false;
        if (operator === '=' && String(actual) !== expected) return false;
        return true;
      }
      if (part.includes('[class*="')) {
        const match = part.match(/\[class\*="([^"]+)"\]/);
        return match ? this.className.includes(match[1]) : false;
      }
      if (part.includes('[aria-label*="')) {
        const match = part.match(/\[aria-label\*="([^"]+)"\]/);
        return match ? (this.attributes['aria-label'] || '').includes(match[1]) : false;
      }
      if (part.includes('[aria-label]')) {
        return Boolean(this.attributes['aria-label']);
      }
      if (part.includes('.')) {
        const cls = part.split('.').pop().trim();
        return this.className.split(/\s+/).includes(cls);
      }
      if (part.includes('#')) {
        return this.id === part.split('#').pop().trim();
      }
      if (tagMatch && this.tagName.toLowerCase() === tagMatch[1].toLowerCase()) {
        return true;
      }
      return false;
    });
  }

  querySelector(selector) {
    const list = this.querySelectorAll(selector);
    return list.length > 0 ? list[0] : null;
  }

  querySelectorAll(selector) {
    const results = [];
    const traverse = (node) => {
      for (const child of node.children) {
        if (child.matchesSelector && child.matchesSelector(selector)) {
          results.push(child);
        }
        traverse(child);
      }
    };
    traverse(this);
    return results;
  }
}

function runWithDoc(doc, pathname = '/np/search', search = '?q=수납함') {
  const win = {
    location: {
      pathname,
      search,
      href: `https://www.coupang.com${pathname}${search}`
    }
  };
  const runExtractor = new Function('window', 'document', `${extractorCode}; return window.KDropCoupangExtractor;`);
  return runExtractor(win, doc);
}

test('Modern search card with ProductUnit: identity, price, and metadata extracted correctly', () => {
  const link = new MockElement('a', {
    href: '/vp/products/9693648728?itemId=28993342342&vendorItemId=95921999183'
  });
  const img = new MockElement('img', {
    class: 'ProductUnit_image__abc',
    src: 'https://thumbnail.coupang.com/test1.jpg'
  });
  const title = new MockElement('div', { class: 'ProductUnit_productNameV2__cV9cw' }, 'AIRAJ 5 IN 1조합 이동식 공구함');
  const priceArea = new MockElement('div', { class: 'PriceArea_priceArea__NntJz' });
  const del = new MockElement('del', {}, '219,800원');
  const saleSpan = new MockElement('span', {}, '195,800원');
  const saleDiv = new MockElement('div', { class: 'custom-oos fw-text-[20px]/[24px]' }, '', [saleSpan]);
  const unitSpan = new MockElement('span', {}, '(1개당 97,900원)');
  priceArea.appendChild(del);
  priceArea.appendChild(saleDiv);
  priceArea.appendChild(unitSpan);

  const ratingDiv = new MockElement('div', { class: 'ProductRating_productRating__jjf7W' });
  const star = new MockElement('div', { 'aria-label': '5' });
  const rev = new MockElement('span', {}, '(2)');
  ratingDiv.appendChild(star);
  ratingDiv.appendChild(rev);

  link.appendChild(img);
  link.appendChild(title);
  link.appendChild(priceArea);
  link.appendChild(ratingDiv);

  const card = new MockElement('li', {
    class: 'ProductUnit_productUnit__Qd6sv',
    'data-id': '95921999183'
  }, '', [link]);

  const doc = {
    title: 'Coupang search: 수납함',
    querySelectorAll: (sel) => [card],
    querySelector: (sel) => null
  };

  const extractor = runWithDoc(doc);
  const items = extractor.extractListingProducts();

  assert.equal(items.length, 1);
  assert.equal(items[0].productId, '9693648728');
  assert.equal(items[0].vendorItemId, '95921999183');
  assert.equal(items[0].salesPriceKrw, 195800);
  assert.equal(items[0].originalPriceKrw, 219800);
  assert.equal(items[0].rating, 5);
  assert.equal(items[0].reviewCount, 2);
  assert.equal(items[0].thumbnailUrl, 'https://thumbnail.coupang.com/test1.jpg');
  assert.equal(items[0].rank, null);
  assert.equal(items[0].listingPosition, 1);
});

test('Legacy listing cards: continue to extract without regression', () => {
  const link = new MockElement('a', { href: '/vp/products/123456789?vendorItemId=999' });
  const img = new MockElement('img', { class: 'search-product-wrap-img', src: 'https://thumbnail.coupang.com/legacy.jpg' });
  const title = new MockElement('span', { class: 'name' }, '수납함 레거시');
  const price = new MockElement('strong', { class: 'price-value' }, '110,000원');
  const rating = new MockElement('span', { class: 'rating' }, '4.5');
  const rev = new MockElement('span', { class: 'rating-total-count' }, '(15)');
  const rocket = new MockElement('img', { src: 'https://image.coupang.com/badges_rocket.png', class: 'badge rocket' });

  link.appendChild(img);
  link.appendChild(title);
  link.appendChild(price);
  link.appendChild(rating);
  link.appendChild(rev);
  link.appendChild(rocket);

  const card = new MockElement('li', {
    class: 'search-product',
    'data-product-id': '123456789'
  }, '', [link]);

  const doc = {
    title: 'Coupang search: 레거시',
    querySelectorAll: (sel) => [card],
    querySelector: (sel) => null
  };

  const extractor = runWithDoc(doc);
  const items = extractor.extractListingProducts();

  assert.equal(items.length, 1);
  assert.equal(items[0].productId, '123456789');
  assert.equal(items[0].salesPriceKrw, 110000);
  assert.equal(items[0].rating, 4.5);
  assert.equal(items[0].reviewCount, 15);
  assert.equal(items[0].isRocket, true);
  assert.equal(items[0].rocketType, 'ROCKET_DELIVERY');
});

test('Homepage banner exclusion: scanCurrentPage returns HOMEPAGE status with actionable guidance', () => {
  const bannerLink = new MockElement('a', { href: 'https://shop.coupang.com/lionkoreaofficial/533245' });
  const bannerLi = new MockElement('li', { class: 'half-width', 'data-vendor-item-id': '0' }, '', [bannerLink]);
  const bannerUl = new MockElement('ul', { class: 'banner-list prod-list' }, '', [bannerLi]);
  const todayDiscovery = new MockElement('div', { id: 'todayDiscoveryUnit', class: 'today-discovery' }, '', [bannerUl]);

  const doc = {
    title: 'Coupang',
    querySelectorAll: (sel) => [],
    querySelector: (sel) => {
      if (sel.includes('todayDiscoveryUnit')) return todayDiscovery;
      return null;
    }
  };

  const extractor = runWithDoc(doc, '/', '');
  const extracted = extractor.extractListingProducts();
  const report = extractor.scanCurrentPage();

  assert.equal(report.status, 'HOMEPAGE');
  assert.equal(report.count, 0);
  assert.ok(report.message.includes('chưa thấy thẻ sản phẩm'));
});

test('Homepage category recommendation product card: imports observed identity, price, source and unknown rank', () => {
  const anchor = new MockElement('a', {
    class: 'product-unit category-best-link impression-logged',
    href: '/vp/products/9334799508?itemId=27679405325&vendorItemId=94651440345&sourceType=srp_product_ads&from=home_CategoryBest_ranking'
  });
  const image = new MockElement('img', { src: 'https://thumbnail.coupangcdn.com/test.jpg', alt: '[2026 신품 특가] 놀차 겨울 항균 이불' });
  const title = new MockElement('span', { class: 'name' }, '[2026 신품 특가] 놀차 겨울 항균 이불');
  const productType = new MockElement('span', { class: 'prod-type discounted-price' }, '할인');
  const price = new MockElement('div', { class: 'price price-v2' }, '', [new MockElement('strong', {}, '29,900원')]);
  const rocketMerchant = new MockElement('img', { 'data-badge-id': 'ROCKET_MERCHANT', src: 'https://image.coupangcdn.com/logo_rocket_merchant.png' });
  for (const child of [image, title, productType, price, rocketMerchant]) anchor.appendChild(child);
  const category = new MockElement('div', { id: 'categoryBestUnit' }, '', [anchor]);
  const doc = {
    title: 'Coupang Homepage',
    querySelectorAll: selector => selector.includes('#categoryBestUnit') || selector === 'a[href*="/vp/products/"]' ? [anchor] : [],
    querySelector: () => category
  };

  const extractor = runWithDoc(doc, '/', '');
  const extracted = extractor.extractListingProducts();
  const report = extractor.scanCurrentPage();
  const item = report.items[0];

  assert.equal(report.status, 'SUCCESS', JSON.stringify(extracted.diagnostics));
  assert.equal(report.count, 1, JSON.stringify(extracted.diagnostics));
  assert.equal(item.productId, '9334799508');
  assert.equal(item.vendorItemId, '94651440345');
  assert.equal(item.salesPriceKrw, 29900);
  assert.equal(item.titleKr, '[2026 신품 특가] 놀차 겨울 항균 이불');
  assert.equal(item.listingSection, 'categoryBestUnit');
  assert.equal(item.listingSourceType, 'srp_product_ads');
  assert.equal(item.isAdvertised, true);
  assert.equal(item.rank, null);
  assert.equal(item.isRocket, true);
  assert.equal(item.rocketType, 'UNKNOWN');
});

test('Product URL on a non-Coupang host is not imported as a Coupang product', () => {
  const link = new MockElement('a', { href: 'https://example.com/vp/products/123456789' });
  link.appendChild(new MockElement('div', { class: 'ProductUnit_productNameV2__hash' }, 'External link'));
  link.appendChild(new MockElement('span', {}, '30,000원'));
  const card = new MockElement('li', { class: 'ProductUnit_productUnit__hash' }, '', [link]);
  const doc = { title: 'Coupang search', querySelectorAll: selector => selector.includes('ProductUnit') ? [card] : [], querySelector: () => null };
  const report = runWithDoc(doc).scanCurrentPage();

  assert.equal(report.status, 'UNSUPPORTED_OR_INCOMPLETE_CARDS');
  assert.equal(report.count, 0);
});

test('Incomplete cards skipped & duplicate representations deduped within scan', () => {
  // Card 1: Valid
  const link1 = new MockElement('a', { href: '/vp/products/10001?vendorItemId=20001' });
  const title1 = new MockElement('div', { class: 'ProductUnit_productNameV2__cV9cw' }, 'Hợp lệ 1');
  const price1 = new MockElement('span', {}, '50,000원');
  link1.appendChild(title1);
  link1.appendChild(price1);
  const card1 = new MockElement('li', { class: 'ProductUnit_productUnit__Qd6sv' }, '', [link1]);

  // Card 2: Duplicate of Card 1
  const link2 = new MockElement('a', { href: '/vp/products/10001?vendorItemId=20002' });
  const title2 = new MockElement('div', { class: 'ProductUnit_productNameV2__cV9cw' }, 'Hợp lệ 1 trùng lặp');
  const price2 = new MockElement('span', {}, '50,000원');
  link2.appendChild(title2);
  link2.appendChild(price2);
  const card2 = new MockElement('li', { class: 'ProductUnit_productUnit__Qd6sv' }, '', [link2]);

  // Card 3: Invalid - Missing price
  const link3 = new MockElement('a', { href: '/vp/products/10002' });
  const title3 = new MockElement('div', { class: 'ProductUnit_productNameV2__cV9cw' }, 'Không có giá');
  link3.appendChild(title3);
  const card3 = new MockElement('li', { class: 'ProductUnit_productUnit__Qd6sv' }, '', [link3]);

  // Card 4: Invalid - Shop link
  const link4 = new MockElement('a', { href: 'https://shop.coupang.com/store' });
  const title4 = new MockElement('div', { class: 'ProductUnit_productNameV2__cV9cw' }, 'Shop link');
  const price4 = new MockElement('span', {}, '30,000원');
  link4.appendChild(title4);
  link4.appendChild(price4);
  const card4 = new MockElement('li', { class: 'ProductUnit_productUnit__Qd6sv' }, '', [link4]);

  // Card 5: Valid minimal
  const link5 = new MockElement('a', { href: '/vp/products/10003' });
  const title5 = new MockElement('div', { class: 'ProductUnit_productNameV2__cV9cw' }, 'Hợp lệ 2');
  const price5 = new MockElement('span', {}, '70,000원');
  link5.appendChild(title5);
  link5.appendChild(price5);
  const card5 = new MockElement('li', { class: 'ProductUnit_productUnit__Qd6sv' }, '', [link5]);

  const doc = {
    title: 'Coupang search',
    querySelectorAll: (sel) => [card1, card2, card3, card4, card5],
    querySelector: (sel) => null
  };

  const extractor = runWithDoc(doc);
  const items = extractor.extractListingProducts();

  assert.equal(items.length, 2, 'Only 2 unique valid products should be extracted');
  assert.equal(items[0].productId, '10001');
  assert.equal(items[1].productId, '10003');
  assert.equal(items.diagnostics.duplicateCardsCount, 1);
  assert.equal(items.diagnostics.incompleteCardsCount, 2);
});

test('Detail page scan: extracts single product with honest null rank', () => {
  const doc = {
    title: '차량용 암막커튼 - 쿠팡!',
    pathname: '/vp/products/55555555',
    querySelector: (sel) => {
      if (sel.includes('prod-buy-header__title')) return { textContent: '차량용 암막커튼' };
      if (sel.includes('total-price')) return { textContent: '85,000원' };
      if (sel.includes('prod-image__detail')) return { src: 'https://thumbnail.coupang.com/curtain.jpg' };
      if (sel.includes('prod-review__count')) return { textContent: '(42개 상품평)' };
      return null;
    },
    querySelectorAll: () => []
  };

  const extractor = runWithDoc(doc, '/vp/products/55555555', '');
  const report = extractor.scanCurrentPage();

  assert.equal(report.status, 'SUCCESS');
  assert.equal(report.isDetailPage, true);
  assert.equal(report.count, 1);
  assert.equal(report.items[0].productId, '55555555');
  assert.equal(report.items[0].salesPriceKrw, 85000);
  assert.equal(report.items[0].rank, null);
  assert.equal(report.items[0].reviewCount, 42);
});
