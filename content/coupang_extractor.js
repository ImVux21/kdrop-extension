/**
 * COUPANG EXTRACTOR CONTENT SCRIPT
 * Bóc tách trực tiếp DOM và dữ liệu JSON của Coupang trong phiên duyệt web người dùng
 * 
 * Tuân thủ nghiêm ngặt nguyên tắc trung thực dữ liệu:
 * - Hỗ trợ thẻ ProductUnit, card homepage Coupang và danh sách cũ (legacy)
 * - Tách bạch rõ ràng Product ID và vendorItemId
 * - Tách giá bán hiện tại khỏi giá gạch (crossed-out), đơn giá (unit price), chiết khấu và phí vận chuyển
 * - Không tự ý bịa đặt rank 1, rating 4.8 hay 100 review; các trường không có giữ unknown (null)
 * - Vị trí danh sách tìm kiếm (listingPosition) được lưu cùng ngữ cảnh trang, không tự coi là BSR
 * - Tách card homepage khỏi banner; chỉ nhập card có dữ liệu bắt buộc đã quan sát
 */

(function() {
  /**
   * Bóc tách giá bán thực tế (sale price) của thẻ sản phẩm
   * Tách bạch khỏi giá gốc gạch ngang (<del>), đơn giá (unit price), giảm giá (%) và phí ship
   */
  function extractCardSalesPrice(cardEl, priceAreaEl) {
    // 1. Kiểm tra selector legacy trực tiếp nếu không nằm trong thẻ gạch/đơn giá
    const legacyEl = cardEl.querySelector('.price-value, .total-price strong, .prod-price strong');
    if (legacyEl && !legacyEl.closest('del, s, strike, [class*="unit-price"], [class*="unitPrice"], [class*="unit_price"]')) {
      const txt = legacyEl.textContent.trim();
      if (!txt.includes('당') && !txt.includes('%')) {
        const val = parseInt(txt.replace(/[^0-9]/g, ''), 10);
        if (val > 0) return val;
      }
    }

    // 2. Tìm kiếm trong khu vực giá (PriceArea)
    const targetArea = priceAreaEl || cardEl;
    const candidates = Array.from(targetArea.querySelectorAll('span, strong, em, b, div, p')).filter(node => {
      const text = node.textContent.trim();
      if (!text.includes('원')) return false;

      // Loại bỏ giá gốc gạch ngang (cả phần tử là del và phần tử chứa del/s/strike/base-price)
      if (
        node.closest('del, s, strike, [class*="base-price"], [class*="origin-price"], [class*="original-price"]') ||
        node.querySelector('del, s, strike, [class*="base-price"], [class*="origin-price"], [class*="original-price"]')
      ) {
        return false;
      }

      // Loại bỏ đơn giá (ví dụ: 1개당 ..., 10g당 ...)
      if (text.includes('당') || node.closest('[class*="unit-price"], [class*="unitPrice"], [class*="unit_price"]')) {
        return false;
      }
      if (/^\([^)]*당[^)]*\)$/.test(text) || (/^\([^)]*\)$/.test(text) && text.includes('개당'))) {
        return false;
      }

      // Loại bỏ thông tin khuyến mãi/phí vận chuyển/điểm thưởng
      if (/배송|적립|쿠폰|캐시|포인트/.test(text)) {
        return false;
      }

      // A won amount in shipping/fee UI is not the product's sale price.
      for (let ancestor = node; ancestor; ancestor = ancestor.parentElement || ancestor.parentNode) {
        const className = typeof ancestor.getAttribute === 'function' ? (ancestor.getAttribute('class') || '') : '';
        const id = typeof ancestor.getAttribute === 'function' ? (ancestor.getAttribute('id') || '') : '';
        if (/(?:shipping|delivery|fee|배송비)/i.test(`${className} ${id}`)) return false;
        if (ancestor === targetArea) break;
      }

      // Ưu tiên phần tử lá chứa chữ '원'
      const hasChildWon = Array.from(node.children).some(child => {
        const cText = child.textContent.trim();
        return cText.includes('원') && !child.closest('del, s, strike');
      });
      if (hasChildWon) return false;

      return true;
    });

    const observedPrices = new Set();
    for (const node of candidates) {
      const text = node.textContent.trim();
      const match = text.match(/([\d,]+)\s*원/);
      if (match) {
        const val = parseInt(match[1].replace(/,/g, ''), 10);
        if (val > 0) observedPrices.add(val);
      }
    }

    // Multiple distinct amounts without an explicit sale-price role are ambiguous.
    return observedPrices.size === 1 ? observedPrices.values().next().value : 0;
  }

  function getValidatedProductUrl(rawHref) {
    if (!rawHref) return null;
    try {
      const base = window.location?.origin || 'https://www.coupang.com';
      const url = new URL(rawHref, base);
      const isCoupangHost = url.hostname === 'coupang.com' || url.hostname.endsWith('.coupang.com');
      if (!isCoupangHost || !/^https?:$/.test(url.protocol)) return null;
      const productMatch = url.pathname.match(/^\/vp\/products\/(\d+)(?:\/|$)/);
      if (!productMatch || productMatch[1] === '0') return null;
      return { url: url.toString(), productId: productMatch[1], sourceType: url.searchParams.get('sourceType') || null };
    } catch (_) {
      return null;
    }
  }

  /**
   * Trích xuất dữ liệu khi ở trang danh mục / danh sách tìm kiếm Coupang
   */
  function extractListingProducts() {
    const items = [];
    const diagnostics = {
      incompleteCardsCount: 0,
      duplicateCardsCount: 0,
      productLinksFound: 0
    };
    const seenProductIds = new Set();
    const isHomepage = Boolean(
      window.location.pathname === '/' ||
      window.location.pathname === '' ||
      window.location.pathname === '/index.html' ||
      document.querySelector('#todayDiscoveryUnit, .today-discovery')
    );

    // Tìm kiếm các phần tử thẻ sản phẩm hỗ trợ cả cấu trúc ProductUnit hiện tại và legacy
    const rawCandidates = Array.from(document.querySelectorAll(
      'li.search-product, li.baby-product, .search-product-list > li, .search-product-list li, ' +
      'li[class*="ProductUnit_productUnit"], li[class*="productUnit"], li[class*="ProductUnit"], ' +
      '[class*="ProductUnit_productUnit"], [class*="productUnit"], [class*="ProductUnit"], ' +
      '#product-list > li, #productList > li, ul[class*="productList"] > li, ul[class*="product-list"] > li, ' +
      '#personalizedGW a[href*="/vp/products/"], #categoryBestUnit a.product-unit[href*="/vp/products/"], ' +
      '[id^="categoryBest_"] a.product-unit[href*="/vp/products/"]'
    ));

    // Lọc bỏ banner quảng cáo trang chủ và các phần tử con lồng nhau
    const cardElements = rawCandidates.filter(el => {
      // Loại bỏ banner trang chủ
      if (el.closest('#todayDiscoveryUnit, .today-discovery, .banner-list, .carousel-banner, #main-banner')) {
        return false;
      }
      // Giữ lại phần tử thẻ cấp cao nhất (tránh chọn trùng phần tử lồng)
      return !rawCandidates.some(other => other !== el && (typeof other.contains === 'function' ? other.contains(el) : false));
    });

    cardElements.forEach((el, index) => {
      try {
        // 1. Tìm liên kết sản phẩm
        const isAnchorCard = String(el.tagName || '').toLowerCase() === 'a';
        const linkEl = (isAnchorCard && /\/vp\/products\//.test(el.getAttribute('href') || ''))
          ? el
          : (el.querySelector('a[href*="/vp/products/"]') || el.querySelector('a'));
        const rawHref = linkEl ? (linkEl.getAttribute('href') || linkEl.href || '') : '';
        const validatedLink = getValidatedProductUrl(rawHref);
        const fullUrl = validatedLink?.url || '';

        // 2. Xác định Product ID
        let productId = '';
        if (validatedLink) {
          productId = validatedLink.productId;
        } else {
          // Hỗ trợ thuộc tính legacy data-product-id
          const legacyId = el.getAttribute('data-product-id');
          if (legacyId && /^\d+$/.test(legacyId) && legacyId !== '0' && (!rawHref || validatedLink)) {
            // Không nhận các liên kết cửa hàng/chiến dịch
            if (!/shop\.coupang\.com|\/campaign\/|\/events\//i.test(fullUrl || rawHref)) {
              productId = legacyId;
            }
          }
        }

        if (!productId) {
          diagnostics.incompleteCardsCount++;
          return;
        }
        if (validatedLink && validatedLink.productId !== productId) {
          diagnostics.incompleteCardsCount++;
          return;
        }

        // 3. Tách biệt vendorItemId
        let vendorItemId = '';
        const matchVendor = (fullUrl || rawHref).match(/[?&]vendorItemId=(\d+)/);
        if (matchVendor && matchVendor[1] !== '0') {
          vendorItemId = matchVendor[1];
        } else if (el.getAttribute('data-vendor-item-id') && /^\d+$/.test(el.getAttribute('data-vendor-item-id'))) {
          vendorItemId = el.getAttribute('data-vendor-item-id');
        } else if (el.getAttribute('data-id') && /^\d+$/.test(el.getAttribute('data-id')) && el.getAttribute('data-id') !== productId) {
          vendorItemId = el.getAttribute('data-id');
        }

        // 4. Tiêu đề sản phẩm Hàn Quốc
        const titleEl = el.querySelector(
          '[class*="ProductUnit_productName"], [class*="productName"], [class*="ProductTitle"], [class*="productTitle"], ' +
          '.name, .title, .prod-title, [class*="product-name"], [class*="prod-name"]'
        );
        let titleKr = titleEl ? titleEl.textContent.trim() : '';
        if (!titleKr && linkEl) {
          const imageAlt = linkEl.querySelector('img')?.getAttribute('alt') || '';
          titleKr = (linkEl.getAttribute('title') || linkEl.getAttribute('aria-label') || imageAlt).trim();
        }

        if (!titleKr) {
          diagnostics.incompleteCardsCount++;
          return;
        }

        // 5. Giá bán hiện tại và giá gốc gạch ngang
        const priceAreaEl = el.querySelector('[class*="PriceArea_priceArea"], [class*="priceArea"], [class*="price-area"], .price, .prod-price') || el;

        let originalPriceKrw = null;
        const delEl = priceAreaEl.querySelector('del, s, strike, [class*="base-price"], [class*="origin-price"], [class*="original-price"]');
        if (delEl) {
          const delTxt = delEl.textContent.replace(/[^0-9]/g, '');
          if (delTxt) originalPriceKrw = parseInt(delTxt, 10);
        }

        let discountRate = 0;
        const discountEl = priceAreaEl.querySelector('.discount-percentage, [class*="discountPercentage"], [class*="discount-rate"], [class*="discount"]');
        if (discountEl) {
          const m = discountEl.textContent.match(/(\d+)%/);
          if (m) discountRate = parseInt(m[1], 10);
        }

        const salesPriceKrw = extractCardSalesPrice(el, priceAreaEl);
        if (!salesPriceKrw || salesPriceKrw <= 0) {
          diagnostics.incompleteCardsCount++;
          return;
        }

        // 6. Khử trùng lặp (Deduplication) theo Product ID trong phạm vi lượt quét
        if (seenProductIds.has(productId)) {
          diagnostics.duplicateCardsCount++;
          return;
        }
        seenProductIds.add(productId);

        // 7. Thumbnail ảnh sản phẩm (hỗ trợ lazy-loading)
        const imgEl = el.querySelector(
          'img.search-product-wrap-img, img[class*="ProductUnit_image"], img[class*="productUnit"], ' +
          'img[class*="image"], [class*="imageArea"] img, [class*="image-area"] img, img'
        );
        let thumbnailUrl = '';
        if (imgEl) {
          const rawSrc = imgEl.src || (typeof imgEl.getAttribute === 'function' ? imgEl.getAttribute('src') : null) || '';
          const dataSrc = (typeof imgEl.getAttribute === 'function' ? (
            imgEl.getAttribute('data-src') ||
            imgEl.getAttribute('data-img-src') ||
            imgEl.getAttribute('data-origin-src') ||
            imgEl.getAttribute('srcset')
          ) : null) || '';

          const isPlaceholder = !rawSrc || /placeholder|blank|\.gif$/i.test(rawSrc) || rawSrc.startsWith('data:image');
          let chosen = (isPlaceholder && dataSrc) ? dataSrc : (rawSrc || dataSrc);
          if (chosen) {
            if (chosen.includes(',')) chosen = chosen.split(',')[0].trim().split(/\s+/)[0];
            else if (/\s+\d+(?:\.\d+)?x?\s*$/i.test(chosen)) chosen = chosen.trim().split(/\s+/)[0];
            if (chosen.startsWith('//')) chosen = 'https:' + chosen;
            else if (chosen.startsWith('/')) chosen = 'https://www.coupang.com' + chosen;
            thumbnailUrl = chosen;
          }
        }

        // 8. Đánh giá (Rating) từ aria-label accessibility hoặc DOM
        let rating = null;
        const ratingContainer = el.querySelector(
          '[class*="ProductRating_productRating"], [class*="productRating"], [class*="ProductRating"], ' +
          '.rating, [class*="rating"]'
        );
        if (ratingContainer) {
          const ariaEl = ratingContainer.getAttribute('aria-label') ? ratingContainer : ratingContainer.querySelector('[aria-label]');
          if (ariaEl) {
            const label = ariaEl.getAttribute('aria-label') || '';
            const m = label.match(/([\d.]+)/);
            if (m) {
              const val = parseFloat(m[1]);
              if (Number.isFinite(val) && val >= 0 && val <= 5) {
                rating = val;
              }
            }
          }

          if (rating === null) {
            const text = ratingContainer.textContent.trim();
            const m = text.match(/^([\d.]+)/);
            if (m) {
              const val = parseFloat(m[1]);
              if (Number.isFinite(val) && val >= 0 && val <= 5) {
                rating = val;
              }
            }
          }

          if (rating === null) {
            const starEl = ratingContainer.querySelector('[style*="width"]') || (ratingContainer.getAttribute('style')?.includes('width') ? ratingContainer : null);
            if (starEl) {
              const style = (typeof starEl.getAttribute === 'function' ? starEl.getAttribute('style') : starEl.style) || '';
              const match = String(style).match(/width:\s*([\d.]+)%/i);
              if (match) {
                const pct = parseFloat(match[1]);
                if (Number.isFinite(pct) && pct > 0) {
                  rating = Math.round((pct / 20) * 10) / 10;
                }
              }
            }
          }
        }

        // 9. Số lượng review sản phẩm
        let reviewCount = null;
        const countEl = el.querySelector('.rating-total-count, .prod-review__count');
        if (countEl) {
          const parsed = parseInt(countEl.textContent.replace(/[^0-9]/g, ''), 10);
          if (Number.isFinite(parsed)) reviewCount = parsed;
        }

        if (reviewCount === null && ratingContainer) {
          const text = ratingContainer.textContent;
          const match = text.match(/\(\s*([\d,]+)\s*\)/);
          if (match) {
            const parsed = parseInt(match[1].replace(/,/g, ''), 10);
            if (Number.isFinite(parsed)) reviewCount = parsed;
          }
        }

        // 10. Rocket Status
        const rocketImg = el.querySelector('img[src*="rocket"], img[src*="badges_rocket"], img[data-badge-id^="ROCKET_"], .badge.rocket');
        const rocketBadgeEl = el.querySelector('[class*="RocketBadge"], [class*="rocketBadge"], [class*="badge-rocket"], [aria-label*="로켓"], [aria-label*="Rocket"]');
        let isRocket = null;
        let rocketType = 'UNKNOWN';
        if (rocketImg || rocketBadgeEl) {
          isRocket = true;
          const combined = ((rocketImg?.src || '') + ' ' + (rocketImg?.getAttribute('data-badge-id') || '') + ' ' + (rocketBadgeEl?.className || '') + ' ' + (rocketBadgeEl?.getAttribute('aria-label') || '') + ' ' + (rocketBadgeEl?.textContent || '')).toLowerCase();
          if (combined.includes('growth') || combined.includes('cgf') || combined.includes('그로스')) {
            rocketType = 'ROCKET_GROWTH';
          } else if (rocketImg?.getAttribute('data-badge-id') === 'ROCKET_MERCHANT') {
            // Coupang’s listing badge identifies a Rocket merchant, not a specific fulfillment type.
            rocketType = 'UNKNOWN';
          } else {
            rocketType = 'ROCKET_DELIVERY';
          }
        }

        // 11. BSR rank và vị trí tìm kiếm
        // Tìm kiếm thông thường và đề xuất không được tự gán rank BSR
        let rank = null;
        // Ranking markup and URL patterns vary; no captured Coupang BSR contract exists yet.
        // Keep rank unknown until a supported ranking layout can be verified from observed data.

        const productUrl = fullUrl || `https://www.coupang.com/vp/products/${productId}`;
        const listingSourceType = validatedLink?.sourceType || null;
        const listingSection = isHomepage
          ? (el.closest('#personalizedGW, #categoryBestUnit, [id^="categoryBest_"]')?.id || 'homepage')
          : null;
        const isAdvertised = listingSourceType
          ? (/ads$/i.test(listingSourceType) ? true : null)
          : null;

        items.push({
          id: `coupang_${productId}`,
          productId,
          vendorItemId,
          rank,
          listingPosition: index + 1,
          listingPageContext: document.title || 'Coupang Search List',
          listingSection,
          listingSourceType,
          isAdvertised,
          titleKr,
          salesPriceKrw,
          discountRate,
          originalPriceKrw,
          rating,
          reviewCount,
          thumbnailUrl,
          productUrl,
          isRocket,
          rocketType,
          cogs1688Cny: null, // Không tự bịa giá xưởng
          isWatchlist: false,
          observedAt: new Date().toISOString()
        });
      } catch (err) {
        console.warn('Lỗi trích xuất 1 sản phẩm:', err);
      }
    });

    try {
      diagnostics.productLinksFound = document.querySelectorAll('a[href*="/vp/products/"]').length;
    } catch (_) {
      diagnostics.productLinksFound = 0;
    }

    // Đính kèm thông tin chẩn đoán vào mảng kết quả
    items.diagnostics = {
      totalCardsFound: cardElements.length,
      validProductsCount: items.length,
      incompleteCardsCount: diagnostics.incompleteCardsCount,
      duplicateCardsCount: diagnostics.duplicateCardsCount,
      productLinksFound: diagnostics.productLinksFound,
      isHomepage
    };

    return items;
  }

  /**
   * Trích xuất khi ở trang chi tiết sản phẩm đơn lẻ
   * Không tự bịa rank 1, rating 4.8 hay 100 reviews!
   */
  function extractSingleProduct() {
    try {
      const match = window.location.pathname.match(/\/vp\/products\/(\d+)/);
      const productId = match ? match[1] : (document.querySelector('[data-product-id]')?.getAttribute('data-product-id') || '');
      
      if (!productId || productId === '0') {
        console.warn('Không tìm thấy Product ID hợp lệ trên trang chi tiết');
        return null;
      }

      const titleEl = document.querySelector('.prod-buy-header__title, h1.prod-title');
      const titleKr = titleEl ? titleEl.textContent.trim() : document.title.replace(' - 쿠팡!', '').trim();

      const priceEl = document.querySelector('.total-price strong, .prod-sale-price strong');
      let salesPriceKrw = priceEl ? parseInt(priceEl.textContent.replace(/[^0-9]/g, ''), 10) || 0 : 0;
      if (salesPriceKrw <= 0) {
        salesPriceKrw = extractCardSalesPrice(document.body, document.querySelector('.prod-buy, .prod-buy-header, .prod-price-container'));
      }

      if (salesPriceKrw <= 0) {
        console.warn('Không trích xuất được giá bán hợp lệ của sản phẩm');
        return null;
      }

      const imgEl = document.querySelector('.prod-image__detail, #repImageContainer img');
      let thumbnailUrl = '';
      if (imgEl) {
        const rawSrc = imgEl.src || '';
        const dataSrc = (typeof imgEl.getAttribute === 'function' ? (imgEl.getAttribute('data-src') || imgEl.getAttribute('data-img-src') || imgEl.getAttribute('data-origin-src')) : null) || '';
        const isPlaceholder = !rawSrc || /placeholder|blank|\.gif$/i.test(rawSrc);
        thumbnailUrl = (isPlaceholder && dataSrc) ? dataSrc : (rawSrc || dataSrc);
        if (thumbnailUrl.startsWith('//')) thumbnailUrl = 'https:' + thumbnailUrl;
      }

      // Check Rocket Status
      const rocketImg = document.querySelector('img[src*="rocket"], img[src*="badges_rocket"]');
      const badgeEl = document.querySelector('.prod-badge[class*="rocket"], .badge.rocket');
      const prodBadge = document.querySelector('.prod-badge');

      let isRocket = false;
      let rocketType = 'NONE';

      let badgeText = '';
      if (prodBadge) badgeText = prodBadge.textContent.trim();

      if (rocketImg || badgeEl || /로켓|rocket/i.test(badgeText)) {
        isRocket = true;
        const src = rocketImg ? (rocketImg.src || '').toLowerCase() : '';
        if (src.includes('growth') || src.includes('cgf') || /growth|cgf|그로스/i.test(badgeText)) {
          rocketType = 'ROCKET_GROWTH';
        } else {
          rocketType = 'ROCKET_DELIVERY';
        }
      }

      // Rating thực tế
      const ratingEl = document.querySelector('.rating, .prod-review__rating, .prod-rating');
      let rating = null;
      if (ratingEl) {
        const parsedRating = parseFloat(ratingEl.textContent.trim());
        if (Number.isFinite(parsedRating) && parsedRating > 0) {
          rating = parsedRating;
        } else {
          const starEl = ratingEl.querySelector ? (ratingEl.querySelector('[style*="width"]') || (typeof ratingEl.getAttribute === 'function' && ratingEl.getAttribute('style')?.includes('width') ? ratingEl : null)) : null;
          if (starEl) {
            const style = (typeof starEl.getAttribute === 'function' ? starEl.getAttribute('style') : starEl.style) || '';
            const match = String(style).match(/width:\s*([\d.]+)%/i);
            if (match) {
              const pct = parseFloat(match[1]);
              if (Number.isFinite(pct) && pct > 0) {
                rating = Math.round((pct / 20) * 10) / 10;
              }
            }
          }
        }
      }

      // Review count thực tế
      let reviewEl = document.querySelector('.prod-review__count, .rating-total-count');
      if (!reviewEl && typeof document.querySelectorAll === 'function') {
        const counts = document.querySelectorAll('.count');
        for (const c of counts) {
          if (!c.textContent?.includes('장바구니') && (!c.closest || !c.closest('.cart-total, #cart, .cart'))) {
            reviewEl = c;
            break;
          }
        }
      } else if (!reviewEl) {
        const cand = document.querySelector('.count');
        if (cand && !cand.textContent?.includes('장바구니')) {
          reviewEl = cand;
        }
      }
      let reviewCount = null;
      if (reviewEl) {
        const parsedCount = parseInt(reviewEl.textContent.replace(/[^0-9]/g, ''), 10);
        if (Number.isFinite(parsedCount)) reviewCount = parsedCount;
      }

      const urlParams = new URLSearchParams(window.location.search);
      const vendorItemId = urlParams.get('vendorItemId') || 
                           document.querySelector('input[name="vendorItemId"]')?.value || 
                           '';

      return {
        id: `coupang_${productId}`,
        productId,
        vendorItemId,
        rank: null,
        listingPosition: null,
        listingPageContext: 'Product Detail Page',
        titleKr,
        salesPriceKrw,
        discountRate: 0,
        rating,
        reviewCount,
        thumbnailUrl,
        productUrl: window.location.href,
        isRocket,
        rocketType,
        cogs1688Cny: null,
        isWatchlist: false,
        observedAt: new Date().toISOString()
      };
    } catch (err) {
      console.error('Lỗi extract single product:', err);
      return null;
    }
  }

  /**
   * Phương thức quét dùng chung kết hợp chẩn đoán cho cả In-page Button và Sidepanel
   */
  function scanCurrentPage() {
    const isDetailPage = window.location.pathname.includes('/vp/products/');
    if (isDetailPage) {
      const single = extractSingleProduct();
      if (single) {
        return {
          status: 'SUCCESS',
          isDetailPage: true,
          items: [single],
          count: 1,
          message: 'Đã phát hiện sản phẩm từ trang chi tiết.'
        };
      }
      return {
        status: 'INVALID_DETAIL',
        isDetailPage: true,
        items: [],
        count: 0,
        message: 'Không trích xuất được thông tin sản phẩm hợp lệ từ trang chi tiết (thiếu Product ID hoặc giá bán).'
      };
    }

    const items = extractListingProducts();
    const diag = items.diagnostics || {};

    if (items.length > 0) {
      return {
        status: 'SUCCESS',
        isDetailPage: false,
        items,
        count: items.length,
        message: `Đã phát hiện ${items.length} sản phẩm hợp lệ.`
      };
    }

    if (diag.totalCardsFound > 0 || diag.productLinksFound > 0) {
      return {
        status: 'UNSUPPORTED_OR_INCOMPLETE_CARDS',
        isDetailPage: false,
        items: [],
        count: 0,
        message: `Phát hiện ${diag.productLinksFound || diag.totalCardsFound} thẻ sản phẩm nhưng thiếu thông tin mã, tên hoặc giá bán rõ ràng. Vui lòng tải lại trang hoặc thử trang danh mục/chi tiết.`
      };
    }

    if (diag.isHomepage) {
      return {
        status: 'HOMEPAGE',
        isDetailPage: false,
        items: [],
        count: 0,
        message: 'Trang chủ Coupang chưa thấy thẻ sản phẩm có thể nhập. Vui lòng mở trang tìm kiếm, danh mục hoặc chi tiết sản phẩm; nếu nội dung đang tải, hãy chờ rồi quét lại.'
      };
    }

    return {
      status: 'NO_CARDS',
      isDetailPage: false,
      items: [],
      count: 0,
      message: 'Không tìm thấy danh sách sản phẩm trên trang này. Vui lòng mở trang tìm kiếm, danh mục hoặc trang chi tiết sản phẩm của Coupang.'
    };
  }

  function getPaginationState() {
    const currentUrl = new URL(window.location.href);
    const currentPage = Number(currentUrl.searchParams.get('page') || 1);
    if (!/^\/np\/(?:categories\/\d+|search)\/?$/.test(currentUrl.pathname) || !Number.isSafeInteger(currentPage) || currentPage < 1) {
      return { currentPage: null, nextUrl: null, supported: false };
    }
    const pager = document.querySelector('[class*="Pagination_pagination"], .search-pagination, .page-container');
    if (!pager) return { currentPage, nextUrl: null, supported: false };
    const scopeKey = url => JSON.stringify(Array.from(url.searchParams.entries()).filter(([key]) => key !== 'page').sort());
    const links = Array.from(pager.querySelectorAll('a[href]'));
    const next = links.find(link => {
      if (link.getAttribute('aria-disabled') === 'true' || /disabled/i.test(link.className || '')) return false;
      try {
        const url = new URL(link.getAttribute('href'), currentUrl);
        return url.origin === currentUrl.origin && url.pathname === currentUrl.pathname &&
          Number(url.searchParams.get('page')) === currentPage + 1 && scopeKey(url) === scopeKey(currentUrl);
      } catch (_) { return false; }
    });
    const hasUnusableNextLink = !next && links.some(link =>
      link.getAttribute('aria-disabled') !== 'true' && !/disabled/i.test(link.className || '') &&
      (link.getAttribute('data-page') === 'next' || Number(link.getAttribute('data-page')) > currentPage || link.getAttribute('rel') === 'next' || /nextBtn|btn-next|next-page/i.test(link.className || ''))
    );
    return { currentPage, nextUrl: next ? new URL(next.getAttribute('href'), currentUrl).href : null, supported: !hasUnusableNextLink };
  }

  window.KDropCoupangExtractor = {
    extractListingProducts,
    extractSingleProduct,
    scanCurrentPage,
    getPaginationState
  };
})();
