/**
 * Module tính toán chi phí, thuế phí và biên lợi nhuận cho mô hình Dropship 1688 -> Coupang
 * Cập nhật chuẩn hóa theo spec Đánh giá điều kiện thử bán:
 * - Shared Financial Results & Provenance-aware Cost Model
 * - Quản lý chi phí rành mạch: phân biệt giá trị 0 tường minh với dữ liệu thiếu
 * - Tính toán phí ship dựa trên trọng lượng/kích thước hoặc báo giá thực tế
 * - 3 Kịch bản rủi ro (Thuận lợi / Cơ sở / Bất lợi) dưới dạng giả định (Assumptions)
 * - Vốn lưu động (Working Capital) chu kỳ đối soát động theo giả định vận hành
 * Chạy 100% Client-side trong Chrome Extension & Service Worker & Node.js
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KDropFeeCalculator = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {

  const DEFAULT_CONFIG = {
    exchangeRateCnyKrw: 190,     // 1 CNY = 190 KRW
    coupangCommissionRate: 0.11, // Phí sàn Coupang 11%
    baseShippingCostKrw: 3000,   // Phí ship TQ -> KR (gói tiêu chuẩn < 500g)
    cgfStorageFeeKrw: 400,       // Phí lưu kho Rocket Growth CGF ước tính
    targetNetMarginRate: 0.30,   // Mục tiêu biên lợi nhuận ròng 30%
    krwToVndRate: 18.5           // 1 KRW ~ 18.5 VND
  };

  /**
   * Chuẩn hóa và hợp nhất các đầu vào tài chính từ params và customConfig (gồm cả các aliases tương thích)
   */
  function normalizeFinancialInputs(params = {}, customConfig = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...customConfig };
    const isExplicit = (val) => val !== undefined && val !== null && val !== '';

    // Giá bán Coupang (ưu tiên targetSalesPriceKrw nếu có)
    let salesPriceKrw = undefined;
    let hasExplicitSalesPrice = false;
    if (isExplicit(params.salesPriceKrw)) {
      salesPriceKrw = Number(params.salesPriceKrw);
      hasExplicitSalesPrice = true;
    } else if (isExplicit(params.targetSalesPriceKrw)) {
      salesPriceKrw = Number(params.targetSalesPriceKrw);
      hasExplicitSalesPrice = true;
    }

    // Giá vốn 1688 CNY
    let cogs1688Cny = undefined;
    let hasExplicitCogs = false;
    if (isExplicit(params.cogs1688Cny)) {
      cogs1688Cny = Number(params.cogs1688Cny);
      hasExplicitCogs = true;
    } else if (isExplicit(params.supplierUnitCostCny)) {
      cogs1688Cny = Number(params.supplierUnitCostCny);
      hasExplicitCogs = true;
    } else if (isExplicit(params.unitPriceCny)) {
      cogs1688Cny = Number(params.unitPriceCny);
      hasExplicitCogs = true;
    } else if (isExplicit(params.cogs)) {
      cogs1688Cny = Number(params.cogs);
      hasExplicitCogs = true;
    }

    // Tỷ giá CNY/KRW
    let exchangeRateCnyKrw = cfg.exchangeRateCnyKrw;
    let hasExplicitExchangeRate = false;
    if (isExplicit(params.exchangeRateCnyKrw)) {
      exchangeRateCnyKrw = Number(params.exchangeRateCnyKrw);
      hasExplicitExchangeRate = true;
    } else if (isExplicit(params.exchangeRate)) {
      exchangeRateCnyKrw = Number(params.exchangeRate);
      hasExplicitExchangeRate = true;
    } else if (isExplicit(customConfig.exchangeRateCnyKrw)) {
      exchangeRateCnyKrw = Number(customConfig.exchangeRateCnyKrw);
      hasExplicitExchangeRate = true;
    } else if (isExplicit(customConfig.exchangeRate)) {
      exchangeRateCnyKrw = Number(customConfig.exchangeRate);
      hasExplicitExchangeRate = true;
    }

    // Phí sàn Coupang (F07: Phân biệt rõ ràng hoa hồng 0% với chưa nhập)
    let platformCommissionRate = cfg.coupangCommissionRate;
    let hasExplicitCommission = false;
    if (isExplicit(params.platformCommissionRate)) {
      platformCommissionRate = Number(params.platformCommissionRate);
      hasExplicitCommission = true;
    } else if (isExplicit(params.coupangCommissionRate)) {
      platformCommissionRate = Number(params.coupangCommissionRate);
      hasExplicitCommission = true;
    } else if (isExplicit(customConfig.platformCommissionRate)) {
      platformCommissionRate = Number(customConfig.platformCommissionRate);
      hasExplicitCommission = true;
    } else if (isExplicit(customConfig.coupangCommissionRate)) {
      platformCommissionRate = Number(customConfig.coupangCommissionRate);
      hasExplicitCommission = true;
    }

    // Cước vận chuyển thực tế đã báo (nếu có - F07: 0 KRW là miễn phí ship)
    let shippingCostKrw = undefined;
    let hasExplicitShipping = false;
    if (isExplicit(params.shippingCostKrw)) {
      shippingCostKrw = Number(params.shippingCostKrw);
      hasExplicitShipping = true;
    } else if (isExplicit(params.quotedShippingCostKrw)) {
      shippingCostKrw = Number(params.quotedShippingCostKrw);
      hasExplicitShipping = true;
    } else if (isExplicit(params.shippingCost)) {
      shippingCostKrw = Number(params.shippingCost);
      hasExplicitShipping = true;
    }

    // Trọng lượng và kích thước
    let weightGram = undefined;
    let hasExplicitWeight = false;
    if (isExplicit(params.weightGram)) {
      weightGram = Number(params.weightGram);
      hasExplicitWeight = true;
    } else if (isExplicit(params.weight)) {
      weightGram = Number(params.weight);
      hasExplicitWeight = true;
    }
    const dimensions = params.dimensions || null;

    // Phí mua hộ (F07: Mode FLAT vs PERCENTAGE)
    let buyingAgentFeeKrw = undefined;
    let hasExplicitAgentFlat = false;
    if (isExplicit(params.buyingAgentFeeKrw)) {
      buyingAgentFeeKrw = Number(params.buyingAgentFeeKrw);
      hasExplicitAgentFlat = true;
    }

    let buyingAgentFeeRate = undefined;
    let hasExplicitAgentRate = false;
    if (isExplicit(params.buyingAgentFeeRate)) {
      buyingAgentFeeRate = Number(params.buyingAgentFeeRate);
      hasExplicitAgentRate = true;
    }

    const buyingAgentFeeMode = params.buyingAgentFeeMode || (hasExplicitAgentRate ? 'PERCENTAGE' : 'FLAT');
    const hasExplicitAgentFee = buyingAgentFeeMode === 'PERCENTAGE'
      ? hasExplicitAgentRate
      : hasExplicitAgentFlat;

    // Chi phí quảng cáo / đơn
    let adCostPerOrderKrw = undefined;
    let hasExplicitAdCost = false;
    if (isExplicit(params.adCostPerOrderKrw)) {
      adCostPerOrderKrw = Number(params.adCostPerOrderKrw);
      hasExplicitAdCost = true;
    } else if (isExplicit(params.adCost)) {
      adCostPerOrderKrw = Number(params.adCost);
      hasExplicitAdCost = true;
    }

    // Dự phòng hoàn hủy
    let returnAllowanceRate = undefined;
    let hasExplicitReturnRate = false;
    if (isExplicit(params.returnAllowanceRate)) {
      returnAllowanceRate = Number(params.returnAllowanceRate);
      hasExplicitReturnRate = true;
    } else if (isExplicit(params.returnRatePct)) {
      returnAllowanceRate = Number(params.returnRatePct);
      hasExplicitReturnRate = true;
    } else if (isExplicit(params.returnRate)) {
      returnAllowanceRate = Number(params.returnRate);
      hasExplicitReturnRate = true;
    }

    let returnAllowanceKrw = undefined;
    let hasExplicitReturnKrw = false;
    if (isExplicit(params.returnAllowanceKrw)) {
      returnAllowanceKrw = Number(params.returnAllowanceKrw);
      hasExplicitReturnKrw = true;
    }

    const returnAllowanceMode = params.returnAllowanceMode || (hasExplicitReturnKrw ? 'FIXED' : 'PERCENTAGE');
    const hasExplicitReturnAllowance = hasExplicitReturnKrw || hasExplicitReturnRate;

    // Chi phí khác
    let otherCostPerOrderKrw = 0;
    let hasExplicitOtherCost = false;
    if (isExplicit(params.otherCostPerOrderKrw)) {
      otherCostPerOrderKrw = Number(params.otherCostPerOrderKrw);
      hasExplicitOtherCost = true;
    }

    const fulfillmentModel = params.fulfillmentModel || (params.isCgf ? 'ROCKET_GROWTH' : 'BUYING_PER_ORDER');
    const shippingBasis = params.shippingBasis || (hasExplicitShipping ? 'QUOTED' : 'WEIGHT_ESTIMATE');

    let ordersPerDay = 10;
    if (isExplicit(params.ordersPerDay)) {
      ordersPerDay = Number(params.ordersPerDay);
    }

    let settlementCycleDays = 30;
    if (isExplicit(params.settlementCycleDays)) {
      settlementCycleDays = Number(params.settlementCycleDays);
    }

    let targetContributionPct = 15;
    if (isExplicit(params.targetContributionPct)) {
      targetContributionPct = Number(params.targetContributionPct);
    }

    return {
      salesPriceKrw,
      cogs1688Cny,
      exchangeRateCnyKrw,
      platformCommissionRate,
      shippingCostKrw,
      shippingBasis,
      weightGram,
      dimensions,
      buyingAgentFeeMode,
      buyingAgentFeeKrw,
      buyingAgentFeeRate,
      fulfillmentModel,
      adCostPerOrderKrw,
      returnAllowanceMode,
      returnAllowanceRate,
      returnAllowanceKrw,
      otherCostPerOrderKrw,
      ordersPerDay,
      settlementCycleDays,
      targetContributionPct,
      hasExplicitSalesPrice,
      hasExplicitCogs,
      hasExplicitExchangeRate,
      hasExplicitCommission,
      hasExplicitShipping,
      hasExplicitWeight,
      hasExplicitAgentFee,
      hasExplicitAgentFlat,
      hasExplicitAgentRate,
      hasExplicitAdCost,
      hasExplicitReturnAllowance,
      hasExplicitReturnRate,
      hasExplicitReturnKrw,
      hasExplicitOtherCost,
      baseShippingCostKrw: cfg.baseShippingCostKrw,
      cgfStorageFeeKrw: cfg.cgfStorageFeeKrw,
      krwToVndRate: cfg.krwToVndRate
    };
  }

  /**
   * Kiểm tra tính hợp lệ của các đầu vào số học tài chính sau khi đã chuẩn hóa
   */
  function validateFinancialInputs(params = {}, customConfig = {}) {
    const errors = [];
    const effective = normalizeFinancialInputs(params, customConfig);

    const checkNonNegative = (val, name) => {
      if (val !== undefined && val !== null) {
        if (!Number.isFinite(val)) {
          errors.push(`${name} phải là số hữu hạn hợp lệ`);
        } else if (val < 0) {
          errors.push(`${name} không được là số âm (${val})`);
        }
      }
    };

    checkNonNegative(effective.salesPriceKrw, 'Giá bán Coupang');
    checkNonNegative(effective.cogs1688Cny, 'Giá vốn 1688 CNY');
    checkNonNegative(effective.weightGram, 'Trọng lượng (gram)');
    checkNonNegative(effective.shippingCostKrw, 'Cước vận chuyển');
    checkNonNegative(effective.adCostPerOrderKrw, 'Chi phí quảng cáo / đơn');
    checkNonNegative(effective.buyingAgentFeeKrw, 'Phí mua hộ');
    checkNonNegative(effective.returnAllowanceKrw, 'Chi phí dự phòng hoàn hủy');
    checkNonNegative(effective.otherCostPerOrderKrw, 'Chi phí khác');

    if (effective.dimensions && typeof effective.dimensions === 'object') {
      checkNonNegative(effective.dimensions.lengthCm, 'Chiều dài');
      checkNonNegative(effective.dimensions.widthCm, 'Chiều rộng');
      checkNonNegative(effective.dimensions.heightCm, 'Chiều cao');
    }

    // Tỷ giá: số hữu hạn strictly > 0
    if (effective.exchangeRateCnyKrw !== undefined) {
      if (!Number.isFinite(effective.exchangeRateCnyKrw) || effective.exchangeRateCnyKrw <= 0) {
        errors.push(`Tỷ giá CNY/KRW phải là số hữu hạn lớn hơn 0 (${effective.exchangeRateCnyKrw})`);
      }
    }

    // Phí sàn: từ 0 đến 1
    if (effective.platformCommissionRate !== undefined) {
      if (!Number.isFinite(effective.platformCommissionRate) || effective.platformCommissionRate < 0 || effective.platformCommissionRate > 1) {
        errors.push(`Tỷ lệ phí sàn / hoa hồng Coupang phải từ 0 đến 1 (${effective.platformCommissionRate})`);
      }
    }

    // Tỷ lệ phí mua hộ: từ 0 đến 1
    if (effective.buyingAgentFeeRate !== undefined) {
      if (!Number.isFinite(effective.buyingAgentFeeRate) || effective.buyingAgentFeeRate < 0 || effective.buyingAgentFeeRate > 1) {
        errors.push(`Tỷ lệ phí mua hộ phải từ 0 đến 1 (${effective.buyingAgentFeeRate})`);
      }
    }

    // Tỷ lệ dự phòng hoàn hủy: từ 0 đến 100%
    if (effective.returnAllowanceRate !== undefined) {
      if (!Number.isFinite(effective.returnAllowanceRate) || effective.returnAllowanceRate < 0 || effective.returnAllowanceRate > 100) {
        errors.push(`Tỷ lệ dự phòng hoàn/hủy phải từ 0% đến 100% (${effective.returnAllowanceRate})`);
      }
    }

    if (effective.ordersPerDay !== undefined && (!Number.isFinite(effective.ordersPerDay) || effective.ordersPerDay <= 0)) {
      errors.push('Số đơn mỗi ngày phải lớn hơn 0');
    }
    if (effective.settlementCycleDays !== undefined && (!Number.isFinite(effective.settlementCycleDays) || effective.settlementCycleDays <= 0)) {
      errors.push('Chu kỳ đối soát phải lớn hơn 0');
    }

    return {
      isValid: errors.length === 0,
      errors,
      effective
    };
  }

  /**
   * Tính cước vận chuyển chuẩn từ trọng lượng (và kích thước thể tích nếu có)
   */
  function calculateShippingCost(weightGram = 300, dimensions = null, baseCost = DEFAULT_CONFIG.baseShippingCostKrw) {
    let effectiveWeight = Number(weightGram) || 300;

    if (dimensions && typeof dimensions === 'object') {
      const l = Number(dimensions.lengthCm) || 0;
      const w = Number(dimensions.widthCm) || 0;
      const h = Number(dimensions.heightCm) || 0;
      if (l > 0 && w > 0 && h > 0) {
        // Trọng lượng thể tích (thường dùng chia 6000 cho đường hàng không/chuyển phát nhanh) quy ra gram
        const volumetricGram = Math.round((l * w * h / 6000) * 1000);
        if (volumetricGram > effectiveWeight) {
          effectiveWeight = volumetricGram;
        }
      }
    }

    let shippingCostKrw = baseCost;
    if (effectiveWeight > 500) {
      const extraSteps = Math.ceil((effectiveWeight - 500) / 500);
      shippingCostKrw += extraSteps * 1000;
    }

    return {
      shippingCostKrw,
      effectiveWeightGram: effectiveWeight
    };
  }

  /**
   * Tính toán kết quả tài chính tổng hợp (Shared Financial Result)
   */
  function calculateProfit(params = {}, customConfig = {}) {
    const validation = validateFinancialInputs(params, customConfig);
    if (!validation.isValid) {
      return {
        isValid: false,
        validationErrors: validation.errors,
        salesPriceKrw: 0,
        cogs1688Cny: 0,
        cogsKrw: 0,
        coupangFeeKrw: 0,
        shippingCostKrw: 0,
        cgfFeeKrw: 0,
        buyingAgentFeeKrw: 0,
        adCostKrw: 0,
        returnReserveKrw: 0,
        otherCostKrw: 0,
        totalCostKrw: 0,
        netProfitKrw: 0,
        netMarginRatio: 0,
        netMarginPct: 0,
        preAdMarginKrw: 0,
        preAdMarginRatio: 0,
        preAdMarginPct: 0,
        roiPct: 0,
        isComplete: false,
        missingCosts: ['invalid_inputs'],
        verdict: 'INVALID',
        badgeClass: 'text-rose-700 bg-rose-50 border-rose-300'
      };
    }

    const effective = validation.effective;
    const salesPrice = effective.salesPriceKrw || 0;
    const cogsCny = effective.cogs1688Cny !== undefined ? effective.cogs1688Cny : 0;
    const exchangeRate = effective.exchangeRateCnyKrw;
    const commissionRate = effective.platformCommissionRate;

    // Chi phí hàng 1688
    const cogsKrw = Math.round(cogsCny * exchangeRate);

    // Phí sàn Coupang
    const coupangFeeKrw = Math.round(salesPrice * commissionRate);

    // Phí vận chuyển: nếu có báo giá thực tế thì dùng báo giá, nếu không tính từ cân nặng/kích thước
    let shippingCostKrw = 0;
    let shippingBasis = effective.shippingBasis;
    if (effective.shippingCostKrw !== undefined) {
      shippingCostKrw = effective.shippingCostKrw;
      shippingBasis = 'QUOTED';
    } else {
      const shipCalc = calculateShippingCost(effective.weightGram, effective.dimensions, effective.baseShippingCostKrw);
      shippingCostKrw = shipCalc.shippingCostKrw;
      if (shippingBasis !== 'REVIEWED_WEIGHT') {
        shippingBasis = 'WEIGHT_ESTIMATE';
      }
    }

    // Phí mua hộ (buying agent fee) - F07: Tôn trọng chế độ FLAT vs PERCENTAGE
    let buyingAgentFeeKrw = 0;
    if (effective.buyingAgentFeeMode === 'PERCENTAGE') {
      const rate = (effective.buyingAgentFeeRate !== undefined && effective.buyingAgentFeeRate !== null)
        ? Number(effective.buyingAgentFeeRate)
        : 0;
      buyingAgentFeeKrw = Math.round(cogsKrw * rate);
    } else {
      buyingAgentFeeKrw = (effective.buyingAgentFeeKrw !== undefined && effective.buyingAgentFeeKrw !== null)
        ? Number(effective.buyingAgentFeeKrw)
        : 0;
    }

    // Mô hình fulfillment: Buying per order không chịu phí CGF trừ khi chọn ROCKET_GROWTH
    const isRocketGrowthModel = effective.fulfillmentModel === 'ROCKET_GROWTH';
    const cgfFeeKrw = isRocketGrowthModel ? effective.cgfStorageFeeKrw : 0;

    // Chi phí khác
    const otherCostKrw = effective.otherCostPerOrderKrw || 0;

    // Phân biệt giá trị 0 tường minh với dữ liệu thiếu (F04 & F07: Missing vs Explicit 0)
    const missingCosts = [];

    let adCostKrw = 0;
    let hasAdCost = false;
    if (effective.hasExplicitAdCost) {
      adCostKrw = effective.adCostPerOrderKrw;
      hasAdCost = true;
    } else {
      missingCosts.push('adCost');
    }

    let returnReserveKrw = 0;
    let hasReturnAllowance = false;
    if (effective.returnAllowanceMode === 'FIXED' && effective.hasExplicitReturnKrw) {
      returnReserveKrw = effective.returnAllowanceKrw;
      hasReturnAllowance = true;
    } else if (effective.returnAllowanceMode === 'PERCENTAGE' && effective.hasExplicitReturnRate) {
      returnReserveKrw = Math.round(salesPrice * (effective.returnAllowanceRate / 100));
      hasReturnAllowance = true;
    } else {
      missingCosts.push('returnAllowance');
    }

    if (!effective.hasExplicitCogs) {
      missingCosts.push('cogs1688Cny');
    }
    if (!effective.hasExplicitExchangeRate) {
      missingCosts.push('exchangeRate');
    }
    if (!effective.hasExplicitCommission) {
      missingCosts.push('platformCommission');
    }
    if (!effective.hasExplicitAgentFee) {
      missingCosts.push('buyingAgentFee');
    }
    if (!effective.hasExplicitOtherCost) {
      missingCosts.push('otherCost');
    }
    if (!effective.hasExplicitShipping && shippingBasis !== 'REVIEWED_WEIGHT') {
      missingCosts.push('shippingCost');
    }
    if (shippingBasis === 'REVIEWED_WEIGHT' && !effective.hasExplicitWeight) {
      missingCosts.push('shippingWeight');
    }

    const isComplete = missingCosts.length === 0 && salesPrice > 0;

    // Tổng chi phí vận hành (bao gồm tất cả các dòng chi phí đã ghi nhận)
    const totalCostKrw = coupangFeeKrw + cogsKrw + shippingCostKrw + buyingAgentFeeKrw + cgfFeeKrw + otherCostKrw + adCostKrw + returnReserveKrw;
    const netProfitKrw = salesPrice - totalCostKrw;

    // Tỷ lệ thực tế chưa làm tròn để phục vụ so sánh ngưỡng quyết định (R11)
    const netMarginRatio = salesPrice > 0 ? (netProfitKrw / salesPrice) : 0;
    const netMarginPct = salesPrice > 0 ? parseFloat((netMarginRatio * 100).toFixed(1)) : 0;

    // Chi phí biến đổi trước Ads
    const totalVariableExAds = coupangFeeKrw + cogsKrw + shippingCostKrw + buyingAgentFeeKrw + cgfFeeKrw + otherCostKrw + returnReserveKrw;
    const preAdMarginKrw = salesPrice - totalVariableExAds;
    const preAdMarginRatio = salesPrice > 0 ? (preAdMarginKrw / salesPrice) : 0;
    const preAdMarginPct = salesPrice > 0 ? parseFloat((preAdMarginRatio * 100).toFixed(1)) : 0;

    // Vốn đầu tư trực tiếp vào hàng & ship
    const capitalInvested = cogsKrw + shippingCostKrw + buyingAgentFeeKrw;
    const roiPct = capitalInvested > 0 ? parseFloat(((netProfitKrw / capitalInvested) * 100).toFixed(1)) : 0;

    // Quyết định đánh giá verdict dựa trên tỷ lệ thực tế chưa làm tròn
    let verdict = 'LOSS';
    let badgeClass = 'text-red-600 bg-red-50 border-red-200';
    if (netMarginRatio >= 0.35) {
      verdict = 'SUPER_WIN';
      badgeClass = 'text-emerald-700 bg-emerald-50 border-emerald-300';
    } else if (netMarginRatio >= 0.25) {
      verdict = 'GOOD_WIN';
      badgeClass = 'text-blue-700 bg-blue-50 border-blue-300';
    } else if (netMarginRatio >= 0.15) {
      verdict = 'MODERATE';
      badgeClass = 'text-amber-700 bg-amber-50 border-amber-300';
    }

    return {
      isValid: true,
      validationErrors: [],
      salesPriceKrw: salesPrice,
      cogs1688Cny: cogsCny,
      cogsKrw,
      exchangeRateCnyKrw: exchangeRate,
      commissionRate,
      coupangFeeKrw,
      shippingCostKrw,
      shippingBasis,
      buyingAgentFeeMode: effective.buyingAgentFeeMode,
      buyingAgentFeeKrw,
      buyingAgentFeeRate: effective.buyingAgentFeeRate,
      cgfFeeKrw,
      adCostKrw,
      hasAdCost,
      returnReserveKrw,
      returnAllowanceMode: effective.returnAllowanceMode,
      hasReturnAllowance,
      otherCostKrw,
      totalCostKrw,
      netProfitKrw,
      netMarginRatio,
      netMarginPct,
      preAdMarginKrw,
      preAdMarginRatio,
      preAdMarginPct,
      capitalInvested,
      roiPct,
      isComplete,
      missingCosts,
      verdict,
      badgeClass
    };
  }

  /**
   * Tính giá vốn trần 1688 (CNY) để đạt mục tiêu biên lợi nhuận
   */
  function calculateTargetMaxCny(salesPriceKrw, targetMarginRate = 0.30, weightGram = 300, customConfig = {}) {
    if (!salesPriceKrw || salesPriceKrw <= 0) return 0;
    const cfg = { ...DEFAULT_CONFIG, ...customConfig };

    let shippingCost = cfg.baseShippingCostKrw;
    if (customConfig.shippingCostKrw !== undefined && customConfig.shippingCostKrw !== null) {
      shippingCost = Number(customConfig.shippingCostKrw);
    } else if (weightGram > 500) {
      shippingCost += Math.ceil((weightGram - 500) / 500) * 1000;
    }

    const commissionRate = (customConfig.platformCommissionRate !== undefined && customConfig.platformCommissionRate !== null)
      ? Number(customConfig.platformCommissionRate)
      : (customConfig.coupangCommissionRate !== undefined && customConfig.coupangCommissionRate !== null ? Number(customConfig.coupangCommissionRate) : cfg.coupangCommissionRate);

    const exchangeRate = (customConfig.exchangeRateCnyKrw !== undefined && customConfig.exchangeRateCnyKrw !== null)
      ? Number(customConfig.exchangeRateCnyKrw)
      : cfg.exchangeRateCnyKrw;

    const adCost = Number(customConfig.adCostPerOrderKrw ?? customConfig.adCost ?? 0) || 0;

    let returnReserve = 0;
    const returnMode = customConfig.returnAllowanceMode || (customConfig.returnAllowanceKrw !== undefined && customConfig.returnAllowanceKrw !== null ? 'FIXED' : 'PERCENTAGE');
    if (returnMode === 'FIXED' && customConfig.returnAllowanceKrw !== undefined && customConfig.returnAllowanceKrw !== null) {
      returnReserve = Number(customConfig.returnAllowanceKrw);
    } else if (returnMode === 'PERCENTAGE' && customConfig.returnAllowanceRate !== undefined && customConfig.returnAllowanceRate !== null) {
      returnReserve = Math.round(salesPriceKrw * (Number(customConfig.returnAllowanceRate) / 100));
    }

    const otherCost = Number(customConfig.otherCostPerOrderKrw ?? 0) || 0;
    const cgfFee = (customConfig.fulfillmentModel === 'ROCKET_GROWTH' || customConfig.isCgf)
      ? (Number(customConfig.cgfStorageFeeKrw) || cfg.cgfStorageFeeKrw)
      : 0;

    const agentMode = customConfig.buyingAgentFeeMode || (Number(customConfig.buyingAgentFeeRate) > 0 ? 'PERCENTAGE' : 'FLAT');
    let fixedAgentFee = 0;
    let agentFeeRate = 0;
    if (agentMode === 'PERCENTAGE') {
      agentFeeRate = Number(customConfig.buyingAgentFeeRate ?? 0) || 0;
    } else {
      fixedAgentFee = Number(customConfig.buyingAgentFeeKrw ?? 0) || 0;
    }

    const coupangFeeKrw = Math.round(salesPriceKrw * commissionRate);
    const targetNetProfitKrw = salesPriceKrw * targetMarginRate;
    const totalNonCogsDeductions = coupangFeeKrw + targetNetProfitKrw + shippingCost + adCost + returnReserve + otherCost + cgfFee + fixedAgentFee;

    const remainingForCogsKrw = salesPriceKrw - totalNonCogsDeductions;
    if (remainingForCogsKrw <= 0) return 0;

    const allowedCogsKrw = remainingForCogsKrw / (1 + agentFeeRate);
    return Math.max(0, Math.floor(allowedCogsKrw / exchangeRate));
  }

  /**
   * Tính toán Unit Economics mở rộng & 3 kịch bản rủi ro (Rõ ràng dưới dạng GIẢ ĐỊNH)
   */
  function calculateUnitEconomics(params = {}) {
    const baseProfit = calculateProfit(params);
    const salesPrice = baseProfit.salesPriceKrw;
    const cogsKrw = baseProfit.cogsKrw;
    const coupangFeeKrw = baseProfit.coupangFeeKrw;
    const shippingCost = baseProfit.shippingCostKrw;
    const buyingAgentFeeKrw = baseProfit.buyingAgentFeeKrw;
    const otherCostKrw = baseProfit.otherCostKrw;
    const returnReserveKrw = baseProfit.returnReserveKrw;
    const cgfFeeKrw = baseProfit.cgfFeeKrw || 0;
    const preAdMarginKrw = baseProfit.preAdMarginKrw;
    const preAdMarginPct = baseProfit.preAdMarginPct;
    const totalVariableExAds = salesPrice - preAdMarginKrw;

    let breakevenRoasRatio = 0;
    let breakevenRoasPct = 0;
    if (preAdMarginKrw > 0 && salesPrice > 0) {
      breakevenRoasRatio = parseFloat((salesPrice / preAdMarginKrw).toFixed(2));
      breakevenRoasPct = Math.round(breakevenRoasRatio * 100);
    }

    const targetContributionPct = Number(params.targetContributionPct) || 15;
    const targetContributionKrw = Math.round(salesPrice * (targetContributionPct / 100));
    const maxAllowedCpaKrw = Math.max(0, preAdMarginKrw - targetContributionKrw);

    // Kịch bản (Assumptions)
    const favorableAdsKrw = Math.round(salesPrice * 0.10);
    const favorableReturnReserveKrw = Math.round(salesPrice * 0.01);
    const favorableMarginKrw = salesPrice - (coupangFeeKrw + cogsKrw + shippingCost + buyingAgentFeeKrw + cgfFeeKrw + otherCostKrw + favorableReturnReserveKrw + favorableAdsKrw);

    const baseAdsKrw = Math.round(salesPrice * 0.20);
    const baseReturnReserveKrw = Math.round(salesPrice * 0.03);
    const baseMarginKrw = salesPrice - (coupangFeeKrw + cogsKrw + shippingCost + buyingAgentFeeKrw + cgfFeeKrw + otherCostKrw + baseReturnReserveKrw + baseAdsKrw);

    const adverseAdsKrw = Math.round(salesPrice * 0.285);
    const adverseShippingCost = shippingCost + 1000;
    const adverseReturnReserveKrw = Math.round(salesPrice * 0.05);
    const adverseMarginKrw = salesPrice - (coupangFeeKrw + cogsKrw + adverseShippingCost + buyingAgentFeeKrw + cgfFeeKrw + otherCostKrw + adverseReturnReserveKrw + adverseAdsKrw);

    const scenarios = {
      isAssumption: true,
      favorable: {
        name: 'Thuận lợi',
        labelVi: 'Kịch bản Thuận Lợi (Giả định)',
        cpaKrw: favorableAdsKrw,
        roasPct: 1000,
        returnRatePct: 1,
        contributionKrw: favorableMarginKrw,
        contributionPct: salesPrice > 0 ? parseFloat(((favorableMarginKrw / salesPrice) * 100).toFixed(1)) : 0
      },
      base: {
        name: 'Cơ sở',
        labelVi: 'Kịch bản Cơ Sở (Giả định)',
        cpaKrw: baseAdsKrw,
        roasPct: 500,
        returnRatePct: 3,
        contributionKrw: baseMarginKrw,
        contributionPct: salesPrice > 0 ? parseFloat(((baseMarginKrw / salesPrice) * 100).toFixed(1)) : 0
      },
      adverse: {
        name: 'Bất lợi',
        labelVi: 'Kịch bản Bất Lợi (Giả định)',
        cpaKrw: adverseAdsKrw,
        roasPct: 350,
        returnRatePct: 5,
        contributionKrw: adverseMarginKrw,
        contributionPct: salesPrice > 0 ? parseFloat(((adverseMarginKrw / salesPrice) * 100).toFixed(1)) : 0
      }
    };

    // Vốn lưu động chu kỳ đối soát Coupang
    const ordersPerDay = Number(params.ordersPerDay) || 10;
    const settlementCycleDays = Number(params.settlementCycleDays) || 30;
    const capitalPerOrderKrw = cogsKrw + shippingCost + buyingAgentFeeKrw;
    const workingCapitalKrw = ordersPerDay * capitalPerOrderKrw * settlementCycleDays;
    const workingCapitalVnd = Math.round(workingCapitalKrw * DEFAULT_CONFIG.krwToVndRate);

    return {
      ...baseProfit,
      totalVariableExAds,
      preAdMarginKrw,
      preAdMarginPct,
      breakevenRoasRatio,
      breakevenRoasPct,
      targetContributionPct,
      targetContributionKrw,
      maxAllowedCpaKrw,
      scenarios,
      workingCapital: {
        ordersPerDay,
        capitalPerOrderKrw,
        settlementCycleDays,
        workingCapitalKrw,
        workingCapitalVnd,
        noteVi: `Cần chuẩn bị khoảng ${(workingCapitalKrw / 1000000).toFixed(1)} triệu KRW (~${(workingCapitalVnd / 1000000).toFixed(0)} triệu VND) tiền vốn xoay vòng cho ${ordersPerDay} đơn/ngày trong ${settlementCycleDays} ngày chờ Coupang thanh toán.`
      }
    };
  }

  return {
    DEFAULT_CONFIG,
    normalizeFinancialInputs,
    validateFinancialInputs,
    calculateShippingCost,
    calculateProfit,
    calculateTargetMaxCny,
    calculateUnitEconomics
  };
});
