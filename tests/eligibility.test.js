const test = require('node:test');
const assert = require('node:assert');
const winAlg = require('../core/winAlgorithm.js');
const feeCalc = require('../core/feeCalculator.js');
const storage = require('../storage/storageRepository.js');

/**
 * Tạo một sản phẩm mẫu có đầy đủ toàn bộ bằng chứng theo hợp đồng hồ sơ thẩm định
 */
function createPassingDossierProduct(overrides = {}) {
  const base = {
    productId: 'passing_prod_001',
    titleKr: '바디홈 차량용 자석타입 암막커튼 4P',
    salesPriceKrw: 110000,
    cogs1688Cny: 150,
    isRocket: false,
    rocketType: 'NONE',
    rank: 15,
    economics: {
      targetSalesPriceKrw: 110000,
      exchangeRateCnyKrw: 190,
      platformCommissionRate: 0.11,
      buyingAgentFeeRate: 0,
      otherCostPerOrderKrw: 0,
      weightGram: 300,
      shippingBasis: 'REVIEWED_WEIGHT',
      adCostPerOrderKrw: 10000,
      returnAllowanceRate: 3,
      fulfillmentModel: 'BUYING_PER_ORDER'
    },
    kcSafety: {
      level: 'LOW',
      isRestricted: false,
      reason: 'Sản phẩm vải gia dụng thông thường'
    },
    sourcingDossier: {
      cogs1688Cny: 150,
      unitPriceCny: 150,
      supplierUrl: 'https://detail.1688.com/offer/789.html',
      quoteDate: '2026-10-01',
      variant: 'Bộ 4 món nam châm',
      quantity: 50,
      moq: 10,
      isVerified: true,
      provenance: 'EVIDENCE',
      verifiedAt: '2026-10-01T12:00:00.000Z'
    },
    evidenceDossier: {
      demand: {
        keyword: '차량용 암막커튼',
        geography: 'KR',
        period: '2025-01 ~ 2025-12',
        source: 'Naver DataLab',
        unit: 'SEARCHES',
        peakMonthlySearches: 18000,
        seasonalityReviewed: true,
        seasonalityFinding: 'Nhu cầu cao điểm từ tháng 5 đến tháng 8 khi hè đến',
        seasonalityNotes: 'Nhu cầu cao điểm từ tháng 5 đến tháng 8 khi hè đến'
      },
      rocketCompetition: {
        sampleSize: 60,
        rocketCount: 18, // 30% < 70%
        keywordOrCategory: '차량용 암막커튼',
        inspectedAt: '2026-10-01T12:00:00.000Z'
      },
      sellerEvidence: {
        offerUrl: 'https://www.coupang.com/vp/products/12345678',
        comparableOfferUrl: 'https://www.coupang.com/vp/products/12345678',
        sellerId: 'A00123456',
        sellerReviewCount: 50,
        isInternationalDelivery: true,
        inspectedAt: '2026-10-01T12:00:00.000Z'
      },
      priceReview: {
        isReviewed: true,
        justification: 'Giá 110,000 KRW đảm bảo biên lợi nhuận trên 30% và cạnh tranh với thị trường',
        reviewedAt: '2026-10-01T12:00:00.000Z'
      },
      kcReview: {
        reviewStatus: 'EXEMPT_CONFIRMED',
        source: 'KC SafetyKorea Tra Cứu Danh Mục Miễn Trừ 2026',
        reference: 'Quy chuẩn an toàn dệt may gia dụng điều 3',
        reviewDate: '2026-10-01',
        rationale: 'Sản phẩm rèm vải không chứa linh kiện điện tử, thuộc diện miễn chứng nhận hợp quy',
        notes: 'Sản phẩm rèm vải không chứa linh kiện điện tử, thuộc diện miễn chứng nhận hợp quy',
        reviewedAt: '2026-10-01T12:00:00.000Z'
      },
      fulfillment: {
        shippingBasis: 'REVIEWED_WEIGHT',
        shippingBasisSource: 'Cân thực tế mẫu 300g, đối chiếu biểu phí vận chuyển CJ logistics',
        deliveryEstimate: '5-7 ngày làm việc từ kho Weihai về Seoul',
        returnArrangement: 'Đầu mối kho trả hàng Incheon tiếp nhận kiểm tra'
      }
    }
  };

  const enriched = storage.enrichProduct(base);

  // Áp dụng overrides sâu
  if (overrides.titleKr) enriched.titleKr = overrides.titleKr;
  if (overrides.salesPriceKrw !== undefined) enriched.salesPriceKrw = overrides.salesPriceKrw;
  if (overrides.cogs1688Cny !== undefined) enriched.cogs1688Cny = overrides.cogs1688Cny;
  if (overrides.rank !== undefined) {
    enriched.rank = overrides.rank;
    if (!enriched.marketData) enriched.marketData = {};
    enriched.marketData.rank = overrides.rank;
  }
  if (overrides.marketData) enriched.marketData = { ...enriched.marketData, ...overrides.marketData };
  if (overrides.kcSafety) enriched.kcSafety = { ...enriched.kcSafety, ...overrides.kcSafety };
  if (overrides.economics) enriched.economics = { ...enriched.economics, ...overrides.economics };
  if (overrides.sourcingDossier) enriched.sourcingDossier = { ...enriched.sourcingDossier, ...overrides.sourcingDossier };
  if (overrides.financial) enriched.financial = { ...enriched.financial, ...overrides.financial };
  if (overrides.evidenceDossier) {
    if (overrides.evidenceDossier.demand) enriched.evidenceDossier.demand = { ...enriched.evidenceDossier.demand, ...overrides.evidenceDossier.demand };
    if (overrides.evidenceDossier.rocketCompetition) enriched.evidenceDossier.rocketCompetition = { ...enriched.evidenceDossier.rocketCompetition, ...overrides.evidenceDossier.rocketCompetition };
    if (overrides.evidenceDossier.sellerEvidence) enriched.evidenceDossier.sellerEvidence = { ...enriched.evidenceDossier.sellerEvidence, ...overrides.evidenceDossier.sellerEvidence };
    if (overrides.evidenceDossier.priceReview) enriched.evidenceDossier.priceReview = { ...enriched.evidenceDossier.priceReview, ...overrides.evidenceDossier.priceReview };
    if (overrides.evidenceDossier.kcReview !== undefined) enriched.evidenceDossier.kcReview = overrides.evidenceDossier.kcReview;
    if (overrides.evidenceDossier.fulfillment) enriched.evidenceDossier.fulfillment = { ...enriched.evidenceDossier.fulfillment, ...overrides.evidenceDossier.fulfillment };
  }

  return enriched;
}

