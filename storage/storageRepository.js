/**
 * STORAGE REPOSITORY (K-Drop Studio)
 * Tầng giao tiếp dữ liệu client-side lưu trực tiếp vào chrome.storage.local
 * 
 * Đảm bảo:
 * - Versioned Product Schema (Schema v2) và di chuyển dữ liệu (Migration) lũy tích (Idempotent)
 * - Tách biệt dữ liệu thị trường quan sát (Observed) với dữ liệu người dùng (Sourcing, Economics, Evidence)
 * - Nghiêm ngặt bảo toàn giá nhập tay, watchlist, chứng cứ và internal ID khi quét lại (Rescan)
 * - Serialization chống xung đột ghi đồng thời (Atomic mutation queue)
 * - Xử lý lỗi lưu trữ tin cậy: không báo thành công giả khi storage ghi thất bại
 * - Bắn thông báo cập nhật (Broadcast) đến các view đang mở
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      typeof require === 'function' ? require('../core/kcRules.js') : null,
      typeof require === 'function' ? require('../core/materialEngine.js') : null,
      typeof require === 'function' ? require('../core/feeCalculator.js') : null,
      typeof require === 'function' ? require('../core/winAlgorithm.js') : null
    );
  } else {
    root.KDropStorage = factory(
      root.KDropKcRules,
      root.KDropMaterialEngine,
      root.KDropFeeCalculator,
      root.KDropWinAlgorithm
    );
  }
})(typeof self !== 'undefined' ? self : this, function(injectedKc, injectedMat, injectedFee, injectedWin) {

  const KEY_PRODUCTS = 'kdrop_products';
  const KEY_CATEGORIES = 'kdrop_categories';
  const KEY_INITIALIZED = 'kdrop_initialized';
  const SCHEMA_VERSION = 2;
  const ASSESSMENT_RULES_REVISION = 2;

  function getKcRules() {
    return injectedKc || (typeof self !== 'undefined' ? self.KDropKcRules : null);
  }
  function getMaterialEngine() {
    return injectedMat || (typeof self !== 'undefined' ? self.KDropMaterialEngine : null);
  }
  function getFeeCalculator() {
    return injectedFee || (typeof self !== 'undefined' ? self.KDropFeeCalculator : null);
  }
  function getWinAlgorithm() {
    return injectedWin || (typeof self !== 'undefined' ? self.KDropWinAlgorithm : null);
  }

  // Mutex queue để serialize các tác vụ ghi vào storage
  let mutationQueue = Promise.resolve();

  async function acquireStorageLock(maxWaitMs = 5000) {
    const start = Date.now();
    const myTx = Math.random().toString(36).slice(2) + '_' + Date.now();
    while (Date.now() - start < maxWaitMs) {
      const currentLock = await getStorage('__kdrop_lock__');
      if (currentLock && (Date.now() - (currentLock.ts || 0)) < 2000 && currentLock.tx !== myTx) {
        await new Promise(r => setTimeout(r, Math.floor(Math.random() * 10) + 5));
        continue;
      }
      await setStorage('__kdrop_lock__', { tx: myTx, ts: Date.now() });
      await new Promise(r => setTimeout(r, 6));
      const verify = await getStorage('__kdrop_lock__');
      if (verify && verify.tx === myTx) {
        return myTx;
      }
      await new Promise(r => setTimeout(r, Math.floor(Math.random() * 10) + 5));
    }
    return null;
  }

  async function releaseStorageLock(myTx) {
    try {
      const current = await getStorage('__kdrop_lock__');
      if (current && current.tx === myTx) {
        await setStorage('__kdrop_lock__', null);
      }
    } catch (_) {}
  }

  function serializeMutation(fn) {
    const next = mutationQueue.then(async () => {
      const tx = await acquireStorageLock();
      try {
        return await fn();
      } finally {
        if (tx) await releaseStorageLock(tx);
      }
    });
    mutationQueue = next.catch(() => {});
    return next;
  }

  // R04: Kiểm tra xem có đang chạy trong Chrome Extension UI (dashboard/sidepanel/content script)
  // và cần chuyển giao quyền ghi duy nhất cho Service Worker không
  function shouldDelegateToServiceWorker() {
    return typeof chrome !== 'undefined' &&
           Boolean(chrome.runtime && chrome.runtime.id && typeof chrome.runtime.sendMessage === 'function') &&
           !(typeof ServiceWorkerGlobalScope !== 'undefined' && self instanceof ServiceWorkerGlobalScope) &&
           !(typeof window === 'undefined' && typeof importScripts === 'function');
  }

  function sendBackgroundRequest(message) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) return reject(new Error(runtimeError.message));
          if (!response) return reject(new Error('Không nhận được phản hồi từ background authority'));
          if (response.error) return reject(new Error(response.error));
          resolve(response);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function isBackgroundConnectionError(error) {
    return /message (?:port|channel) closed|receiving end does not exist|could not establish connection|extension context invalidated|background authority/i.test(error?.message || '');
  }

  async function delegateMutation(mutationType, ...args) {
    const request = { action: 'KDROP_MUTATE', mutationType, args };
    try {
      return (await sendBackgroundRequest(request)).result;
    } catch (error) {
      if (!isBackgroundConnectionError(error)) throw error;
      // Batch import upserts by Product ID and preserves dossiers, so replaying the same
      // batch is safe even when the first commit succeeded but its reply was lost.
      // Other mutations (e.g. toggles) must never be replayed automatically.
      if (mutationType === 'batchImportProducts' && !/context invalidated/i.test(error.message)) {
        try {
          await new Promise(resolve => setTimeout(resolve, 150));
          const health = await sendBackgroundRequest({ action: 'KDROP_HEALTH_CHECK' });
          if (!health.storageReady) throw error;
          return (await sendBackgroundRequest(request)).result;
        } catch (retryError) {
          if (!isBackgroundConnectionError(retryError)) throw retryError;
        }
      }
      let version = 'hiện tại';
      try { version = chrome.runtime.getManifest?.().version || version; } catch (_) {}
      const connectionError = new Error(`Mất kết nối với background K-Drop (${version}). Mở chrome://extensions, kiểm tra đúng thư mục K-Drop và nhấn Reload, sau đó F5 trang Coupang và mở lại sidepanel. Lần lưu chưa được xác nhận; hãy kiểm tra Studio rồi quét lại.`);
      connectionError.code = 'KDROP_BACKGROUND_DISCONNECTED';
      throw connectionError;
    }
  }

  // Helper Promise bọc chrome.storage.local / adapter
  function getStorage(key) {
    return new Promise((resolve, reject) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get([key], (res) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            const data = res ? res[key] : null;
            // Trả về bản sao snapshot cô lập để tránh thay đổi trực tiếp bộ nhớ không qua commit
            resolve(data ? JSON.parse(JSON.stringify(data)) : null);
          }
        });
        return;
      }

      // In-memory / localStorage fallback (cho test suite hoặc web environment)
      if (typeof globalThis !== 'undefined' && globalThis.__kdrop_test_storage__) {
        const val = globalThis.__kdrop_test_storage__[key];
        resolve(val !== undefined && val !== null ? JSON.parse(JSON.stringify(val)) : null);
        return;
      }

      if (typeof localStorage !== 'undefined') {
        try {
          const raw = localStorage.getItem(key);
          resolve(raw ? JSON.parse(raw) : null);
        } catch (e) {
          resolve(null);
        }
        return;
      }

      resolve(null);
    });
  }

  let customWriterHook = null;
  function _setCustomWriter(fn) {
    customWriterHook = fn;
  }

  function setStorage(key, value) {
    if (customWriterHook) {
      return customWriterHook({ [key]: value });
    }
    return new Promise((resolve, reject) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [key]: value }, () => {
          if (chrome.runtime && chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(true);
          }
        });
        return;
      }

      if (typeof globalThis !== 'undefined' && globalThis.__kdrop_test_storage__) {
        globalThis.__kdrop_test_storage__[key] = JSON.parse(JSON.stringify(value));
        resolve(true);
        return;
      }

      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(key, JSON.stringify(value));
          resolve(true);
        } catch (e) {
          reject(e);
        }
        return;
      }

      resolve(false);
    });
  }

  function setStorageMulti(items) {
    if (customWriterHook) {
      return customWriterHook(items);
    }
    return new Promise((resolve, reject) => {
      if (!items || typeof items !== 'object') {
        return resolve(true);
      }

      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set(items, () => {
          if (chrome.runtime && chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(true);
          }
        });
        return;
      }

      if (typeof globalThis !== 'undefined' && globalThis.__kdrop_test_storage__) {
        for (const [key, value] of Object.entries(items)) {
          globalThis.__kdrop_test_storage__[key] = JSON.parse(JSON.stringify(value));
        }
        resolve(true);
        return;
      }

      if (typeof localStorage !== 'undefined') {
        try {
          for (const [key, value] of Object.entries(items)) {
            localStorage.setItem(key, JSON.stringify(value));
          }
          resolve(true);
        } catch (e) {
          reject(e);
        }
        return;
      }

      resolve(true);
    });
  }

  function validateSourcingTerms(data = {}) {
    const errors = [];
    if (data.unitPriceCny !== undefined && data.unitPriceCny !== null && data.unitPriceCny !== '') {
      const val = Number(data.unitPriceCny);
      if (!Number.isFinite(val) || val < 0) {
        errors.push(`Đơn giá CNY không hợp lệ (${data.unitPriceCny})`);
      }
    }
    if (data.cogs1688Cny !== undefined && data.cogs1688Cny !== null && data.cogs1688Cny !== '') {
      const val = Number(data.cogs1688Cny);
      if (!Number.isFinite(val) || val < 0) {
        errors.push(`Giá vốn CNY không hợp lệ (${data.cogs1688Cny})`);
      }
    }
    if (data.quantity !== undefined && data.quantity !== null && data.quantity !== '') {
      const val = Number(data.quantity);
      if (!Number.isInteger(val) || val <= 0) {
        errors.push(`Số lượng dự kiến phải là số nguyên dương (${data.quantity})`);
      }
    }
    if (data.moq !== undefined && data.moq !== null && data.moq !== '') {
      const val = Number(data.moq);
      if (!Number.isInteger(val) || val <= 0) {
        errors.push(`MOQ xưởng phải là số nguyên dương (${data.moq})`);
      }
    }
    if (data.quoteDate !== undefined && data.quoteDate !== null && data.quoteDate !== '') {
      const str = String(data.quoteDate).trim();
      const parsed = Date.parse(str);
      if (isNaN(parsed) || str.length < 4) {
        errors.push(`Ngày báo giá không hợp lệ (${data.quoteDate})`);
      }
    }
    if (data.supplierUrl !== undefined && data.supplierUrl !== null && data.supplierUrl !== '') {
      let parsedUrl;
      try {
        if (typeof data.supplierUrl !== 'string') throw new Error('URL phải là chuỗi');
        parsedUrl = new URL(data.supplierUrl);
      } catch (_) {
        errors.push('URL báo giá xưởng không hợp lệ');
      }
      if (parsedUrl && !['http:', 'https:'].includes(parsedUrl.protocol)) {
        errors.push('URL báo giá xưởng phải dùng HTTP hoặc HTTPS');
      }
    }
    if (data.leadTimeDays !== undefined && data.leadTimeDays !== null && data.leadTimeDays !== '') {
      const val = Number(data.leadTimeDays);
      if (!Number.isInteger(val) || val < 0) {
        errors.push(`Thời gian sản xuất (ngày) phải là số nguyên không âm (${data.leadTimeDays})`);
      }
    }
    return errors;
  }

  // Bắn thông báo cập nhật dữ liệu đến các view đang mở
  function broadcastStorageUpdate(eventType, payload = {}) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          action: 'KDROP_STORAGE_UPDATED',
          eventType,
          payload,
          timestamp: new Date().toISOString()
        }, () => {
          // Xóa lỗi nếu không có listener nào đang lắng nghe (tránh log console rác)
          const err = chrome.runtime.lastError;
        });
      }
    } catch (e) {
      // Bỏ qua lỗi runtime broadcast
    }
  }

  /**
   * DI CHUYỂN DỮ LIỆU CŨ SANG SCHEMA V2 (IDEMPOTENT MIGRATION)
   */
  function migrateProduct(raw) {
    if (!raw || typeof raw !== 'object') return null;

    // Nếu đã ở Schema v2 và có revision đánh giá mới nhất thì chỉ cần tính lại derived
    if (raw.schemaVersion === SCHEMA_VERSION && raw.assessmentRevision === ASSESSMENT_RULES_REVISION && raw.marketData && raw.sourcingDossier && raw.evidenceDossier) {
      return enrichProduct(raw);
    }

    const productId = String(raw.productId || raw.id || '').replace(/^coupang_/, '').trim();
    if (!productId) return null;

    const internalId = raw.id || `coupang_${productId}`;
    const titleKr = raw.titleKr || raw.marketData?.titleKr || '';
    const observedSalesPrice = Number(raw.marketData?.salesPriceKrw || (raw.salesPriceKrw !== undefined ? raw.salesPriceKrw : null)) || null;
    const targetSalesPrice = Number(raw.economics?.targetSalesPriceKrw) || (observedSalesPrice > 0 ? observedSalesPrice : null);
    const cogs1688Cny = (raw.cogs1688Cny !== undefined && raw.cogs1688Cny !== null)
      ? Number(raw.cogs1688Cny)
      : (raw.sourcingDossier?.cogs1688Cny !== undefined ? Number(raw.sourcingDossier.cogs1688Cny) : null);

    const isRocket = raw.isRocket !== undefined ? Boolean(raw.isRocket) : null;
    const rocketType = raw.rocketType || (isRocket ? 'ROCKET_DELIVERY' : 'NONE');

    // Xác định nguồn gốc dữ liệu vốn 1688: bản ghi cũ được đánh dấu là LEGACY
    const sourcingProvenance = raw.sourcingDossier?.provenance || (cogs1688Cny !== null ? 'LEGACY' : 'HEURISTIC');

    // R07: Tách bạch rõ ràng listingPosition với verified BSR rank
    const listingPosition = (raw.listingPosition !== undefined && raw.listingPosition !== null)
      ? Number(raw.listingPosition)
      : null;
    const rank = (raw.rank !== undefined && raw.rank !== null && raw.isBestSellerPage)
      ? Number(raw.rank)
      : (raw.marketData?.rank !== undefined ? raw.marketData.rank : null);

    // F07: Presence-aware numbers
    const exchangeRate = (raw.economics?.exchangeRateCnyKrw !== undefined && raw.economics?.exchangeRateCnyKrw !== null)
      ? Number(raw.economics.exchangeRateCnyKrw)
      : (raw.exchangeRateCnyKrw !== undefined && raw.exchangeRateCnyKrw !== null ? Number(raw.exchangeRateCnyKrw) : null);

    const commissionRate = (raw.economics?.platformCommissionRate !== undefined && raw.economics?.platformCommissionRate !== null)
      ? Number(raw.economics.platformCommissionRate)
      : (raw.platformCommissionRate !== undefined && raw.platformCommissionRate !== null ? Number(raw.platformCommissionRate) : null);

    const shippingCost = (raw.economics?.shippingCostKrw !== undefined && raw.economics?.shippingCostKrw !== null)
      ? Number(raw.economics.shippingCostKrw)
      : (raw.shippingCostKrw !== undefined && raw.shippingCostKrw !== null ? Number(raw.shippingCostKrw) : null);

    const buyingAgentFeeRate = (raw.economics?.buyingAgentFeeRate !== undefined && raw.economics?.buyingAgentFeeRate !== null)
      ? Number(raw.economics.buyingAgentFeeRate)
      : (raw.buyingAgentFeeRate !== undefined && raw.buyingAgentFeeRate !== null ? Number(raw.buyingAgentFeeRate) : null);

    const buyingAgentFeeKrw = (raw.economics?.buyingAgentFeeKrw !== undefined && raw.economics?.buyingAgentFeeKrw !== null)
      ? Number(raw.economics.buyingAgentFeeKrw)
      : (raw.buyingAgentFeeKrw !== undefined && raw.buyingAgentFeeKrw !== null ? Number(raw.buyingAgentFeeKrw) : null);

    const buyingAgentFeeMode = raw.economics?.buyingAgentFeeMode || (buyingAgentFeeRate !== null ? 'PERCENTAGE' : 'FLAT');

    const adCost = (raw.economics?.adCostPerOrderKrw !== undefined && raw.economics?.adCostPerOrderKrw !== null)
      ? Number(raw.economics.adCostPerOrderKrw)
      : (raw.adCostPerOrderKrw !== undefined && raw.adCostPerOrderKrw !== null ? Number(raw.adCostPerOrderKrw) : null);

    const returnRate = (raw.economics?.returnAllowanceRate !== undefined && raw.economics?.returnAllowanceRate !== null)
      ? Number(raw.economics.returnAllowanceRate)
      : (raw.returnAllowanceRate !== undefined && raw.returnAllowanceRate !== null ? Number(raw.returnAllowanceRate) : null);

    const returnKrw = (raw.economics?.returnAllowanceKrw !== undefined && raw.economics?.returnAllowanceKrw !== null)
      ? Number(raw.economics.returnAllowanceKrw)
      : (raw.returnAllowanceKrw !== undefined && raw.returnAllowanceKrw !== null ? Number(raw.returnAllowanceKrw) : null);

    const returnAllowanceMode = raw.economics?.returnAllowanceMode || (returnKrw !== null ? 'FIXED' : 'PERCENTAGE');

    const otherCost = (raw.economics?.otherCostPerOrderKrw !== undefined && raw.economics?.otherCostPerOrderKrw !== null)
      ? Number(raw.economics.otherCostPerOrderKrw)
      : (raw.otherCostPerOrderKrw !== undefined && raw.otherCostPerOrderKrw !== null ? Number(raw.otherCostPerOrderKrw) : null);

    const migrated = {
      schemaVersion: SCHEMA_VERSION,
      assessmentRevision: ASSESSMENT_RULES_REVISION,
      id: internalId,
      productId,
      vendorItemId: raw.vendorItemId || '',
      niche: raw.niche || 'custom',
      nicheName: raw.nicheName || 'Danh mục tùy chỉnh',
      isWatchlist: Boolean(raw.isWatchlist),

      marketData: {
        titleKr,
        salesPriceKrw: observedSalesPrice,
        originalPriceKrw: Number(raw.originalPriceKrw) || null,
        discountRate: Number(raw.discountRate) || 0,
        rating: (raw.rating !== undefined && raw.rating !== null && raw.rating > 0) ? Number(raw.rating) : null,
        reviewCount: (raw.reviewCount !== undefined && raw.reviewCount !== null && raw.reviewCount >= 0) ? Number(raw.reviewCount) : null,
        thumbnailUrl: raw.thumbnailUrl || '',
        productUrl: raw.productUrl || `https://www.coupang.com/vp/products/${productId}`,
        isRocket,
        rocketType,
        listingPosition,
        listingPageContext: raw.listingPageContext || null,
        listingSection: raw.listingSection ?? raw.marketData?.listingSection ?? null,
        listingSourceType: raw.listingSourceType ?? raw.marketData?.listingSourceType ?? null,
        isAdvertised: raw.isAdvertised ?? raw.marketData?.isAdvertised ?? null,
        rank,
        observedAt: raw.observedAt || raw.updatedAt || null
      },

      sourcingDossier: {
        cogs1688Cny,
        unitPriceCny: cogs1688Cny,
        provenance: sourcingProvenance,
        supplierUrl: raw.sourcingDossier?.supplierUrl || null,
        variant: raw.sourcingDossier?.variant || null,
        quantity: raw.sourcingDossier?.quantity || null,
        moq: raw.sourcingDossier?.moq || null,
        moqApplicabilityNotes: raw.sourcingDossier?.moqApplicabilityNotes || null,
        quoteDate: raw.sourcingDossier?.quoteDate || null,
        isVerified: Boolean(raw.sourcingDossier?.isVerified),
        verifiedAt: raw.sourcingDossier?.verifiedAt || null,
        notes: raw.sourcingDossier?.notes || null
      },

      economics: {
        targetSalesPriceKrw: targetSalesPrice,
        exchangeRateCnyKrw: exchangeRate,
        supplierUnitCostCny: cogs1688Cny,
        buyingAgentFeeMode,
        buyingAgentFeeRate,
        buyingAgentFeeKrw,
        platformCommissionRate: commissionRate,
        shippingBasis: raw.economics?.shippingBasis || (shippingCost !== null ? 'QUOTED' : 'WEIGHT_ESTIMATE'),
        shippingCostKrw: shippingCost,
        weightGram: (raw.economics?.weightGram !== undefined && raw.economics?.weightGram !== null && raw.economics?.weightGram !== '')
          ? Number(raw.economics.weightGram)
          : ((raw.weightGram !== undefined && raw.weightGram !== null && raw.weightGram !== '') ? Number(raw.weightGram) : null),
        dimensions: raw.economics?.dimensions || null,
        fulfillmentModel: raw.economics?.fulfillmentModel || (raw.isCgf ? 'ROCKET_GROWTH' : 'BUYING_PER_ORDER'),
        adCostPerOrderKrw: adCost,
        returnAllowanceMode,
        returnAllowanceRate: returnRate,
        returnAllowanceKrw: returnKrw,
        otherCostPerOrderKrw: otherCost,
        ordersPerDay: (raw.economics?.ordersPerDay !== undefined && raw.economics?.ordersPerDay !== null) ? Number(raw.economics.ordersPerDay) : 10,
        settlementCycleDays: (raw.economics?.settlementCycleDays !== undefined && raw.economics?.settlementCycleDays !== null) ? Number(raw.economics.settlementCycleDays) : 30,
        targetContributionPct: (raw.economics?.targetContributionPct !== undefined && raw.economics?.targetContributionPct !== null) ? Number(raw.economics.targetContributionPct) : 15
      },

      evidenceDossier: {
        demand: raw.evidenceDossier?.demand || {
          keyword: raw.tagsVi?.[0] || null,
          peakMonthlySearches: null,
          period: null,
          geography: 'KR',
          source: null,
          unit: 'ABSOLUTE_SEARCHES',
          seasonalityReviewed: false,
          seasonalityFinding: null,
          seasonalityNotes: null,
          recordedAt: null
        },
        rocketCompetition: raw.evidenceDossier?.rocketCompetition || {
          keywordOrCategory: raw.nicheName || null,
          sampleSize: null,
          rocketCount: null,
          rocketSharePct: null,
          inspectedAt: null
        },
        sellerEvidence: raw.evidenceDossier?.sellerEvidence || {
          offerUrl: null,
          sellerId: null,
          isInternationalDelivery: false,
          sellerReviewCount: null,
          inspectedAt: null
        },
        priceReview: raw.evidenceDossier?.priceReview || {
          isReviewed: false,
          justification: null,
          reviewedAt: null
        },
        kcReview: raw.evidenceDossier?.kcReview || {
          reviewStatus: 'PENDING',
          source: null,
          reviewDate: null,
          notes: null,
          rationale: null,
          reviewedAt: null
        },
        fulfillment: raw.evidenceDossier?.fulfillment || {
          shippingBasis: raw.economics?.shippingBasis || (shippingCost !== null ? 'QUOTED' : 'WEIGHT_ESTIMATE'),
          shippingBasisSource: null,
          shippingBasisAssumptions: null,
          deliveryEstimate: null,
          returnArrangement: null
        }
      },

      // Lưu kết quả cũ nếu có (chỉ dùng để tham khảo đối chiếu, phân biệt rõ với assessment hiện tại)
      legacyAssessment: raw.wpi ? {
        score: raw.wpi.score,
        tier: raw.wpi.tier,
        netMarginPct: raw.financial?.netMarginPct
      } : null
    };

    return enrichProduct(migrated);
  }

  /**
   * LÀM GIÀU DỮ LIỆU SẢN PHẨM (ENRICH PRODUCT)
   * Đồng bộ các module: KC, Material, FeeCalculator, WinAlgorithm & TrialEligibility
   */
  function enrichProduct(item) {
    if (!item) return null;

    const kcModule = getKcRules();
    const matModule = getMaterialEngine();
    const feeModule = getFeeCalculator();
    const winModule = getWinAlgorithm();

    const titleKr = item.marketData?.titleKr || item.titleKr || '';
    // R03: Lấy targetSalesPriceKrw của người vận hành làm giá cơ sở tài chính; fallback là observed price
    const targetPrice = Number(item.economics?.targetSalesPriceKrw || item.marketData?.salesPriceKrw || item.salesPriceKrw) || 0;
    const marketPrice = Number(item.marketData?.salesPriceKrw) || targetPrice;
    const cogsCny = item.sourcingDossier?.cogs1688Cny !== undefined
      ? item.sourcingDossier.cogs1688Cny
      : (item.cogs1688Cny !== undefined ? item.cogs1688Cny : null);

    // 1. Phân tích rủi ro KC
    const kc = kcModule?.evaluateKcRisk
      ? kcModule.evaluateKcRisk(titleKr)
      : { level: 'LOW', labelVi: 'Miễn trừ KC', color: 'text-emerald-700 bg-emerald-100 border-emerald-300' };

    // 2. Bóc tách vật liệu và từ khóa 1688
    const mat = matModule?.extractMaterialIntelligence
      ? matModule.extractMaterialIntelligence(titleKr)
      : { materials: [], highlightBadges: [], precisionQueryCn: titleKr, searchUrl1688: '#' };

    // 3. Tính toán chi phí tài chính (Shared Financial Result)
    const finParams = {
      salesPriceKrw: targetPrice,
      cogs1688Cny: cogsCny,
      weightGram: item.economics?.weightGram ?? item.weightGram,
      dimensions: item.economics?.dimensions || null,
      shippingCostKrw: item.economics?.shippingCostKrw,
      shippingBasis: item.economics?.shippingBasis,
      exchangeRateCnyKrw: item.economics?.exchangeRateCnyKrw,
      platformCommissionRate: item.economics?.platformCommissionRate,
      buyingAgentFeeMode: item.economics?.buyingAgentFeeMode,
      buyingAgentFeeKrw: item.economics?.buyingAgentFeeKrw,
      buyingAgentFeeRate: item.economics?.buyingAgentFeeRate,
      fulfillmentModel: item.economics?.fulfillmentModel,
      adCostPerOrderKrw: item.economics?.adCostPerOrderKrw,
      returnAllowanceMode: item.economics?.returnAllowanceMode,
      returnAllowanceRate: item.economics?.returnAllowanceRate,
      returnAllowanceKrw: item.economics?.returnAllowanceKrw,
      otherCostPerOrderKrw: item.economics?.otherCostPerOrderKrw
    };

    const fin = feeModule?.calculateProfit
      ? feeModule.calculateProfit(finParams)
      : { netMarginPct: 0, netProfitKrw: 0, isComplete: false };

    // 4. Tính điểm ưu tiên sàng lọc WPI (Screening Heuristic)
    const isProvisional = item.sourcingDossier?.provenance !== 'EVIDENCE' || !fin.isComplete;
    const isRocketVal = item.marketData?.isRocket !== undefined ? item.marketData.isRocket : item.isRocket;
    const rocketTypeVal = item.marketData?.rocketType || item.rocketType || (isRocketVal ? 'ROCKET_DELIVERY' : (isRocketVal === false ? 'NONE' : null));
    // R07: Chỉ dùng verified BSR rank, TUYỆT ĐỐI không lấy listingPosition gán vào rank
    const rankVal = (item.marketData?.rank !== undefined && item.marketData?.rank !== null)
      ? Number(item.marketData.rank)
      : (item.rank ? Number(item.rank) : null);

    const wpi = winModule?.calculateWinningProductIndex
      ? winModule.calculateWinningProductIndex({
          netMarginPct: fin.isComplete ? fin.netMarginPct : null,
          isRocket: isRocketVal !== undefined ? isRocketVal : null,
          rocketType: rocketTypeVal,
          kcLevel: kc.level,
          salesPriceKrw: targetPrice,
          rank: rankVal,
          isProvisional
        })
      : { score: null, isComplete: false, isProvisional: true, tier: 'HIGH_RISK', tierLabelVi: 'Chưa Đạt' };

    // 5. Đánh giá điều kiện thử bán (Trial Selling Eligibility)
    const eligibilityCandidate = {
      ...item,
      salesPriceKrw: targetPrice,
      kcSafety: kc,
      financial: fin,
      sourcingDossier: item.sourcingDossier || { cogs1688Cny: cogsCny, isVerified: false },
      evidenceDossier: item.evidenceDossier || {}
    };

    const trialEligibility = winModule?.evaluateTrialEligibility
      ? winModule.evaluateTrialEligibility(eligibilityCandidate)
      : { status: 'needs_verification', statusLabelVi: 'Cần Xác Minh', criteria: [], blockingReasons: [] };

    // Top-level aliases để các view hiện tại đọc thuận tiện mà không bị lỗi
    const enriched = {
      ...item,
      schemaVersion: SCHEMA_VERSION,
      assessmentRevision: ASSESSMENT_RULES_REVISION,
      titleKr,
      salesPriceKrw: targetPrice,
      marketSalesPriceKrw: marketPrice,
      cogs1688Cny: cogsCny,
      isRocket: item.marketData?.isRocket ?? item.isRocket ?? false,
      rocketType: item.marketData?.rocketType || item.rocketType || 'NONE',
      rank: rankVal,
      listingPosition: item.marketData?.listingPosition ?? item.listingPosition ?? null,
      rating: item.marketData?.rating ?? item.rating ?? null,
      reviewCount: item.marketData?.reviewCount ?? item.reviewCount ?? null,
      thumbnailUrl: item.marketData?.thumbnailUrl || item.thumbnailUrl || '',
      productUrl: item.marketData?.productUrl || item.productUrl || '',
      kcSafety: kc,
      financial: fin,
      materialIntel: mat,
      wpi,
      trialEligibility
    };

    return enriched;
  }

  /**
   * HỢP NHẤT DỮ LIỆU QUÉT VỚI DỮ LIỆU ĐÃ LƯU (RESCAN PRESERVATION)
   * R03: Chỉ cập nhật dữ liệu quan sát Coupang (marketData), KHÔNG ghi đè economics.targetSalesPriceKrw
   * R06: Giữ nguyên giá vốn nhập tay, watchlist, bằng chứng và internal ID
   */
  function mergeScannedProduct(existingProduct, scannedItem) {
    if (!existingProduct) {
      return migrateProduct(scannedItem);
    }

    const migratedExisting = migrateProduct(existingProduct);
    const scannedSalesPrice = Number(scannedItem.salesPriceKrw) || 0;

    // Cập nhật các trường quan sát từ Coupang
    const updatedMarketData = {
      ...migratedExisting.marketData,
      titleKr: scannedItem.titleKr || migratedExisting.marketData.titleKr,
      salesPriceKrw: scannedSalesPrice > 0 ? scannedSalesPrice : migratedExisting.marketData.salesPriceKrw,
      thumbnailUrl: scannedItem.thumbnailUrl || migratedExisting.marketData.thumbnailUrl,
      productUrl: scannedItem.productUrl || migratedExisting.marketData.productUrl,
      listingPosition: scannedItem.listingPosition !== undefined ? scannedItem.listingPosition : migratedExisting.marketData.listingPosition,
      listingPageContext: scannedItem.listingPageContext || migratedExisting.marketData.listingPageContext,
      listingSection: scannedItem.listingSection || migratedExisting.marketData.listingSection,
      listingSourceType: scannedItem.listingSourceType || migratedExisting.marketData.listingSourceType,
      isAdvertised: scannedItem.isAdvertised !== undefined && scannedItem.isAdvertised !== null
        ? Boolean(scannedItem.isAdvertised)
        : migratedExisting.marketData.isAdvertised,
      rank: scannedItem.rank !== undefined ? scannedItem.rank : migratedExisting.marketData.rank,
      observedAt: new Date().toISOString()
    };

    if (scannedItem.isRocket !== undefined && scannedItem.isRocket !== null) {
      updatedMarketData.isRocket = Boolean(scannedItem.isRocket);
      updatedMarketData.rocketType = scannedItem.rocketType || (scannedItem.isRocket ? 'ROCKET_DELIVERY' : 'NONE');
    }

    if (scannedItem.rating !== undefined && scannedItem.rating !== null && Number(scannedItem.rating) > 0) {
      updatedMarketData.rating = Number(scannedItem.rating);
    }

    if (scannedItem.reviewCount !== undefined && scannedItem.reviewCount !== null && Number(scannedItem.reviewCount) >= 0) {
      updatedMarketData.reviewCount = Number(scannedItem.reviewCount);
    }

    if (scannedItem.discountRate !== undefined && scannedItem.discountRate !== null) {
      updatedMarketData.discountRate = Number(scannedItem.discountRate);
    }

    if (scannedItem.originalPriceKrw !== undefined && scannedItem.originalPriceKrw !== null) {
      updatedMarketData.originalPriceKrw = Number(scannedItem.originalPriceKrw);
    }

    if (scannedItem.vendorItemId) {
      migratedExisting.vendorItemId = scannedItem.vendorItemId;
    }

    // NẾU người dùng đã nhập giá tay hoặc có bằng chứng, KHÔNG ĐƯỢC ghi đè bằng giá ước tính của lượt quét mới!
    const existingProvenance = migratedExisting.sourcingDossier?.provenance;
    const isUserOwnedCost = existingProvenance === 'MANUAL' || existingProvenance === 'EVIDENCE';

    let updatedSourcingDossier = { ...migratedExisting.sourcingDossier };
    if (!isUserOwnedCost && scannedItem.cogs1688Cny && !migratedExisting.sourcingDossier?.cogs1688Cny) {
      updatedSourcingDossier.cogs1688Cny = Number(scannedItem.cogs1688Cny);
      updatedSourcingDossier.provenance = 'HEURISTIC';
    }

    const merged = {
      ...migratedExisting,
      id: migratedExisting.id,
      productId: migratedExisting.productId,
      isWatchlist: migratedExisting.isWatchlist,
      niche: migratedExisting.niche,
      nicheName: migratedExisting.nicheName,

      marketData: updatedMarketData,
      sourcingDossier: updatedSourcingDossier,
      // R03: BẢO TOÀN NGUYÊN VẸN economics của người dùng, không gán targetSalesPriceKrw bằng giá quan sát Coupang!
      economics: { ...migratedExisting.economics },
      evidenceDossier: { ...migratedExisting.evidenceDossier }
    };

    return enrichProduct(merged);
  }

  /**
   * R05: KHÔI PHỤC SẢN PHẨM TỪ BẢN SAO LƯU (RESTORE SEMANTICS)
   * Khác biệt với rescan merge: restore THAY THẾ toàn bộ các trường người dùng (economics, sourcing, evidence, watchlist)
   * của sản phẩm khớp, giữ lại danh tính internal ID.
   */
  function restoreProduct(existingProduct, backedUpProduct) {
    const migratedExisting = migrateProduct(existingProduct);
    const migratedBackup = migrateProduct(backedUpProduct);

    const restored = {
      ...migratedExisting,
      id: migratedExisting.id,
      productId: migratedExisting.productId,
      isWatchlist: Boolean(migratedBackup.isWatchlist),
      niche: migratedBackup.niche || migratedExisting.niche,
      nicheName: migratedBackup.nicheName || migratedExisting.nicheName,
      vendorItemId: migratedBackup.vendorItemId || migratedExisting.vendorItemId,

      // Market data: nạp từ backup nếu có, kết hợp với marketData hiện tại
      marketData: {
        ...migratedExisting.marketData,
        ...(migratedBackup.marketData || {})
      },

      // Khôi phục đầy đủ các trường người dùng sở hữu từ bản backup
      sourcingDossier: JSON.parse(JSON.stringify(migratedBackup.sourcingDossier)),
      economics: JSON.parse(JSON.stringify(migratedBackup.economics)),
      evidenceDossier: JSON.parse(JSON.stringify(migratedBackup.evidenceDossier))
    };

    return enrichProduct(restored);
  }

  /**
   * KHỞI TẠO CƠ SỞ DỮ LIỆU
   */
  async function initDatabase() {
    if (shouldDelegateToServiceWorker()) {
      return delegateMutation('initDatabase');
    }

    return serializeMutation(async () => {
      const isInit = await getStorage(KEY_INITIALIZED);
      const existing = await getStorage(KEY_PRODUCTS);

      if (isInit && Array.isArray(existing) && existing.length > 0) {
        const needsMigration = existing.some(p => p.schemaVersion !== SCHEMA_VERSION || p.assessmentRevision !== ASSESSMENT_RULES_REVISION);
        if (!needsMigration) {
          return existing;
        }
        const migrated = existing.map(p => migrateProduct(p)).filter(Boolean);
        await setStorage(KEY_PRODUCTS, migrated);
        return migrated;
      }

      if (typeof globalThis !== 'undefined' && globalThis.__kdrop_test_storage__) {
        await setStorageMulti({
          [KEY_PRODUCTS]: [],
          [KEY_INITIALIZED]: true
        });
        return [];
      }

      // Chỉ coi lỗi đọc seed là seed không khả dụng. Lỗi commit phải được báo để
      // lần khởi tạo sau có thể thử lại, không ghi đè thành kho rỗng đã khởi tạo.
      let seedData = null;
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
          const url = chrome.runtime.getURL('data/initial_data.json');
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          seedData = await res.json();
        } else if (typeof require === 'function') {
          seedData = require('../data/initial_data.json');
        }
      } catch (err) {
        console.warn('Không thể đọc initial_data.json:', err);
      }

      if (seedData && Array.isArray(seedData.products)) {
        const migrated = seedData.products.map(p => migrateProduct(p)).filter(Boolean);
        const saved = await setStorageMulti({
          [KEY_PRODUCTS]: migrated,
          [KEY_CATEGORIES]: seedData.categories || [],
          [KEY_INITIALIZED]: true
        });
        if (!saved) throw new Error('Không thể lưu dữ liệu khởi tạo vào storage');
        return migrated;
      }

      const saved = await setStorageMulti({
        [KEY_PRODUCTS]: [],
        [KEY_INITIALIZED]: true
      });
      if (!saved) throw new Error('Không thể lưu trạng thái khởi tạo vào storage');
      return [];
    });
  }

  async function migrateStorage() {
    if (shouldDelegateToServiceWorker()) {
      return delegateMutation('migrateStorage');
    }

    return serializeMutation(async () => {
      // F02: Luôn đọc snapshot mới nhất bên trong queue để tránh race condition
      const currentProds = (await getStorage(KEY_PRODUCTS)) || [];
      const migrated = currentProds.map(p => migrateProduct(p)).filter(Boolean);
      await setStorage(KEY_PRODUCTS, migrated);
      return migrated;
    });
  }

  async function getAllProducts() {
    let prods = await getStorage(KEY_PRODUCTS);
    if (!prods) {
      return initDatabase();
    }
    const needsMigration = Array.isArray(prods) && prods.some(p => p.schemaVersion !== SCHEMA_VERSION || p.assessmentRevision !== ASSESSMENT_RULES_REVISION);
    if (needsMigration) {
      return migrateStorage();
    }
    return prods || [];
  }

  /**
   * TÌM SẢN PHẨM THEO ID HOẶC PRODUCT ID
   */
  async function getProductById(id) {
    if (!id) return null;
    const prods = await getAllProducts();
    const cleanId = String(id).replace(/^coupang_/, '').trim();
    return prods.find(p => String(p.productId) === cleanId || String(p.id) === String(id)) || null;
  }

  /**
   * LƯU 1 SẢN PHẨM (BẢO TOÀN DỮ LIỆU KHI QUÉT LẠI)
   */
  async function saveProduct(item) {
    if (!item) throw new Error('Dữ liệu sản phẩm không hợp lệ');

    const productId = String(item.productId || item.id || '').replace(/^coupang_/, '').trim();
    if (!productId) {
      throw new Error('Sản phẩm phải có Coupang Product ID hợp lệ để định danh.');
    }

    if (shouldDelegateToServiceWorker()) {
      return delegateMutation('saveProduct', item);
    }

    return serializeMutation(async () => {
      const prods = (await getStorage(KEY_PRODUCTS)) || [];
      const idx = prods.findIndex(p => String(p.productId) === productId || String(p.id) === String(item.id));

      let resultProduct = null;
      if (idx !== -1) {
        resultProduct = mergeScannedProduct(prods[idx], item);
        prods[idx] = resultProduct;
      } else {
        resultProduct = migrateProduct(item);
        prods.unshift(resultProduct);
      }

      const success = await setStorage(KEY_PRODUCTS, prods);
      if (!success) {
        throw new Error('Ghi dữ liệu vào storage thất bại');
      }

      broadcastStorageUpdate('PRODUCT_SAVED', { productId, id: resultProduct.id });
      return resultProduct;
    });
  }

  /**
   * CẬP NHẬT GIÁ VỐN 1688 TAY (MANUAL COGS)
   * R06: Bất kỳ thay đổi giá vốn nào bằng tay đều hủy bỏ xác minh cũ (isVerified = false)
   */
  async function updateProductCogs(id, cogsCny, provenance = 'MANUAL') {
    if (shouldDelegateToServiceWorker()) {
      return delegateMutation('updateProductCogs', id, cogsCny, provenance);
    }

    return serializeMutation(async () => {
      const prods = (await getStorage(KEY_PRODUCTS)) || [];
      const idx = prods.findIndex(p => String(p.id) === String(id) || String(p.productId) === String(id));
      if (idx === -1) return null;

      const current = migrateProduct(prods[idx]);
      const val = (cogsCny === null || cogsCny === '' || cogsCny === undefined) ? null : Number(cogsCny);
      if (val !== null && (!Number.isFinite(val) || val < 0)) {
        throw new Error('Giá vốn 1688 phải là số không âm hợp lệ');
      }

      // R06: Thay đổi giá vốn thủ công làm mất hiệu lực xác minh quote cũ
      current.sourcingDossier = {
        ...current.sourcingDossier,
        cogs1688Cny: val,
        unitPriceCny: val,
        provenance: val !== null ? 'MANUAL' : 'HEURISTIC',
        isVerified: false,
        verifiedAt: null,
        notes: current.sourcingDossier?.notes || null
      };

      current.economics = {
        ...current.economics,
        supplierUnitCostCny: val
      };

      const enriched = enrichProduct(current);
      prods[idx] = enriched;

      const success = await setStorage(KEY_PRODUCTS, prods);
      if (!success) throw new Error('Không thể cập nhật giá vốn vào storage');

      broadcastStorageUpdate('COGS_UPDATED', { id: current.id, cogsCny: val });
      return enriched;
    });
  }

  /**
   * CẬP NHẬT HỒ SƠ BÁO GIÁ XƯỞNG (SOURCING DOSSIER)
   * R06: Xác minh (isVerified = true) bắt buộc phải có đầy đủ các điều khoản báo giá
   */
  async function saveSourcingDossier(id, dossierData = {}) {
    if (shouldDelegateToServiceWorker()) {
      return delegateMutation('saveSourcingDossier', id, dossierData);
    }

    const termErrors = validateSourcingTerms(dossierData);
    if (termErrors.length > 0) {
      throw new Error('Dữ liệu báo giá xưởng không hợp lệ: ' + termErrors.join('; '));
    }

    return serializeMutation(async () => {
      const prods = (await getStorage(KEY_PRODUCTS)) || [];
      const idx = prods.findIndex(p => String(p.id) === String(id) || String(p.productId) === String(id));
      if (idx === -1) return null;

      const current = migrateProduct(prods[idx]);

      let unitPrice = current.sourcingDossier?.unitPriceCny ?? null;
      if (dossierData.unitPriceCny !== undefined) {
        unitPrice = (dossierData.unitPriceCny === null || dossierData.unitPriceCny === '') ? null : Number(dossierData.unitPriceCny);
      } else if (dossierData.cogs1688Cny !== undefined) {
        unitPrice = (dossierData.cogs1688Cny === null || dossierData.cogs1688Cny === '') ? null : Number(dossierData.cogs1688Cny);
      }

      const supplierUrl = dossierData.supplierUrl !== undefined ? (dossierData.supplierUrl || null) : current.sourcingDossier?.supplierUrl;
      let quoteDate = dossierData.quoteDate !== undefined ? (dossierData.quoteDate || null) : current.sourcingDossier?.quoteDate;
      let variant = dossierData.variant !== undefined ? (dossierData.variant || null) : current.sourcingDossier?.variant;
      let quantity = dossierData.quantity !== undefined ? (dossierData.quantity !== null && dossierData.quantity !== '' ? Number(dossierData.quantity) : null) : current.sourcingDossier?.quantity;
      let moq = dossierData.moq !== undefined ? (dossierData.moq !== null && dossierData.moq !== '' ? Number(dossierData.moq) : null) : current.sourcingDossier?.moq;
      const moqNotes = dossierData.moqApplicabilityNotes !== undefined ? dossierData.moqApplicabilityNotes : current.sourcingDossier?.moqApplicabilityNotes;

      const mergedTermErrors = validateSourcingTerms({
        supplierUrl,
        quoteDate,
        variant,
        unitPriceCny: unitPrice,
        quantity,
        moq,
        moqApplicabilityNotes: moqNotes
      });

      // Kiểm tra tính đầy đủ của điều khoản báo giá để được xác minh
      const hasValidTerms = Boolean(
        mergedTermErrors.length === 0 &&
        supplierUrl && String(supplierUrl).trim().length > 0 &&
        quoteDate && String(quoteDate).trim().length > 0 &&
        variant && String(variant).trim().length > 0 &&
        Number.isFinite(unitPrice) && unitPrice > 0 &&
        Number.isInteger(quantity) && quantity > 0 &&
        Number.isInteger(moq) && moq > 0 &&
        (quantity >= moq || (moqNotes && String(moqNotes).trim().length > 0))
      );

      const wantVerify = Boolean(dossierData.isVerified);
      const isVerified = wantVerify && hasValidTerms;
      const requestedProvenance = dossierData.provenance;
      const provenance = isVerified
        ? 'EVIDENCE'
        : (requestedProvenance && requestedProvenance !== 'EVIDENCE'
          ? requestedProvenance
          : (unitPrice !== null ? 'MANUAL' : 'HEURISTIC'));

      const newDossier = {
        ...current.sourcingDossier,
        ...dossierData,
        cogs1688Cny: unitPrice,
        unitPriceCny: unitPrice,
        supplierUrl: supplierUrl || null,
        quoteDate: quoteDate || null,
        variant: variant || null,
        quantity: quantity || null,
        moq: moq || null,
        moqApplicabilityNotes: moqNotes || null,
        isVerified,
        provenance,
        verifiedAt: isVerified ? (dossierData.verifiedAt || new Date().toISOString()) : null
      };

      current.economics.supplierUnitCostCny = unitPrice;
      current.sourcingDossier = newDossier;
      const enriched = enrichProduct(current);
      prods[idx] = enriched;

      const success = await setStorage(KEY_PRODUCTS, prods);
      if (!success) throw new Error('Không thể lưu hồ sơ báo giá vào storage');

      broadcastStorageUpdate('SOURCING_DOSSIER_UPDATED', { id: current.id });
      return enriched;
    });
  }

  /**
   * CẬP NHẬT HỒ SƠ BẰNG CHỨNG NGHIÊN CỨU (EVIDENCE DOSSIER)
   * R02: Từ chối mẫu Rocket không hợp lệ (số lượng vượt quá cỡ mẫu hoặc âm)
   */
  async function saveEvidenceDossier(id, evidenceUpdates = {}) {
    if (shouldDelegateToServiceWorker()) {
      return delegateMutation('saveEvidenceDossier', id, evidenceUpdates);
    }

    // Kiểm tra tính hợp lệ của mẫu Rocket trước khi ghi
    if (evidenceUpdates.rocketCompetition) {
      const rc = evidenceUpdates.rocketCompetition;
      if (rc.sampleSize !== undefined && rc.sampleSize !== null && rc.rocketCount !== undefined && rc.rocketCount !== null) {
        const s = Number(rc.sampleSize);
        const c = Number(rc.rocketCount);
        if (!Number.isInteger(s) || s <= 0 || !Number.isInteger(c) || c < 0 || c > s) {
          throw new Error(`Dữ liệu mẫu kiểm tra Rocket không hợp lệ: sampleSize=${rc.sampleSize}, rocketCount=${rc.rocketCount}. Số lượng phải từ 0 đến cỡ mẫu.`);
        }
      }
    }

    return serializeMutation(async () => {
      const prods = (await getStorage(KEY_PRODUCTS)) || [];
      const idx = prods.findIndex(p => String(p.id) === String(id) || String(p.productId) === String(id));
      if (idx === -1) return null;

      const current = migrateProduct(prods[idx]);
      const updates = evidenceUpdates;
      const rocket = { ...current.evidenceDossier?.rocketCompetition, ...(updates.rocketCompetition || {}) };
      if (rocket.sampleSize !== undefined && rocket.sampleSize !== null && rocket.rocketCount !== undefined && rocket.rocketCount !== null) {
        const sampleSize = Number(rocket.sampleSize);
        const rocketCount = Number(rocket.rocketCount);
        if (!Number.isInteger(sampleSize) || sampleSize <= 0 || !Number.isInteger(rocketCount) || rocketCount < 0 || rocketCount > sampleSize) {
          throw new Error(`Dữ liệu mẫu kiểm tra Rocket không hợp lệ: sampleSize=${rocket.sampleSize}, rocketCount=${rocket.rocketCount}. Số lượng phải từ 0 đến cỡ mẫu.`);
        }
      }
      const fulfillment = { ...current.evidenceDossier?.fulfillment, ...(updates.fulfillment || {}) };

      current.evidenceDossier = {
        demand: { ...current.evidenceDossier?.demand, ...(updates.demand || {}) },
        rocketCompetition: { ...current.evidenceDossier?.rocketCompetition, ...(updates.rocketCompetition || {}) },
        sellerEvidence: { ...current.evidenceDossier?.sellerEvidence, ...(updates.sellerEvidence || {}) },
        priceReview: { ...current.evidenceDossier?.priceReview, ...(updates.priceReview || {}) },
        kcReview: { ...current.evidenceDossier?.kcReview, ...(updates.kcReview || {}) },
        fulfillment
      };

      const enriched = enrichProduct(current);
      prods[idx] = enriched;

      const success = await setStorage(KEY_PRODUCTS, prods);
      if (!success) throw new Error('Không thể lưu hồ sơ bằng chứng vào storage');

      broadcastStorageUpdate('EVIDENCE_UPDATED', { id: current.id });
      return enriched;
    });
  }

  /**
   * CẬP NHẬT THAM SỐ KINH TẾ (ECONOMICS BASELINE)
   * R03: Chỉ cập nhật economics.targetSalesPriceKrw, KHÔNG ghi đè marketData.salesPriceKrw
   * R10: Validate chặt chẽ các tham số tài chính đầu vào
   */
  async function saveEconomics(id, economicsUpdates = {}) {
    if (shouldDelegateToServiceWorker()) {
      return delegateMutation('saveEconomics', id, economicsUpdates);
    }

    const feeMod = getFeeCalculator();
    if (feeMod && feeMod.validateFinancialInputs) {
      const validation = feeMod.validateFinancialInputs(economicsUpdates);
      if (!validation.isValid) {
        throw new Error('Tham số tài chính không hợp lệ: ' + validation.errors.join('; '));
      }
    }

    return serializeMutation(async () => {
      const prods = (await getStorage(KEY_PRODUCTS)) || [];
      const idx = prods.findIndex(p => String(p.id) === String(id) || String(p.productId) === String(id));
      if (idx === -1) return null;

      const current = migrateProduct(prods[idx]);
      current.economics = {
        ...current.economics,
        ...economicsUpdates
      };

      if (economicsUpdates.targetSalesPriceKrw !== undefined && economicsUpdates.targetSalesPriceKrw !== null) {
        current.economics.targetSalesPriceKrw = Number(economicsUpdates.targetSalesPriceKrw);
      }

      const enriched = enrichProduct(current);
      prods[idx] = enriched;

      const success = await setStorage(KEY_PRODUCTS, prods);
      if (!success) throw new Error('Không thể lưu tham số tài chính vào storage');

      broadcastStorageUpdate('ECONOMICS_UPDATED', { id: current.id });
      return enriched;
    });
  }

  /**
   * R08: LƯU KỊCH BẢN CƠ SỞ HOÀN CHỈNH (ATOMIC BASELINE SAVE)
   * Lưu toàn bộ các tham số tài chính, fulfillment, cước ship, ads, return allowance và COGS trong một commit duy nhất
   */
  async function saveBaseline(id, baselineData = {}) {
    if (shouldDelegateToServiceWorker()) {
      return delegateMutation('saveBaseline', id, baselineData);
    }

    const feeMod = getFeeCalculator();
    if (feeMod && feeMod.validateFinancialInputs) {
      const validation = feeMod.validateFinancialInputs(baselineData);
      if (!validation.isValid) {
        throw new Error('Tham số kịch bản cơ sở không hợp lệ: ' + validation.errors.join('; '));
      }
    }

    return serializeMutation(async () => {
      const prods = (await getStorage(KEY_PRODUCTS)) || [];
      const idx = prods.findIndex(p => String(p.id) === String(id) || String(p.productId) === String(id));
      if (idx === -1) return null;

      const current = migrateProduct(prods[idx]);
      const {
        salesPriceKrw,
        targetSalesPriceKrw,
        cogs1688Cny,
        exchangeRateCnyKrw,
        platformCommissionRate,
        shippingCostKrw,
        weightGram,
        dimensions,
        adCostPerOrderKrw,
        returnAllowanceMode,
        returnAllowanceRate,
        returnAllowanceKrw,
        fulfillmentModel,
        buyingAgentFeeMode,
        buyingAgentFeeKrw,
        buyingAgentFeeRate,
        otherCostPerOrderKrw,
        ordersPerDay,
        settlementCycleDays,
        targetContributionPct
      } = baselineData;

      const targetPrice = targetSalesPriceKrw !== undefined
        ? Number(targetSalesPriceKrw)
        : (salesPriceKrw !== undefined ? Number(salesPriceKrw) : current.economics.targetSalesPriceKrw);

      const resolvedCommission = platformCommissionRate !== undefined
        ? (platformCommissionRate === '' || platformCommissionRate === null ? null : Number(platformCommissionRate))
        : current.economics.platformCommissionRate;

      const resolvedDimensions = dimensions !== undefined
        ? dimensions
        : current.economics.dimensions;

      const resolvedAgentFeeMode = buyingAgentFeeMode || current.economics.buyingAgentFeeMode || (Number(buyingAgentFeeRate) > 0 ? 'PERCENTAGE' : 'FLAT');
      const resolvedReturnMode = returnAllowanceMode || current.economics.returnAllowanceMode || (returnAllowanceKrw !== undefined && returnAllowanceKrw !== null ? 'FIXED' : 'PERCENTAGE');

      current.economics = {
        ...current.economics,
        targetSalesPriceKrw: targetPrice,
        exchangeRateCnyKrw: exchangeRateCnyKrw !== undefined
          ? (exchangeRateCnyKrw === '' || exchangeRateCnyKrw === null ? null : Number(exchangeRateCnyKrw))
          : current.economics.exchangeRateCnyKrw,
        platformCommissionRate: resolvedCommission,
        shippingCostKrw: shippingCostKrw !== undefined ? (shippingCostKrw === '' || shippingCostKrw === null ? null : Number(shippingCostKrw)) : current.economics.shippingCostKrw,
        weightGram: weightGram !== undefined
          ? (weightGram === '' || weightGram === null ? null : Number(weightGram))
          : current.economics.weightGram,
        dimensions: resolvedDimensions,
        adCostPerOrderKrw: adCostPerOrderKrw !== undefined ? (adCostPerOrderKrw === '' || adCostPerOrderKrw === null ? null : Number(adCostPerOrderKrw)) : current.economics.adCostPerOrderKrw,
        returnAllowanceMode: resolvedReturnMode,
        returnAllowanceRate: returnAllowanceRate !== undefined
          ? (returnAllowanceRate === '' || returnAllowanceRate === null ? null : Number(returnAllowanceRate))
          : current.economics.returnAllowanceRate,
        returnAllowanceKrw: returnAllowanceKrw !== undefined ? (returnAllowanceKrw === '' || returnAllowanceKrw === null ? null : Number(returnAllowanceKrw)) : current.economics.returnAllowanceKrw,
        fulfillmentModel: fulfillmentModel !== undefined ? fulfillmentModel : current.economics.fulfillmentModel,
        buyingAgentFeeMode: resolvedAgentFeeMode,
        buyingAgentFeeKrw: buyingAgentFeeKrw !== undefined
          ? (buyingAgentFeeKrw === '' || buyingAgentFeeKrw === null ? null : Number(buyingAgentFeeKrw))
          : current.economics.buyingAgentFeeKrw,
        buyingAgentFeeRate: buyingAgentFeeRate !== undefined
          ? (buyingAgentFeeRate === '' || buyingAgentFeeRate === null ? null : Number(buyingAgentFeeRate))
          : current.economics.buyingAgentFeeRate,
        otherCostPerOrderKrw: otherCostPerOrderKrw !== undefined
          ? (otherCostPerOrderKrw === '' || otherCostPerOrderKrw === null ? null : Number(otherCostPerOrderKrw))
          : current.economics.otherCostPerOrderKrw,
        ordersPerDay: ordersPerDay !== undefined ? Number(ordersPerDay) : current.economics.ordersPerDay,
        settlementCycleDays: settlementCycleDays !== undefined ? Number(settlementCycleDays) : current.economics.settlementCycleDays,
        targetContributionPct: targetContributionPct !== undefined ? Number(targetContributionPct) : current.economics.targetContributionPct
      };

      if (cogs1688Cny !== undefined) {
        const cogsVal = cogs1688Cny === null || cogs1688Cny === '' ? null : Number(cogs1688Cny);
        if (cogsVal !== current.sourcingDossier?.cogs1688Cny) {
          current.sourcingDossier = {
            ...current.sourcingDossier,
            cogs1688Cny: cogsVal,
            unitPriceCny: cogsVal,
            provenance: cogsVal === null ? 'HEURISTIC' : 'MANUAL',
            isVerified: false,
            verifiedAt: null
          };
        }
        current.economics.supplierUnitCostCny = cogsVal;
      }

      const enriched = enrichProduct(current);
      prods[idx] = enriched;

      const success = await setStorage(KEY_PRODUCTS, prods);
      if (!success) throw new Error('Không thể lưu kịch bản cơ sở vào storage');

      broadcastStorageUpdate('BASELINE_SAVED', { id: current.id });
      return enriched;
    });
  }

  /**
   * BẬT / TẮT WATCHLIST
   */
  async function toggleWatchlist(id) {
    if (shouldDelegateToServiceWorker()) {
      return delegateMutation('toggleWatchlist', id);
    }

    return serializeMutation(async () => {
      const prods = (await getStorage(KEY_PRODUCTS)) || [];
      const idx = prods.findIndex(p => String(p.id) === String(id) || String(p.productId) === String(id));
      if (idx === -1) return null;

      prods[idx].isWatchlist = !prods[idx].isWatchlist;
      const success = await setStorage(KEY_PRODUCTS, prods);
      if (!success) throw new Error('Không thể cập nhật watchlist');

      broadcastStorageUpdate('WATCHLIST_TOGGLED', { id: prods[idx].id, isWatchlist: prods[idx].isWatchlist });
      return prods[idx];
    });
  }

  /**
   * NHẬP HÀNG LOẠT SẢN PHẨM (BATCH IMPORT / BSR SCAN)
   */
  async function batchImportProducts(items, nicheCode = 'custom', nicheName = 'Danh mục tùy chỉnh') {
    if (!Array.isArray(items)) {
      throw new Error('Dữ liệu nhập hàng loạt phải là một mảng sản phẩm');
    }

    if (shouldDelegateToServiceWorker()) {
      return delegateMutation('batchImportProducts', items, nicheCode, nicheName);
    }

    return serializeMutation(async () => {
      const prods = (await getStorage(KEY_PRODUCTS)) || [];
      const seenInBatch = new Set();
      let count = 0;

      for (const raw of items) {
        const productId = String(raw.productId || raw.id || '').replace(/^coupang_/, '').trim();
        if (!productId || productId === '0') continue;
        if (seenInBatch.has(productId)) continue;
        seenInBatch.add(productId);

        const idx = prods.findIndex(p => String(p.productId) === productId);
        if (idx !== -1) {
          prods[idx] = mergeScannedProduct(prods[idx], {
            ...raw,
            productId
          });
        } else {
          const newProd = migrateProduct({
            ...raw,
            productId,
            id: raw.id || `coupang_${productId}`,
            niche: nicheCode,
            nicheName: nicheName
          });
          if (newProd) {
            prods.push(newProd);
          }
        }
        count++;
      }

      const success = await setStorage(KEY_PRODUCTS, prods);
      if (!success) throw new Error('Lỗi ghi dữ liệu batch import vào storage');

      broadcastStorageUpdate('BATCH_IMPORTED', { count, nicheCode });
      return count;
    });
  }

  /**
   * THỐNG KÊ DASHBOARD CHÍNH XÁC THEO TRẠNG THÁI ĐIỀU KIỆN THỬ BÁN
   */
  async function getStats() {
    const prods = await getAllProducts();
    let totalCoupangRevenueKrw = 0;
    let totalEstNetProfitKrw = 0;
    let wingCount = 0;
    let rocketCount = 0;
    let diamondCount = 0;
    let goldCount = 0;
    let safeKcCount = 0;

    let readyForTrialCount = 0;
    let needsVerificationCount = 0;
    let notEligibleCount = 0;

    prods.forEach(p => {
      const fin = p.financial || {};
      const elig = p.trialEligibility || {};

      totalCoupangRevenueKrw += (p.salesPriceKrw || 0);
      totalEstNetProfitKrw += (fin.netProfitKrw || 0);

      if (!p.isRocket || p.rocketType === 'NONE') wingCount++;
      else rocketCount++;

      if (p.wpi?.tier === 'DIAMOND_WIN') diamondCount++;
      if (p.wpi?.tier === 'GOLD_WIN') goldCount++;
      if (p.kcSafety?.level === 'LOW') safeKcCount++;

      if (elig.status === 'ready_for_trial') readyForTrialCount++;
      else if (elig.status === 'not_eligible') notEligibleCount++;
      else needsVerificationCount++;
    });

    const avgMarginPct = prods.length > 0 && totalCoupangRevenueKrw > 0
      ? parseFloat(((totalEstNetProfitKrw / totalCoupangRevenueKrw) * 100).toFixed(1))
      : 0;

    return {
      totalProducts: prods.length,
      wingCount,
      rocketCount,
      diamondCount,
      goldCount,
      safeKcCount,
      avgMarginPct,
      readyForTrialCount,
      needsVerificationCount,
      notEligibleCount
    };
  }

  /**
   * XUẤT FILE BACKUP HOÀN CHỈNH (VERSIONED BACKUP FORMAT)
   */
  async function exportBackup() {
    const prods = await getAllProducts();
    const categories = (await getStorage(KEY_CATEGORIES)) || [];

    return {
      version: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      generator: 'K-Drop Studio Extension',
      summary: await getStats(),
      categories,
      products: prods
    };
  }

  /**
   * NẠP FILE BACKUP HOẶC MẢNG DỮ LIỆU CŨ (R05: RESTORE CONTRACT)
   * - Validate toàn bộ file trước khi commit
   * - Thay thế các trường người dùng (economics, sourcing, evidence, watchlist) của sản phẩm khớp
   * - Giữ nguyên các sản phẩm không liên quan trong collection
   * - Không âm thầm bỏ qua bản ghi lỗi
   */
  async function importBackup(jsonData, nicheCode = 'import', nicheName = 'Dữ liệu khôi phục') {
    if (shouldDelegateToServiceWorker()) {
      return delegateMutation('importBackup', jsonData, nicheCode, nicheName);
    }

    if (!jsonData) throw new Error('Dữ liệu import rỗng');

    let productsToImport = [];
    let categoriesToImport = [];

    // Kiểm tra cấu trúc: là Versioned Backup Object hay Legacy Array
    if (typeof jsonData === 'object' && jsonData !== null && !Array.isArray(jsonData)) {
      if (jsonData.version !== undefined && Number(jsonData.version) > SCHEMA_VERSION) {
        throw new Error(`Phiên bản backup không được hỗ trợ (phiên bản v${jsonData.version} > v${SCHEMA_VERSION})`);
      }
      if (!Array.isArray(jsonData.products)) {
        throw new Error('Định dạng file JSON không hợp lệ (cần mảng products)');
      }
      if (jsonData.categories !== undefined && jsonData.categories !== null) {
        if (!Array.isArray(jsonData.categories)) {
          throw new Error('Định dạng categories trong backup không hợp lệ (cần là mảng)');
        }
        for (let j = 0; j < jsonData.categories.length; j++) {
          const c = jsonData.categories[j];
          if (!c || typeof c !== 'object' || !c.code || typeof c.code !== 'string' || !c.name || typeof c.name !== 'string') {
            throw new Error(`Category thứ ${j + 1} không hợp lệ (cần object có code và name)`);
          }
        }
      }
      productsToImport = jsonData.products;
      categoriesToImport = jsonData.categories || [];
    } else if (Array.isArray(jsonData)) {
      productsToImport = jsonData;
    } else {
      throw new Error('Định dạng file JSON không hợp lệ (cần mảng sản phẩm hoặc backup v2)');
    }

    if (productsToImport.length === 0) {
      throw new Error('File không chứa sản phẩm nào để nạp.');
    }

    // R05 & F03: Validate TOÀN BỘ sản phẩm và điều khoản báo giá trước khi ghi bất kỳ dữ liệu nào
    const seenIds = new Set();
    for (let i = 0; i < productsToImport.length; i++) {
      const item = productsToImport[i];
      if (!item || typeof item !== 'object') {
        throw new Error(`Bản ghi thứ ${i + 1} không hợp lệ`);
      }
      const pId = String(item.productId || item.id || '').replace(/^coupang_/, '').trim();
      if (!pId) {
        throw new Error(`Bản ghi thứ ${i + 1} thiếu Coupang Product ID hợp lệ`);
      }
      if (seenIds.has(pId)) {
        throw new Error(`Phát hiện Product ID trùng lặp trong file backup: ${pId}`);
      }
      seenIds.add(pId);

      const sourcingTerms = item.sourcingDossier || {
        unitPriceCny: item.cogs1688Cny,
        cogs1688Cny: item.cogs1688Cny,
        quantity: item.quantity,
        moq: item.moq,
        quoteDate: item.quoteDate
      };
      const termErrors = validateSourcingTerms(sourcingTerms);
      if (termErrors.length > 0) {
        throw new Error(`Bản ghi ${pId} có dữ liệu báo giá không hợp lệ: ` + termErrors.join('; '));
      }

      if (item.economics !== undefined && (!item.economics || typeof item.economics !== 'object' || Array.isArray(item.economics))) {
        throw new Error(`Bản ghi ${pId} có economics không hợp lệ`);
      }

      const economics = item.economics && typeof item.economics === 'object' ? item.economics : {};
      const feeMod = getFeeCalculator();
      if (feeMod && feeMod.validateFinancialInputs) {
        const validation = feeMod.validateFinancialInputs({
          ...economics,
          salesPriceKrw: economics.targetSalesPriceKrw ?? item.salesPriceKrw,
          cogs1688Cny: economics.supplierUnitCostCny ?? item.cogs1688Cny
        });
        if (!validation.isValid) {
          throw new Error(`Bản ghi ${pId} có tham số tài chính không hợp lệ: ${validation.errors.join('; ')}`);
        }
      }
    }

    return serializeMutation(async () => {
      const existingProds = (await getStorage(KEY_PRODUCTS)) || [];
      const existingCats = (await getStorage(KEY_CATEGORIES)) || [];
      const mergedProds = [...existingProds];
      let importedCount = 0;

      for (const raw of productsToImport) {
        const productId = String(raw.productId || raw.id || '').replace(/^coupang_/, '').trim();
        const idx = mergedProds.findIndex(p => String(p.productId) === productId);

        if (idx !== -1) {
          // R05: Dùng restoreProduct để thay thế các user fields đã lưu trong backup
          mergedProds[idx] = restoreProduct(mergedProds[idx], raw);
        } else {
          const newProd = migrateProduct({
            ...raw,
            productId,
            id: raw.id || `coupang_${productId}`,
            niche: raw.niche || nicheCode,
            nicheName: raw.nicheName || nicheName
          });
          if (newProd) mergedProds.push(newProd);
        }
        importedCount++;
      }

      const mergedCats = [...existingCats];
      if (categoriesToImport.length > 0) {
        categoriesToImport.forEach(c => {
          if (!mergedCats.some(ec => ec.code === c.code)) mergedCats.push(c);
        });
      }

      // F03: Commit đồng thời cả products và categories trong một atomic storage operation
      const success = await setStorageMulti({
        [KEY_PRODUCTS]: mergedProds,
        [KEY_CATEGORIES]: mergedCats
      });
      if (!success) throw new Error('Không thể ghi dữ liệu import vào storage');

      broadcastStorageUpdate('BACKUP_RESTORED', { importedCount });
      return importedCount;
    });
  }

  return {
    SCHEMA_VERSION,
    ASSESSMENT_RULES_REVISION,
    KEY_PRODUCTS,
    KEY_CATEGORIES,
    KEY_INITIALIZED,
    initDatabase,
    migrateStorage,
    getAllProducts,
    getProductById,
    saveProduct,
    updateProductCogs,
    saveSourcingDossier,
    saveEvidenceDossier,
    saveEconomics,
    saveBaseline,
    restoreProduct,
    toggleWatchlist,
    batchImportProducts,
    getStats,
    enrichProduct,
    migrateProduct,
    mergeScannedProduct,
    exportBackup,
    importBackup,
    serializeMutation,
    validateSourcingTerms,
    // Cho test suite inject storage adapter
    _getStorage: getStorage,
    _setStorage: setStorage,
    _setStorageMulti: setStorageMulti,
    _setCustomWriter: _setCustomWriter
  };
});
