/**
 * Module kiểm tra và đánh giá rủi ro chứng nhận an toàn KC (Korea Certification)
 * Chạy 100% Client-side trong Chrome Extension & Service Worker & Node.js
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KDropKcRules = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {

  const HIGH_RISK_KEYWORDS = [
    '전기', '220v', '충전식', '리튬', '배터리', '무선', '블루투스', // Thiết bị điện, pin sạc, bluetooth
    '어린이', '유아', '아동', '장난감', '완구',                    // Đồ chơi, trẻ em dưới 13 tuổi
    '화장품', '스킨', '로션', '세럼', '크림',                      // Mỹ phẩm
    '식품', '건강기능식품', '영양제', '비타민'                     // Thực phẩm chức năng
  ];

  const MEDIUM_RISK_KEYWORDS = [
    '식기', '수저', '텀블러', '머그컵', '물병', '조리도구'          // Tiếp xúc trực tiếp với thực phẩm/miệng (cần kiểm dịch)
  ];

  const LOW_RISK_KEYWORDS = [
    '수납', '정리함', '걸이', '선반', '박스', '케이스',             // Hộp đựng, kệ sắp xếp
    '커튼', '가리개', '모기장', '방충망', '시트', '매트',           // Rèm cửa, lưới chống muỗi, thảm
    '쿠션', '베개', '가방', '파우치', '모자', '양말',              // Vải, túi, phụ kiện thời trang
    '청소', '밀대', '솔', '수세미', '걸레',                        // Dụng cụ vệ sinh thủ công
    '반려견', '반려묘', '하네스', '리드줄', '방석'                 // Thú cưng không dùng điện
  ];

  function evaluateKcRisk(titleKr = '') {
    const title = String(titleKr).toLowerCase();

    for (const kw of HIGH_RISK_KEYWORDS) {
      if (title.includes(kw)) {
        return {
          level: 'HIGH',
          matchedKeyword: kw,
          labelVi: 'Rủi ro cao (Bắt buộc KC)',
          reason: `Chứa từ khóa nhạy cảm: "${kw}" (thiết bị điện, pin, đồ trẻ em hoặc hóa mỹ phẩm). Cần có chứng chỉ KC hoặc giấy phép miễn trừ hợp lệ.`,
          color: 'text-red-700 bg-red-100 border-red-300'
        };
      }
    }

    for (const kw of MEDIUM_RISK_KEYWORDS) {
      if (title.includes(kw)) {
        return {
          level: 'MEDIUM',
          matchedKeyword: kw,
          labelVi: 'Cần lưu ý (Kiểm dịch thực phẩm)',
          reason: `Chứa từ khóa: "${kw}". Mặt hàng tiếp xúc trực tiếp thực phẩm có thể cần kiểm định vệ sinh an toàn thực phẩm.`,
          color: 'text-amber-700 bg-amber-100 border-amber-300'
        };
      }
    }

    return {
      level: 'LOW',
      matchedKeyword: null,
      labelVi: 'Tín hiệu an toàn (Gia dụng thông thường)',
      reason: 'Sản phẩm gia dụng, vải sợi, nhựa hoặc cơ học thủ công thông thường. Miễn trừ kiểm định KC theo danh mục thông quan.',
      color: 'text-emerald-700 bg-emerald-100 border-emerald-300'
    };
  }

  function evaluateKcReadiness(riskSignal = {}, kcReview = null) {
    const level = riskSignal.level || 'LOW';

    if (kcReview && typeof kcReview === 'object') {
      const status = kcReview.reviewStatus;
      const source = (kcReview.source || kcReview.reference || '').trim();
      const reviewDate = (kcReview.reviewDate || kcReview.reviewedAt || '').trim();
      const rationale = (kcReview.rationale || kcReview.notes || '').trim();

      if (status === 'INELIGIBLE') {
        return {
          isResolved: true,
          status: 'FAIL',
          reason: rationale || 'Xác nhận không đạt chuẩn an toàn KC / bị cấm bán'
        };
      }

      const isPassStatus = ['EXEMPT', 'EXEMPT_CONFIRMED', 'CERTIFIED', 'DOCUMENTED_CERTIFICATE', 'REVIEWED_SAFE'].includes(status);
      if (isPassStatus) {
        if (!source || !reviewDate || !rationale) {
          return {
            isResolved: false,
            status: 'REVIEW_REQUIRED',
            reason: 'Đã chọn trạng thái thẩm định nhưng còn thiếu nguồn tham chiếu, ngày thẩm định hoặc lý do giải trình.'
          };
        }
        return {
          isResolved: true,
          status: 'PASS',
          reason: rationale
        };
      }
    }

    // Nếu chưa có review hợp lệ đầy đủ
    if (level === 'HIGH') {
      return {
        isResolved: false,
        status: 'REVIEW_REQUIRED',
        reason: `Rủi ro KC cao (${riskSignal.matchedKeyword || 'từ khóa nhạy cảm'}). Bắt buộc người vận hành thẩm định và lưu bằng chứng trước khi thử bán.`
      };
    }

    if (level === 'MEDIUM') {
      return {
        isResolved: false,
        status: 'REVIEW_REQUIRED',
        reason: `Mặt hàng có nguy cơ kiểm dịch thực phẩm (${riskSignal.matchedKeyword || ''}). Cần kiểm tra quy chuẩn và lưu bằng chứng thẩm định.`
      };
    }

    return {
      isResolved: false,
      status: 'REVIEW_REQUIRED',
      reason: 'Tín hiệu từ khóa rủi ro thấp nhưng chưa có thẩm định ghi nhận từ người vận hành (yêu cầu nguồn tham chiếu, ngày và giải trình).'
    };
  }

  return {
    HIGH_RISK_KEYWORDS,
    MEDIUM_RISK_KEYWORDS,
    LOW_RISK_KEYWORDS,
    evaluateKcRisk,
    evaluateKcReadiness
  };
});