test('Eligibility: complete passing dossier is ready_for_trial', () => {
  const passingProduct = createPassingDossierProduct();
  const assessment = winAlg.evaluateTrialEligibility(passingProduct);

  assert.strictEqual(assessment.status, 'ready_for_trial', 'Hồ sơ đầy đủ mọi chứng cứ phải đạt ready_for_trial');
  assert.strictEqual(assessment.blockingReasons.length, 0, 'Không có lý do chặn');
  assert.strictEqual(assessment.pendingActions.length, 0, 'Không có hành động chờ');
  assert.strictEqual(assessment.criteria.length, 8, 'Phải đánh giá đầy đủ 8 tiêu chí');
  assert.ok(assessment.criteria.every(c => c.status === 'PASS'), 'Tất cả 8 tiêu chí đều phải PASS');
});

test('Eligibility: individual missing fields strictly keep dossier in needs_verification', () => {
  const checkPending = (fieldModifier, expectedCriterionId) => {
    const candidate = createPassingDossierProduct();
    fieldModifier(candidate);
    const assessment = winAlg.evaluateTrialEligibility(candidate);
    assert.strictEqual(assessment.status, 'needs_verification', `Thiếu trường phải là needs_verification (${expectedCriterionId})`);
    assert.strictEqual(assessment.blockingReasons.length, 0, 'Thiếu thông tin không phải là fail vĩnh viễn (không có blocking reason)');
    const crit = assessment.criteria.find(c => c.id === expectedCriterionId);
    assert.ok(['REVIEW_REQUIRED', 'UNKNOWN'].includes(crit.status), `Tiêu chí ${expectedCriterionId} phải là REVIEW_REQUIRED hoặc UNKNOWN, thực tế: ${crit.status}`);
  };

  // 1. Demand evidence fields
  checkPending(p => { delete p.evidenceDossier.demand.keyword; }, 'demand_searches');
  checkPending(p => { delete p.evidenceDossier.demand.geography; }, 'demand_searches');
  checkPending(p => { delete p.evidenceDossier.demand.period; }, 'demand_searches');
  checkPending(p => { delete p.evidenceDossier.demand.source; }, 'demand_searches');
  checkPending(p => { delete p.evidenceDossier.demand.unit; }, 'demand_searches');
  checkPending(p => { delete p.evidenceDossier.demand.seasonalityFinding; delete p.evidenceDossier.demand.seasonalityNotes; }, 'demand_searches');

  // 2. Rocket evidence fields
  checkPending(p => { delete p.evidenceDossier.rocketCompetition.keywordOrCategory; }, 'rocket_share');
  checkPending(p => { delete p.evidenceDossier.rocketCompetition.inspectedAt; }, 'rocket_share');

  // 3. Seller evidence fields
  checkPending(p => { delete p.evidenceDossier.sellerEvidence.offerUrl; delete p.evidenceDossier.sellerEvidence.comparableOfferUrl; }, 'seller_reviews');
  checkPending(p => { delete p.evidenceDossier.sellerEvidence.sellerId; }, 'seller_reviews');
  checkPending(p => { delete p.evidenceDossier.sellerEvidence.inspectedAt; }, 'seller_reviews');
  checkPending(p => { p.evidenceDossier.sellerEvidence.isInternationalDelivery = false; }, 'seller_reviews');

  // 4. Sourcing quote fields
  checkPending(p => { p.sourcingDossier.isVerified = false; }, 'sourcing_quote');
  checkPending(p => { p.sourcingDossier.quantity = 5; p.sourcingDossier.moq = 10; delete p.sourcingDossier.moqApplicabilityNotes; }, 'sourcing_quote');
  checkPending(p => { delete p.sourcingDossier.quoteDate; delete p.sourcingDossier.verifiedAt; }, 'sourcing_quote');
  checkPending(p => { delete p.sourcingDossier.variant; }, 'sourcing_quote');

  // 5. Fulfillment readiness fields
  checkPending(p => { delete p.evidenceDossier.fulfillment.shippingBasis; delete p.economics.shippingBasis; }, 'fulfillment_readiness');
  checkPending(p => { delete p.evidenceDossier.fulfillment.deliveryEstimate; }, 'fulfillment_readiness');
  checkPending(p => { delete p.evidenceDossier.fulfillment.returnArrangement; }, 'fulfillment_readiness');

  // 6. KC safety review fields (R01: LOW risk without review remains pending)
  checkPending(p => { p.evidenceDossier.kcReview = {}; }, 'kc_certification');
  checkPending(p => { p.evidenceDossier.kcReview = { reviewStatus: 'PENDING' }; }, 'kc_certification');
  checkPending(p => { delete p.evidenceDossier.kcReview.source; delete p.evidenceDossier.kcReview.reference; }, 'kc_certification');
  checkPending(p => { delete p.evidenceDossier.kcReview.reviewDate; delete p.evidenceDossier.kcReview.reviewedAt; }, 'kc_certification');
  checkPending(p => { delete p.evidenceDossier.kcReview.rationale; delete p.evidenceDossier.kcReview.notes; }, 'kc_certification');
});

