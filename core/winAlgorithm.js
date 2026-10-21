/**
 * WINNING PRODUCT ALGORITHM (WPI) & TRIAL SELLING ELIGIBILITY EVALUATOR
 * Chạy 100% Client-side trong Chrome Extension, Service Worker & Node.js
 * 
 * Tách bạch rõ ràng:
 * 1. Điểm ưu tiên sàng lọc (Screening Heuristic - WPI)
 * 2. Đánh giá điều kiện thử bán (Trial Selling Eligibility Assessment)
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      typeof require === 'function' ? require('./kcRules.js') : null
    );
  } else {
    root.KDropWinAlgorithm = factory(root.KDropKcRules);
  }
})(typeof self !== 'undefined' ? self : this, function(injectedKcRules) {

  const kcRulesModule = injectedKcRules || (typeof self !== 'undefined' ? self.KDropKcRules : null);

  const RESEARCH_PROFILE_DEFAULTS = {
    minPeakMonthlySearches: 10000, // Tối thiểu 10,000 lượt tìm kiếm đỉnh tháng
    maxRocketSharePct: 70,         // Thị phần Rocket dưới 70%
    minSellerReviews: 30,          // Tối thiểu 30 review nhà bán quốc tế
    minPreferredPriceKrw: 100000,  // Giá ưu tiên >= 100,000 KRW
    minAbsolutePriceKrw: 50000,    // Giá tối thiểu tuyệt đối 50,000 KRW (dưới 50k là FAIL)
    minNetMarginPct: 25.0          // Biên lợi nhuận ròng sau toàn bộ chi phí >= 25%
  };

  const ELIGIBILITY_STATUSES = {
    READY_FOR_TRIAL: 'ready_for_trial',
    NEEDS_VERIFICATION: 'needs_verification',
    NOT_ELIGIBLE: 'not_eligible'
  };

  /**
   * 1. TÍNH ĐIỂM SÀNG LỌC (WINNING PRODUCT INDEX - WPI)
   * Trọng số: Lãi ròng 35%, Rocket gap 25%, KC safety 15%, Giá bán 15%, BSR 10%
   */
  function calculateWinningProductIndex({
    netMarginPct = null,
    isRocket = null,
    rocketType = null,
    kcLevel = 'LOW',
    salesPriceKrw = null,
    rank = null,
    isProvisional = false
  }) {
    const missingComponents = [];
    const breakdown = {};

    // 1. Biên Lợi Nhuận Ròng (35%)
    let marginWeighted = 0;
    let marginRaw = 0;
    let marginExp = '';
    if (netMarginPct === null || netMarginPct === undefined || !Number.isFinite(Number(netMarginPct))) {
      missingComponents.push('margin');
      breakdown.margin = { raw: null, weighted: null, max: 35, exp: 'Chưa có dữ liệu biên lãi', isKnown: false };
    } else {
      const margin = Number(netMarginPct);
      if (margin >= 45) {
        marginRaw = 100;
        marginExp = 'Biên lãi siêu khủng (≥45%)';
      } else if (margin >= 35) {
        marginRaw = 80;
        marginExp = 'Biên lãi hấp dẫn (35%-44%)';
      } else if (margin >= 25) {
        marginRaw = 50;
        marginExp = 'Biên lãi trung bình (25%-34%)';
      } else {
        marginRaw = 10;
        marginExp = 'Biên lãi thấp (<25%)';
      }
      marginWeighted = Math.round(marginRaw * 0.35 * 10) / 10;
      breakdown.margin = { raw: marginRaw, weighted: marginWeighted, max: 35, exp: marginExp, isKnown: true };
    }

    // 2. Cơ Hội Buy Box / Khoảng Trống Rocket (25%)
    let rocketWeighted = 0;
    let rocketRaw = 0;
    let rocketExp = '';
    if (isRocket === null || rocketType === null || rocketType === 'UNKNOWN') {
      missingComponents.push('rocketGap');
      breakdown.rocketGap = { raw: null, weighted: null, max: 25, exp: 'Chưa xác định trạng thái Rocket', isKnown: false };
    } else {
      if (!isRocket || rocketType === 'NONE') {
        rocketRaw = 100;
        rocketExp = 'Cơ hội vàng: Wing Seller giữ Buy Box (Dễ giành Buy Box)';
      } else if (rocketType === 'ROCKET_GROWTH') {
        rocketRaw = 60;
        rocketExp = 'Rocket Growth / CGF (Nhà bán gửi kho, có thể cạnh tranh)';
      } else {
        rocketRaw = 20;
        rocketExp = 'Kho Rocket độc quyền (Khó cạnh tranh tốc độ)';
      }
      rocketWeighted = Math.round(rocketRaw * 0.25 * 10) / 10;
      breakdown.rocketGap = { raw: rocketRaw, weighted: rocketWeighted, max: 25, exp: rocketExp, isKnown: true };
    }

    // 3. Độ An Toàn KC (15%)
    let kcWeighted = 0;
    let kcRaw = 0;
    let kcExp = '';
    if (!kcLevel) {
      missingComponents.push('kcSafety');
      breakdown.kcSafety = { raw: null, weighted: null, max: 15, exp: 'Chưa phân tích từ khóa KC', isKnown: false };
    } else {
      if (kcLevel === 'LOW') {
        kcRaw = 100;
        kcExp = 'An toàn tuyệt đối: Miễn trừ kiểm định KC';
      } else if (kcLevel === 'MEDIUM') {
        kcRaw = 50;
        kcExp = 'Cần cẩn trọng quy chuẩn an toàn / thực phẩm';
      } else {
        kcRaw = 0;
        kcExp = 'Rủi ro cao: Bắt buộc kiểm định KC';
      }
      kcWeighted = Math.round(kcRaw * 0.15 * 10) / 10;
      breakdown.kcSafety = { raw: kcRaw, weighted: kcWeighted, max: 15, exp: kcExp, isKnown: true };
    }

    // 4. Tính Khả Thi Của Giá Bán (15%)
    let priceWeighted = 0;
    let priceRaw = 0;
    let priceExp = '';
    if (salesPriceKrw === null || salesPriceKrw === undefined || Number(salesPriceKrw) <= 0) {
      missingComponents.push('priceViability');
      breakdown.priceViability = { raw: null, weighted: null, max: 15, exp: 'Chưa có giá bán', isKnown: false };
    } else {
      const price = Number(salesPriceKrw);
      if (price >= 20000) {
        priceRaw = 100;
        priceExp = 'Giá tốt (≥20k KRW): Biên lãi tiền mặt dày';
      } else if (price >= 15000) {
        priceRaw = 80;
        priceExp = 'Khoảng giá chuẩn dropship (15k-20k KRW)';
      } else if (price >= 10000) {
        priceRaw = 50;
        priceExp = 'Giá trung bình (10k-15k KRW)';
      } else {
        priceRaw = 20;
        priceExp = 'Giá thấp (<10k KRW): Dễ bị cước ship ăn hết tiền lời';
      }
      priceWeighted = Math.round(priceRaw * 0.15 * 10) / 10;
      breakdown.priceViability = { raw: priceRaw, weighted: priceWeighted, max: 15, exp: priceExp, isKnown: true };
    }

    // 5. Nhu Cầu Thị Trường BSR (10%)
    let demandWeighted = 0;
    let demandRaw = 0;
    let demandExp = '';
    if (rank === null || rank === undefined || Number(rank) <= 0) {
      missingComponents.push('demand');
      breakdown.demand = { raw: null, weighted: null, max: 10, exp: 'Chưa có thứ hạng BSR xác minh', isKnown: false };
    } else {
      const r = Number(rank);
      if (r <= 10) {
        demandRaw = 100;
        demandExp = 'Top 10 BSR: Bán cực chạy';
      } else if (r <= 25) {
        demandRaw = 85;
        demandExp = 'Top 11-25 BSR: Sức mua rất cao';
      } else if (r <= 50) {
        demandRaw = 75;
        demandExp = 'Top 26-50 BSR: Thị trường ổn định';
      } else {
        demandRaw = 60;
        demandExp = 'Thứ hạng ngoài Top 50';
      }
      demandWeighted = Math.round(demandRaw * 0.10 * 10) / 10;
      breakdown.demand = { raw: demandRaw, weighted: demandWeighted, max: 10, exp: demandExp, isKnown: true };
    }

    const isComplete = missingComponents.length === 0;

    // Chỉ tính tổng điểm hoàn chỉnh khi có đầy đủ các thành phần đầu vào
    let totalScore = null;
    let tier = 'HIGH_RISK';
    let tierLabelVi = 'Rủi Ro / Khó Cạnh Tranh';
    let badgeColor = 'bg-rose-50 text-rose-700 border-rose-300';
    let starEmoji = '⚠️';

    if (isComplete) {
      const rawSum = marginWeighted + rocketWeighted + kcWeighted + priceWeighted + demandWeighted;
      totalScore = Math.min(100, Math.max(0, Math.round(rawSum * 10) / 10));

      if (totalScore >= 85) {
        tier = 'DIAMOND_WIN';
        tierLabelVi = 'DIAMOND WIN (Cực Phẩm)';
        badgeColor = 'bg-emerald-600 text-white border-emerald-500 shadow-sm';
        starEmoji = '🌟';
      } else if (totalScore >= 70) {
        tier = 'GOLD_WIN';
        tierLabelVi = 'GOLD WIN (Tiềm Năng Cao)';
        badgeColor = 'bg-blue-600 text-white border-blue-500 shadow-sm';
        starEmoji = '🥇';
      } else if (totalScore >= 55) {
        tier = 'SILVER';
        tierLabelVi = 'SILVER (Khả Thi)';
        badgeColor = 'bg-slate-700 text-white border-slate-600';
        starEmoji = '🥈';
      }
    } else {
      // Khi thiếu thành phần, không hiển thị tổng điểm hoàn chỉnh
      totalScore = null;
      tier = 'INCOMPLETE';
      tierLabelVi = 'Chưa Đủ Thành Phần';
      badgeColor = 'bg-slate-100 text-slate-500 border-slate-300';
      starEmoji = '⏳';
    }

    return {
      score: totalScore,
      isComplete,
      isProvisional: Boolean(isProvisional || !isComplete),
      missingComponents,
      tier,
      tierLabelVi,
      badgeColor,
      starEmoji,
      breakdown
    };
  }

  /**
   * 2. ĐÁNH GIÁ ĐIỀU KIỆN THỬ BÁN (TRIAL SELLING ELIGIBILITY EVALUATION)
   * Kết luận: ready_for_trial | needs_verification | not_eligible
   */
  function evaluateTrialEligibility(product = {}, profileConfig = {}) {
    const cfg = { ...RESEARCH_PROFILE_DEFAULTS, ...profileConfig };
    const criteria = [];
    const blockingReasons = [];
    const pendingActions = [];

    const evidence = product.evidenceDossier || {};
    const sourcing = product.sourcingDossier || {};
    const financial = product.financial || {};
    const kc = product.kcSafety || {};

    const targetPrice = Number(product.economics?.targetSalesPriceKrw || product.salesPriceKrw) || 0;
    const netMarginPct = financial.netMarginPct !== undefined ? Number(financial.netMarginPct) : null;
    const netProfitKrw = financial.netProfitKrw !== undefined ? Number(financial.netProfitKrw) : null;

    // --- 1. Tiêu chí Dung Lượng Tìm Kiếm (Demand Criterion) ---
    const demand = evidence.demand || {};
    const searches = (demand.peakMonthlySearches !== undefined && demand.peakMonthlySearches !== null && demand.peakMonthlySearches !== '')
      ? Number(demand.peakMonthlySearches)
      : null;

    const hasDemandKeyword = Boolean(demand.keyword && String(demand.keyword).trim().length > 0);
    const hasDemandGeography = Boolean(demand.geography && String(demand.geography).trim().length > 0);
    const hasDemandPeriod = Boolean(demand.period && String(demand.period).trim().length > 0);
    const hasDemandSource = Boolean(demand.source && String(demand.source).trim().length > 0);
    const hasAbsoluteUnits = Boolean(demand.unit && ['SEARCHES', 'ABSOLUTE_SEARCHES', 'COUNT'].includes(String(demand.unit).trim().toUpperCase()));
    const hasSeasonalityFinding = Boolean(demand.seasonalityReviewed && ((demand.seasonalityFinding && String(demand.seasonalityFinding).trim().length > 0) || (demand.seasonalityNotes && String(demand.seasonalityNotes).trim().length > 0)));

    if (searches === null) {
      criteria.push({
        id: 'demand_searches',
        name: 'Dung lượng tìm kiếm tháng đỉnh điểm (Năm trước)',
        status: 'UNKNOWN',
        reason: 'Chưa có bằng chứng số liệu tìm kiếm tuyệt đối (tối thiểu 10,000 lượt)',
        value: null,
        target: `≥ ${cfg.minPeakMonthlySearches.toLocaleString()} lượt/tháng`
      });
      pendingActions.push('Bổ sung số liệu tìm kiếm tuyệt đối từ Naver/ItemScout');
    } else if (searches < cfg.minPeakMonthlySearches) {
      criteria.push({
        id: 'demand_searches',
        name: 'Dung lượng tìm kiếm tháng đỉnh điểm',
        status: 'FAIL',
        reason: `Dung lượng tìm kiếm (${searches.toLocaleString()}) thấp hơn ngưỡng tối thiểu ${cfg.minPeakMonthlySearches.toLocaleString()} lượt`,
        value: searches,
        target: `≥ ${cfg.minPeakMonthlySearches.toLocaleString()}`
      });
      blockingReasons.push(`Dung lượng tìm kiếm đỉnh điểm (${searches.toLocaleString()}) < ${cfg.minPeakMonthlySearches.toLocaleString()} lượt`);
    } else {
      // searches >= 10,000
      const missingDemandFields = [];
      if (!hasDemandKeyword) missingDemandFields.push('từ khóa');
      if (!hasDemandGeography) missingDemandFields.push('khu vực địa lý');
      if (!hasDemandPeriod) missingDemandFields.push('kỳ đối chiếu năm trước');
      if (!hasDemandSource) missingDemandFields.push('nguồn dữ liệu');
      if (!hasAbsoluteUnits) missingDemandFields.push('đơn vị tìm kiếm tuyệt đối');
      if (!hasSeasonalityFinding) missingDemandFields.push('ghi nhận phân tích mùa vụ');

      if (missingDemandFields.length > 0) {
        criteria.push({
          id: 'demand_searches',
          name: 'Dung lượng tìm kiếm & Mùa vụ',
          status: 'REVIEW_REQUIRED',
          reason: `Tìm kiếm đạt ${searches.toLocaleString()} lượt nhưng hồ sơ còn thiếu: ${missingDemandFields.join(', ')}`,
          value: searches,
          target: `≥ ${cfg.minPeakMonthlySearches.toLocaleString()} + đủ chứng cứ từ khóa/nguồn/kỳ/mùa vụ`
        });
        pendingActions.push(`Bổ sung chứng cứ nhu cầu còn thiếu: ${missingDemandFields.join(', ')}`);
      } else {
        criteria.push({
          id: 'demand_searches',
          name: 'Dung lượng tìm kiếm & Mùa vụ',
          status: 'PASS',
          reason: `Tìm kiếm đỉnh đạt ${searches.toLocaleString()} lượt/tháng (${demand.source}, ${demand.period}) và đã thẩm định mùa vụ`,
          value: searches,
          target: `≥ ${cfg.minPeakMonthlySearches.toLocaleString()}`
        });
      }
    }

    // --- 2. Tiêu chí Tỷ Lệ Đối Thủ Rocket (Rocket Share Criterion) ---
    const rocket = evidence.rocketCompetition || {};
    const sampleSize = (rocket.sampleSize !== undefined && rocket.sampleSize !== null && rocket.sampleSize !== '')
      ? Number(rocket.sampleSize)
      : null;
    const rocketCount = (rocket.rocketCount !== undefined && rocket.rocketCount !== null && rocket.rocketCount !== '')
      ? Number(rocket.rocketCount)
      : null;
    const hasRocketKeywordOrCat = Boolean((rocket.keywordOrCategory || rocket.keyword || '').trim().length > 0);
    const hasRocketInspectedAt = Boolean((rocket.inspectedAt || rocket.inspectionDate || '').trim().length > 0);

    if (sampleSize === null || rocketCount === null) {
      criteria.push({
        id: 'rocket_share',
        name: 'Thị phần đối thủ Rocket Delivery/Growth',
        status: 'UNKNOWN',
        reason: 'Chưa có mẫu kiểm tra thực tế trên Coupang',
        value: null,
        target: `< ${cfg.maxRocketSharePct}%`
      });
      pendingActions.push('Kiểm tra mẫu kết quả tìm kiếm Coupang và ghi nhận số lượng Rocket');
    } else if (!Number.isInteger(sampleSize) || sampleSize <= 0 || !Number.isInteger(rocketCount) || rocketCount < 0 || rocketCount > sampleSize) {
      criteria.push({
        id: 'rocket_share',
        name: 'Thị phần đối thủ Rocket',
        status: 'UNKNOWN',
        reason: `Số liệu mẫu Rocket không hợp lệ (mẫu: ${sampleSize}, số Rocket: ${rocketCount}). Mẫu phải là số nguyên dương và số Rocket từ 0 đến mẫu`,
        value: null,
        target: `< ${cfg.maxRocketSharePct}%`
      });
      pendingActions.push('Nhập số liệu mẫu kiểm tra Rocket hợp lệ (0 <= rocketCount <= sampleSize)');
    } else {
      const rocketShareRatio = rocketCount / sampleSize;
      const sharePct = Math.round(rocketShareRatio * 1000) / 10;
      const maxRatio = cfg.maxRocketSharePct / 100;

      if (rocketShareRatio >= maxRatio) {
        criteria.push({
          id: 'rocket_share',
          name: 'Thị phần đối thủ Rocket',
          status: 'FAIL',
          reason: `Tỷ lệ Rocket là ${sharePct}% (${rocketCount}/${sampleSize}) ≥ ngưỡng ${cfg.maxRocketSharePct}%. Khó cạnh tranh tốc độ`,
          value: `${sharePct}%`,
          target: `< ${cfg.maxRocketSharePct}%`
        });
        blockingReasons.push(`Tỷ lệ Rocket (${sharePct}%) ≥ ${cfg.maxRocketSharePct}%`);
      } else if (!hasRocketKeywordOrCat || !hasRocketInspectedAt) {
        criteria.push({
          id: 'rocket_share',
          name: 'Thị phần đối thủ Rocket',
          status: 'REVIEW_REQUIRED',
          reason: `Tỷ lệ Rocket là ${sharePct}% < ${cfg.maxRocketSharePct}% nhưng chưa ghi nhận từ khóa/danh mục hoặc ngày kiểm tra`,
          value: `${sharePct}%`,
          target: `< ${cfg.maxRocketSharePct}% + có ngày và danh mục kiểm tra`
        });
        pendingActions.push('Ghi nhận danh mục/từ khóa và ngày kiểm tra mẫu Rocket');
      } else {
        criteria.push({
          id: 'rocket_share',
          name: 'Thị phần đối thủ Rocket',
          status: 'PASS',
          reason: `Tỷ lệ Rocket là ${sharePct}% (${rocketCount}/${sampleSize}) < ngưỡng ${cfg.maxRocketSharePct}%`,
          value: `${sharePct}%`,
          target: `< ${cfg.maxRocketSharePct}%`
        });
      }
    }

    // --- 3. Tiêu chí Review Nhà Bán Quốc Tế (Seller-specific Review Criterion) ---
    const seller = evidence.sellerEvidence || {};
    const sellerReviews = (seller.sellerReviewCount !== undefined && seller.sellerReviewCount !== null && seller.sellerReviewCount !== '')
      ? Number(seller.sellerReviewCount)
      : null;
    const hasOfferUrl = Boolean((seller.offerUrl || seller.comparableOfferUrl || '').trim().length > 0);
    const hasSellerId = Boolean((seller.sellerId || '').trim().length > 0);
    const hasSellerInspectedAt = Boolean((seller.inspectedAt || seller.inspectionDate || '').trim().length > 0);
    const isInternational = seller.isInternationalDelivery === true;

    if (sellerReviews === null) {
      criteria.push({
        id: 'seller_reviews',
        name: 'Review nhà bán quốc tế tương đương',
        status: 'UNKNOWN',
        reason: 'Chưa có bằng chứng review riêng của seller quốc tế đối thủ (tối thiểu 30 review)',
        value: null,
        target: `≥ ${cfg.minSellerReviews} reviews`
      });
      pendingActions.push('Tìm link đối thủ giao hàng quốc tế và ghi nhận số review của seller');
    } else if (!Number.isInteger(sellerReviews) || sellerReviews < cfg.minSellerReviews) {
      criteria.push({
        id: 'seller_reviews',
        name: 'Review nhà bán quốc tế',
        status: 'FAIL',
        reason: `Số review nhà bán quốc tế (${sellerReviews}) chưa đạt ngưỡng tối thiểu ${cfg.minSellerReviews}`,
        value: sellerReviews,
        target: `≥ ${cfg.minSellerReviews}`
      });
      blockingReasons.push(`Số review seller quốc tế (${sellerReviews}) < ${cfg.minSellerReviews}`);
    } else if (!isInternational) {
      criteria.push({
        id: 'seller_reviews',
        name: 'Review nhà bán quốc tế',
        status: 'REVIEW_REQUIRED',
        reason: `Số review đạt (${sellerReviews}) nhưng chưa xác nhận nhà bán giao hàng quốc tế (isInternationalDelivery = true). Review nhà bán nội địa không thỏa mãn tiêu chí.`,
        value: sellerReviews,
        target: `≥ ${cfg.minSellerReviews} + giao hàng quốc tế`
      });
      pendingActions.push('Xác nhận chào hàng đối thủ có giao hàng quốc tế (international delivery)');
    } else if (!hasOfferUrl || !hasSellerId || !hasSellerInspectedAt) {
      const missingSellerMeta = [];
      if (!hasOfferUrl) missingSellerMeta.push('link chào hàng tương đương');
      if (!hasSellerId) missingSellerMeta.push('mã định danh seller');
      if (!hasSellerInspectedAt) missingSellerMeta.push('ngày kiểm tra');
      criteria.push({
        id: 'seller_reviews',
        name: 'Review nhà bán quốc tế',
        status: 'REVIEW_REQUIRED',
        reason: `Review đạt ${sellerReviews} nhưng còn thiếu: ${missingSellerMeta.join(', ')}`,
        value: sellerReviews,
        target: `≥ ${cfg.minSellerReviews} + đủ link/seller/ngày`
      });
      pendingActions.push(`Bổ sung chứng cứ seller: ${missingSellerMeta.join(', ')}`);
    } else {
      criteria.push({
        id: 'seller_reviews',
        name: 'Review nhà bán quốc tế',
        status: 'PASS',
        reason: `Đã ghi nhận ${sellerReviews} review nhà bán quốc tế (Seller ID: ${seller.sellerId}) có link đối chứng`,
        value: sellerReviews,
        target: `≥ ${cfg.minSellerReviews}`
      });
    }

    // --- 4. Tiêu chí Giá Bán Mục Tiêu (Price Criterion) ---
    const priceReview = evidence.priceReview || {};

    if (targetPrice <= 0) {
      criteria.push({
        id: 'sales_price',
        name: 'Khoảng giá bán mục tiêu',
        status: 'UNKNOWN',
        reason: 'Chưa có giá bán mục tiêu hợp lệ',
        value: null,
        target: `≥ ${cfg.minAbsolutePriceKrw.toLocaleString()} KRW`
      });
      pendingActions.push('Cập nhật giá bán mục tiêu');
    } else if (targetPrice < cfg.minAbsolutePriceKrw) {
      criteria.push({
        id: 'sales_price',
        name: 'Khoảng giá bán mục tiêu',
        status: 'FAIL',
        reason: `Giá mục tiêu ${targetPrice.toLocaleString()} KRW < 50,000 KRW. Không đạt tiêu chí nghiên cứu ngách K-Drop`,
        value: `${targetPrice.toLocaleString()} ₩`,
        target: `≥ ${cfg.minAbsolutePriceKrw.toLocaleString()} ₩`
      });
      blockingReasons.push(`Giá bán (${targetPrice.toLocaleString()} ₩) < 50,000 ₩`);
    } else if (targetPrice >= cfg.minPreferredPriceKrw) {
      criteria.push({
        id: 'sales_price',
        name: 'Khoảng giá bán mục tiêu',
        status: 'PASS',
        reason: `Giá ${targetPrice.toLocaleString()} KRW ≥ 100k KRW (Khoảng giá tối ưu cho dropship)`,
        value: `${targetPrice.toLocaleString()} ₩`,
        target: `≥ ${cfg.minPreferredPriceKrw.toLocaleString()} ₩`
      });
    } else {
      // 50k - dưới 100k
      if (priceReview.isReviewed && priceReview.justification && priceReview.justification.trim().length > 0) {
        criteria.push({
          id: 'sales_price',
          name: 'Khoảng giá bán mục tiêu (50k - 100k)',
          status: 'PASS',
          reason: `Giá ${targetPrice.toLocaleString()} KRW đã có giải trình kinh tế: "${priceReview.justification.trim()}"`,
          value: `${targetPrice.toLocaleString()} ₩`,
          target: '50k-100k ₩ + đã giải trình'
        });
      } else {
        criteria.push({
          id: 'sales_price',
          name: 'Khoảng giá bán mục tiêu (50k - 100k)',
          status: 'REVIEW_REQUIRED',
          reason: `Giá ${targetPrice.toLocaleString()} KRW nằm trong khoảng 50k - 100k KRW, cần giải trình kinh tế rõ ràng trước khi thử bán`,
          value: `${targetPrice.toLocaleString()} ₩`,
          target: 'Cần giải trình kinh tế'
        });
        pendingActions.push('Ghi nhận giải trình lý do chọn khoảng giá 50,000 - 100,000 KRW');
      }
    }

    // --- 5. Tiêu chí Biên Lợi Nhuận Hoàn Chỉnh (Complete Net Margin Criterion) ---
    // R11: so sánh tỷ lệ thực tế chưa làm tròn
    const calcSalesPrice = targetPrice > 0 ? targetPrice : (Number(product.salesPriceKrw) || 0);
    const netProfit = (financial.netProfitKrw !== undefined && financial.netProfitKrw !== null) ? Number(financial.netProfitKrw) : null;
    const netMarginRatio = (calcSalesPrice > 0 && netProfit !== null)
      ? (netProfit / calcSalesPrice)
      : (financial.netMarginRatio !== undefined ? Number(financial.netMarginRatio) : (netMarginPct !== null ? netMarginPct / 100 : null));
    const minMarginRatio = cfg.minNetMarginPct / 100; // 0.25

    if (netMarginRatio === null || !financial.isComplete) {
      criteria.push({
        id: 'net_margin',
        name: 'Biên lợi nhuận ròng sau chi phí vận hành',
        status: 'UNKNOWN',
        reason: `Chưa có đầy đủ các chi phí vận hành (thiếu: ${(financial.missingCosts || []).join(', ') || 'chi phí'})`,
        value: netMarginPct !== null ? `${netMarginPct}% (chưa đủ)` : null,
        target: `≥ ${cfg.minNetMarginPct}% sau toàn bộ chi phí`
      });
      pendingActions.push('Nhập đầy đủ chi phí: giá vốn, quảng cáo, dự phòng hoàn hủy, cước ship');
    } else if (netProfit <= 0 || netMarginRatio < minMarginRatio) {
      const displayPct = netMarginPct !== null ? netMarginPct : parseFloat((netMarginRatio * 100).toFixed(2));
      criteria.push({
        id: 'net_margin',
        name: 'Biên lợi nhuận ròng sau chi phí vận hành',
        status: 'FAIL',
        reason: `Biên lãi ròng ${displayPct}% (${(netProfit || 0).toLocaleString()} ₩) chưa đạt ngưỡng tối thiểu ${cfg.minNetMarginPct}% hoặc sản phẩm lỗ`,
        value: `${displayPct}%`,
        target: `≥ ${cfg.minNetMarginPct}%`
      });
      blockingReasons.push(`Biên lãi ròng (${displayPct}%) < ${cfg.minNetMarginPct}% hoặc sản phẩm lỗ`);
    } else {
      criteria.push({
        id: 'net_margin',
        name: 'Biên lợi nhuận ròng sau chi phí vận hành',
        status: 'PASS',
        reason: `Biên lãi ròng ${netMarginPct}% (${netProfit.toLocaleString()} ₩) đạt tiêu chí (≥ ${cfg.minNetMarginPct}%)`,
        value: `${netMarginPct}%`,
        target: `≥ ${cfg.minNetMarginPct}%`
      });
    }

    // --- 6. Tiêu chí Xác Minh Báo Giá Xưởng 1688 (Sourcing Quote Verification) ---
    const isQuoteVerified = Boolean(sourcing.isVerified);
    const hasSupplierUrl = Boolean(sourcing.supplierUrl && String(sourcing.supplierUrl).trim().length > 0);
    const hasQuoteDate = Boolean((sourcing.quoteDate || sourcing.verifiedAt || '').trim().length > 0);
    const hasVariant = Boolean((sourcing.variant || '').trim().length > 0);
    const quotePrice = Number(sourcing.unitPriceCny || sourcing.cogs1688Cny || 0);
    const hasValidPrice = Number.isFinite(quotePrice) && quotePrice > 0;
    const quantity = (sourcing.quantity !== undefined && sourcing.quantity !== null && sourcing.quantity !== '') ? Number(sourcing.quantity) : null;
    const moq = (sourcing.moq !== undefined && sourcing.moq !== null && sourcing.moq !== '') ? Number(sourcing.moq) : null;
    const hasValidQty = Number.isInteger(quantity) && quantity > 0;
    const hasValidMoq = Number.isInteger(moq) && moq > 0;
    const isMoqApplicable = (hasValidQty && hasValidMoq && quantity >= moq) || Boolean(sourcing.moqApplicabilityNotes && String(sourcing.moqApplicabilityNotes).trim().length > 0);

    const isQuoteFullyComplete = isQuoteVerified && hasSupplierUrl && hasQuoteDate && hasVariant && hasValidPrice && hasValidQty && hasValidMoq && isMoqApplicable;

    if (isQuoteFullyComplete) {
      criteria.push({
        id: 'sourcing_quote',
        name: 'Báo giá xưởng 1688 xác minh',
        status: 'PASS',
        reason: `Đã xác minh báo giá xưởng (${quotePrice} CNY) khớp quy cách ("${sourcing.variant}"), số lượng (${quantity}) và MOQ (${moq})`,
        value: `${quotePrice} ¥`,
        target: 'Báo giá chính xác + xác nhận của người vận hành'
      });
    } else {
      const missingQuoteItems = [];
      if (!hasSupplierUrl) missingQuoteItems.push('link xưởng 1688');
      if (!hasQuoteDate) missingQuoteItems.push('ngày báo giá');
      if (!hasVariant) missingQuoteItems.push('quy cách/phân loại');
      if (!hasValidPrice) missingQuoteItems.push('đơn giá CNY hợp lệ');
      if (!hasValidQty) missingQuoteItems.push('số lượng dự kiến mua');
      if (!hasValidMoq) missingQuoteItems.push('MOQ của xưởng');
      if (hasValidQty && hasValidMoq && !isMoqApplicable) missingQuoteItems.push('số lượng nhỏ hơn MOQ (cần ghi chú thỏa thuận)');
      if (!isQuoteVerified) missingQuoteItems.push('xác nhận người vận hành');

      criteria.push({
        id: 'sourcing_quote',
        name: 'Báo giá xưởng 1688 xác minh',
        status: 'REVIEW_REQUIRED',
        reason: `Báo giá xưởng chưa đầy đủ hoặc chưa xác minh (thiếu: ${missingQuoteItems.join(', ')})`,
        value: quotePrice > 0 ? `${quotePrice} ¥ (chưa xác minh)` : null,
        target: 'Báo giá thực tế đầy đủ + xác nhận'
      });
      pendingActions.push(`Hoàn thiện hồ sơ báo giá xưởng: ${missingQuoteItems.join(', ')}`);
    }

    // --- 7. Tiêu chí Sẵn Sàng Vận Chuyển & Xử Lý Đơn (Fulfillment Readiness) ---
    const fulfillment = evidence.fulfillment || product.evidenceDossier?.fulfillment || {};
    const shippingBasis = fulfillment.shippingBasis || product.economics?.shippingBasis;

    // F04: QUOTED yêu cầu số tiền cước thực tế và nguồn/đơn vị báo giá
    const shippingCost = (fulfillment.shippingQuoteKrw !== undefined && fulfillment.shippingQuoteKrw !== null)
      ? Number(fulfillment.shippingQuoteKrw)
      : (product.economics?.shippingCostKrw !== undefined && product.economics?.shippingCostKrw !== null
          ? Number(product.economics.shippingCostKrw)
          : (product.financial?.shippingCostKrw !== undefined && product.financial?.shippingCostKrw !== null
              ? Number(product.financial.shippingCostKrw)
              : null));
    const hasShippingSource = Boolean((fulfillment.shippingBasisSource || fulfillment.shippingSource || fulfillment.source || '').trim().length > 0);
    const isQuotedBasis = shippingBasis === 'QUOTED' && shippingCost !== null && Number.isFinite(shippingCost) && shippingCost >= 0 && hasShippingSource;

    // F04: REVIEWED_WEIGHT yêu cầu trọng lượng đo lường thực tế > 0 và nguồn biểu phí đã thẩm định
    const measuredWeight = (fulfillment.measuredWeightGram !== undefined && fulfillment.measuredWeightGram !== null)
      ? Number(fulfillment.measuredWeightGram)
      : (fulfillment.weightGram !== undefined && fulfillment.weightGram !== null
          ? Number(fulfillment.weightGram)
          : (product.economics?.weightGram !== undefined && product.economics?.weightGram !== null
              ? Number(product.economics.weightGram)
              : null));
    const hasMeasuredWeight = measuredWeight !== null && Number.isFinite(measuredWeight) && measuredWeight > 0;
    const isReviewedWeightBasis = shippingBasis === 'REVIEWED_WEIGHT' && hasMeasuredWeight && hasShippingSource;

    const hasSupportedShippingBasis = isQuotedBasis || isReviewedWeightBasis;
    const hasDeliveryEstimate = Boolean((fulfillment.deliveryEstimate || '').trim().length > 0);
    const hasReturnArrangement = Boolean((fulfillment.returnArrangement || '').trim().length > 0);

    const isFulfillmentComplete = hasSupportedShippingBasis && hasDeliveryEstimate && hasReturnArrangement;

    if (isFulfillmentComplete) {
      criteria.push({
        id: 'fulfillment_readiness',
        name: 'Sẵn sàng vận chuyển & Xử lý đơn (Fulfillment)',
        status: 'PASS',
        reason: `Đã có cơ sở cước (${shippingBasis}), thời gian giao hàng (${fulfillment.deliveryEstimate}) và phương án hoàn hủy (${fulfillment.returnArrangement})`,
        value: shippingBasis,
        target: 'Cơ sở cước thực tế + ước tính giao hàng + hoàn hủy'
      });
    } else {
      const missingFulfillment = [];
      if (!hasSupportedShippingBasis) {
        if (shippingBasis === 'QUOTED') {
          missingFulfillment.push('số tiền cước báo giá và nguồn báo giá thực tế');
        } else if (shippingBasis === 'REVIEWED_WEIGHT') {
          missingFulfillment.push('trọng lượng đo lường thực tế và nguồn biểu phí');
        } else {
          missingFulfillment.push('cơ sở cước vận chuyển (báo giá hoặc trọng lượng đã kiểm chứng)');
        }
      }
      if (!hasDeliveryEstimate) missingFulfillment.push('ước tính thời gian giao hàng');
      if (!hasReturnArrangement) missingFulfillment.push('phương án hoàn/hủy hàng');

      criteria.push({
        id: 'fulfillment_readiness',
        name: 'Sẵn sàng vận chuyển & Xử lý đơn (Fulfillment)',
        status: 'REVIEW_REQUIRED',
        reason: `Hồ sơ fulfillment chưa đầy đủ (thiếu: ${missingFulfillment.join(', ')})`,
        value: null,
        target: 'Báo giá cước + thời gian giao + quy trình hoàn hủy'
      });
      pendingActions.push(`Bổ sung chứng cứ fulfillment: ${missingFulfillment.join(', ')}`);
    }

    // --- 8. Tiêu chí An Toàn Chứng Nhận KC (KC Safety Review) ---
    const kcReview = evidence.kcReview || {};
    let kcReadiness = { isResolved: false, status: 'REVIEW_REQUIRED', reason: 'Chưa có thẩm định KC ghi nhận từ người vận hành' };
    if (kcRulesModule && kcRulesModule.evaluateKcReadiness) {
      kcReadiness = kcRulesModule.evaluateKcReadiness(kc, kcReview);
    }

    if (kcReadiness.status === 'PASS') {
      criteria.push({
        id: 'kc_certification',
        name: 'An toàn thông quan KC',
        status: 'PASS',
        reason: kcReadiness.reason,
        value: kc.level || 'LOW',
        target: 'Miễn trừ hoặc đã thẩm định an toàn có tài liệu'
      });
    } else if (kcReadiness.status === 'FAIL') {
      criteria.push({
        id: 'kc_certification',
        name: 'An toàn thông quan KC',
        status: 'FAIL',
        reason: kcReadiness.reason,
        value: kc.level || 'HIGH',
        target: 'Không được dính hàng cấm KC'
      });
      blockingReasons.push(`Rủi ro an toàn KC: ${kcReadiness.reason}`);
    } else {
      criteria.push({
        id: 'kc_certification',
        name: 'An toàn thông quan KC',
        status: 'REVIEW_REQUIRED',
        reason: kcReadiness.reason,
        value: kc.level || 'LOW',
        target: 'Bắt buộc lưu bằng chứng thẩm định (nguồn, ngày, lý do)'
      });
      pendingActions.push('Ghi nhận bằng chứng thẩm định KC (nguồn tham chiếu, ngày thẩm định và giải trình)');
    }

    // --- TỔNG KẾT KẾT LUẬN CUỐI CÙNG ---
    const hasFail = criteria.some(c => c.status === 'FAIL') || (netProfit !== null && netProfit <= 0);
    const hasPending = criteria.some(c => c.status === 'UNKNOWN' || c.status === 'REVIEW_REQUIRED');

    let status = ELIGIBILITY_STATUSES.READY_FOR_TRIAL;
    let statusLabelVi = 'Đủ Điều Kiện Thử Bán';
    let badgeClass = 'bg-emerald-600 text-white border-emerald-500 shadow-sm';
    let statusIcon = '✓';

    if (hasFail) {
      status = ELIGIBILITY_STATUSES.NOT_ELIGIBLE;
      statusLabelVi = 'Chưa Đạt Điều Kiện';
      badgeClass = 'bg-rose-600 text-white border-rose-500 shadow-sm';
      statusIcon = '✕';
    } else if (hasPending) {
      status = ELIGIBILITY_STATUSES.NEEDS_VERIFICATION;
      statusLabelVi = 'Cần Xác Minh';
      badgeClass = 'bg-amber-500 text-white border-amber-400 shadow-sm';
      statusIcon = '⚠️';
    }

    return {
      status,
      statusLabelVi,
      badgeClass,
      statusIcon,
      criteria,
      blockingReasons,
      pendingActions,
      evaluatedAt: product.trialEligibility?.evaluatedAt || new Date().toISOString(),
      profileUsed: 'Research Profile 1688->Coupang v3'
    };
  }

  return {
    RESEARCH_PROFILE_DEFAULTS,
    ELIGIBILITY_STATUSES,
    calculateWinningProductIndex,
    evaluateTrialEligibility
  };
});