test('Eligibility: high-risk KC case (85-point WPI) cannot be ready for trial without KC review', () => {
  const product = createPassingDossierProduct({
    titleKr: '샤오미 충전식 무선 미니 청소기 220v', // Từ khóa HIGH KC
    kcSafety: { level: 'HIGH', isRestricted: true, reason: 'Chứa pin sạc và điện áp 220v' },
    evidenceDossier: {
      kcReview: {} // Chưa có review giải tỏa
    }
  });

  const assessment = winAlg.evaluateTrialEligibility(product);
  assert.notStrictEqual(assessment.status, 'ready_for_trial', 'Không được phép là ready_for_trial');
  assert.strictEqual(assessment.status, 'needs_verification', 'Phải ở trạng thái needs_verification');
  const kcCriterion = assessment.criteria.find(c => c.id === 'kc_certification');
  assert.strictEqual(kcCriterion.status, 'REVIEW_REQUIRED');
});

test('Eligibility: negative margin product is strictly not_eligible', () => {
  const product = createPassingDossierProduct({
    salesPriceKrw: 15000,
    cogs1688Cny: 60, // 60 * 190 = 11,400 KRW
    economics: {
      targetSalesPriceKrw: 15000,
      exchangeRateCnyKrw: 190,
      adCostPerOrderKrw: 2000,
      shippingCostKrw: 3000,
      returnAllowanceRate: 3
    },
    financial: {
      netProfitKrw: -3500,
      netMarginPct: -23.3,
      isComplete: true
    }
  });

  const assessment = winAlg.evaluateTrialEligibility(product);
  assert.strictEqual(assessment.status, 'not_eligible', 'Sản phẩm lỗ phải có trạng thái not_eligible');
  const marginCriterion = assessment.criteria.find(c => c.id === 'net_margin');
  assert.strictEqual(marginCriterion.status, 'FAIL');
  assert.ok(assessment.blockingReasons.length > 0);
});

test('Profile boundaries: exact boundary conditions tested rigorously', () => {
  // 1. Demand volume: 10,000 passes, 9,999 fails
  const c10k = createPassingDossierProduct({ evidenceDossier: { demand: { peakMonthlySearches: 10000 } } });
  assert.strictEqual(winAlg.evaluateTrialEligibility(c10k).criteria.find(c => c.id === 'demand_searches').status, 'PASS', '10,000 searches passes');

  const c9999 = createPassingDossierProduct({ evidenceDossier: { demand: { peakMonthlySearches: 9999 } } });
  const a9999 = winAlg.evaluateTrialEligibility(c9999);
  assert.strictEqual(a9999.criteria.find(c => c.id === 'demand_searches').status, 'FAIL', '9,999 searches fails');
  assert.strictEqual(a9999.status, 'not_eligible');

  // 2. Rocket share: < 70% passes (69.96%), 70% fails
  // 69.96% passes: 6,996 / 10,000
  const c6996 = createPassingDossierProduct({ evidenceDossier: { rocketCompetition: { sampleSize: 10000, rocketCount: 6996 } } });
  assert.strictEqual(winAlg.evaluateTrialEligibility(c6996).criteria.find(c => c.id === 'rocket_share').status, 'PASS', '69.96% passes');

  // 70.00% fails: 7,000 / 10,000
  const c7000 = createPassingDossierProduct({ evidenceDossier: { rocketCompetition: { sampleSize: 10000, rocketCount: 7000 } } });
  const a7000 = winAlg.evaluateTrialEligibility(c7000);
  assert.strictEqual(a7000.criteria.find(c => c.id === 'rocket_share').status, 'FAIL', '70.00% fails');
  assert.strictEqual(a7000.status, 'not_eligible');

  // Rocket invalid samples: count > sampleSize hoặc âm -> UNKNOWN / needs_verification
  const cInvalidRocket1 = createPassingDossierProduct({ evidenceDossier: { rocketCompetition: { sampleSize: 50, rocketCount: 51 } } });
  assert.strictEqual(winAlg.evaluateTrialEligibility(cInvalidRocket1).criteria.find(c => c.id === 'rocket_share').status, 'UNKNOWN');
  assert.strictEqual(winAlg.evaluateTrialEligibility(cInvalidRocket1).status, 'needs_verification');

  const cInvalidRocket2 = createPassingDossierProduct({ evidenceDossier: { rocketCompetition: { sampleSize: 50, rocketCount: -5 } } });
  assert.strictEqual(winAlg.evaluateTrialEligibility(cInvalidRocket2).criteria.find(c => c.id === 'rocket_share').status, 'UNKNOWN');

  // 3. Seller reviews: 30 passes, 29 fails
  const c30 = createPassingDossierProduct({ evidenceDossier: { sellerEvidence: { sellerReviewCount: 30 } } });
  assert.strictEqual(winAlg.evaluateTrialEligibility(c30).criteria.find(c => c.id === 'seller_reviews').status, 'PASS', '30 seller reviews passes');

  const c29 = createPassingDossierProduct({ evidenceDossier: { sellerEvidence: { sellerReviewCount: 29 } } });
  const a29 = winAlg.evaluateTrialEligibility(c29);
  assert.strictEqual(a29.criteria.find(c => c.id === 'seller_reviews').status, 'FAIL', '29 seller reviews fails');
  assert.strictEqual(a29.status, 'not_eligible');

  // Review sản phẩm nội địa không được thay thế review seller quốc tế
  const cDomesticOnly = createPassingDossierProduct({
    reviewCount: 500,
    evidenceDossier: { sellerEvidence: { sellerReviewCount: 50, isInternationalDelivery: false } }
  });
  assert.strictEqual(winAlg.evaluateTrialEligibility(cDomesticOnly).criteria.find(c => c.id === 'seller_reviews').status, 'REVIEW_REQUIRED');

  // 4. Target price: >= 100k passes; 50k-100k requires review; < 50k fails
  const c100k = createPassingDossierProduct({ economics: { targetSalesPriceKrw: 100000 } });
  assert.strictEqual(winAlg.evaluateTrialEligibility(c100k).criteria.find(c => c.id === 'sales_price').status, 'PASS');

  const c50kJustified = createPassingDossierProduct({
    salesPriceKrw: 60000,
    cogs1688Cny: 20,
    economics: { targetSalesPriceKrw: 60000, adCostPerOrderKrw: 1000 },
    sourcingDossier: { cogs1688Cny: 20, unitPriceCny: 20 },
    evidenceDossier: { priceReview: { isReviewed: true, justification: 'Cạnh tranh tốt' } }
  });
  assert.strictEqual(winAlg.evaluateTrialEligibility(c50kJustified).criteria.find(c => c.id === 'sales_price').status, 'PASS');

  const c50kNoReview = createPassingDossierProduct({
    salesPriceKrw: 60000,
    cogs1688Cny: 20,
    economics: { targetSalesPriceKrw: 60000, adCostPerOrderKrw: 1000 },
    sourcingDossier: { cogs1688Cny: 20, unitPriceCny: 20 },
    evidenceDossier: { priceReview: { isReviewed: false, justification: null } }
  });
  assert.strictEqual(winAlg.evaluateTrialEligibility(c50kNoReview).criteria.find(c => c.id === 'sales_price').status, 'REVIEW_REQUIRED');
  assert.strictEqual(winAlg.evaluateTrialEligibility(c50kNoReview).status, 'needs_verification');

  const c49k = createPassingDossierProduct({ economics: { targetSalesPriceKrw: 49999 } });
  assert.strictEqual(winAlg.evaluateTrialEligibility(c49k).criteria.find(c => c.id === 'sales_price').status, 'FAIL');
  assert.strictEqual(winAlg.evaluateTrialEligibility(c49k).status, 'not_eligible');

  // 5. Margin: 25.00% passes; unrounded 24.96% strictly fails
  // Net profit 25,000 / 100,000 = 0.25 (25.00%)
  const cMargin25 = createPassingDossierProduct({
    salesPriceKrw: 100000,
    economics: { targetSalesPriceKrw: 100000 },
    financial: { netMarginPct: 25.0, netProfitKrw: 25000, isComplete: true, netMarginRatio: 0.25 }
  });
  assert.strictEqual(winAlg.evaluateTrialEligibility(cMargin25).criteria.find(c => c.id === 'net_margin').status, 'PASS');

  // Net profit 24,960 / 100,000 = 0.2496 (24.96%) -> Even if rounded to 25.0% in display, must strictly FAIL
  const cMargin24_96 = createPassingDossierProduct({
    salesPriceKrw: 100000,
    economics: { targetSalesPriceKrw: 100000 },
    financial: { netMarginPct: 25.0, netProfitKrw: 24960, isComplete: true, netMarginRatio: 0.2496 }
  });
  const aMargin24_96 = winAlg.evaluateTrialEligibility(cMargin24_96);
  assert.strictEqual(aMargin24_96.criteria.find(c => c.id === 'net_margin').status, 'FAIL', '24.96% margin strictly fails');
  assert.strictEqual(aMargin24_96.status, 'not_eligible');
});

test('WPI: incomplete inputs do not report complete total score', () => {
  // Sản phẩm thiếu thứ hạng BSR rank
  const incompleteProduct = createPassingDossierProduct({
    rank: null,
    marketData: { rank: null, listingPosition: 3 } // listingPosition không được thay thế BSR rank
  });

  const wpi = winAlg.calculateWinningProductIndex(incompleteProduct);
  assert.strictEqual(wpi.isComplete, false, 'WPI phải được đánh dấu chưa hoàn chỉnh');
  assert.strictEqual(wpi.score, null, 'Không được hiển thị tổng điểm hoàn chỉnh khi thiếu thành phần');
  assert.strictEqual(wpi.tier, 'INCOMPLETE', 'Tier phải là INCOMPLETE');
  assert.ok(wpi.missingComponents.includes('demand'), 'Phải báo thiếu thành phần demand');
});
