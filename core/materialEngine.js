/**
 * MATERIAL & SPECIFICATION INTELLIGENCE ENGINE
 * Chạy 100% Client-side trong Chrome Extension & Service Worker
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KDropMaterialEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {

  const MATERIAL_DICTIONARY = [
    { regex: /자석|마그네틱/i, code: 'magnetic', category: 'mechanism', labelVi: 'Nam châm từ tính', labelCn: '磁吸式', priority: 10 },
    { regex: /흡착|뽁뽁이/i, code: 'suction_cup', category: 'mechanism', labelVi: 'Giác hút chân không', labelCn: '吸盘式', priority: 5 },
    { regex: /클립|고정핀/i, code: 'clip', category: 'mechanism', labelVi: 'Kẹp cài cố định', labelCn: '卡扣式', priority: 5 },
    { regex: /암막|차광|은박|코팅/i, code: 'blackout_uv', category: 'fabric', labelVi: 'Phủ bạc cản sáng UV', labelCn: '全遮光 涂银', priority: 9 },
    { regex: /메쉬|망사|통풍/i, code: 'mesh', category: 'fabric', labelVi: 'Lưới tổ ong thoáng khí', labelCn: '透气网纱', priority: 8 },
    { regex: /옥스포드|방수/i, code: 'oxford_waterproof', category: 'fabric', labelVi: 'Vải Oxford chống nước', labelCn: '牛津布 防水', priority: 7 },
    { regex: /가죽|인조가죽/i, code: 'leather', category: 'fabric', labelVi: 'Da nhân tạo', labelCn: '皮革', priority: 7 },
    { regex: /실리콘|tpu/i, code: 'tpu_silicone', category: 'rigid', labelVi: 'Nhựa dẻo TPU / Silicon', labelCn: 'TPU 硅胶', priority: 8 },
    { regex: /카본|탄소/i, code: 'carbon_fiber', category: 'rigid', labelVi: 'Sợi Carbon chống xước', labelCn: '碳纤维 防刮', priority: 8 },
    { regex: /알루미늄/i, code: 'aluminum', category: 'rigid', labelVi: 'Hợp kim nhôm', labelCn: '铝合金 铝箔', priority: 7 },
    { regex: /메모리폼|스펀지|쿠션/i, code: 'memory_foam', category: 'padding', labelVi: 'Đệm mút đàn hồi', labelCn: '记忆棉 减震', priority: 6 }
  ];

  const SPEC_DICTIONARY = [
    { regex: /(?<!\d)(?:4p|4개|풀세트|전좌석)(?!\d)/i, code: '4_pieces', labelVi: 'Bộ 4 món (Full xe)', labelCn: '4件套 全车' },
    { regex: /(?<!\d)(?:2p|2개|1쌍|한쌍|1세트)(?!\d)/i, code: '2_pieces', labelVi: 'Bộ 2 món (Cặp)', labelCn: '2件套 一对' },
    { regex: /(?<!\d)(?:1p|1개|단품)(?!\d)/i, code: '1_piece', labelVi: 'Bộ 1 món (Đơn)', labelCn: '单件' }
  ];

  const POSITION_DICTIONARY = [
    { regex: /앞좌석|1열|앞문/i, code: 'front_row', labelVi: 'Cửa trước', labelCn: '前排' },
    { regex: /뒷좌석|2열|뒷문|후면/i, code: 'rear_row', labelVi: 'Cửa sau', labelCn: '后排' },
    { regex: /앞유리|전면|성에방지/i, code: 'windshield', labelVi: 'Kính lái trước', labelCn: '前挡风' }
  ];

  const USP_DICTIONARY = [
    { regex: /자외선|uv/i, code: 'uv_protection', labelVi: 'Chống tia UV', labelCn: '防紫外线' },
    { regex: /성에방지|동초/i, code: 'anti_frost', labelVi: 'Chống đông sương tuyết', labelCn: '防冻 防霜' },
    { regex: /접이식|폴딩/i, code: 'foldable', labelVi: 'Gấp gọn tiện lợi', labelCn: '折叠式' },
    { regex: /사생활|프라이버시/i, code: 'privacy', labelVi: 'Bảo vệ riêng tư', labelCn: '防窥 隐私' }
  ];

  const CATEGORY_MAP = [
    { regex: /책장|수납선반|수납함|선반|서랍|정리함|수납/i, cn: '收纳 置物架' },
    { regex: /햇빛가리개|선셰이드/i, cn: '遮阳帘', autoCn: '汽车 遮阳帘' },
    { regex: /커튼|블라인드/i, cn: '窗帘', autoCn: '汽车 遮阳帘' },
    { regex: /보호대|가드|무릎/i, cn: '护具', autoCn: '骑行 护具' },
    { regex: /시트지|랩핑|보호필름/i, cn: '保护膜 贴纸', autoCn: '汽车 保护膜 碳纤维贴纸' },
    { regex: /키케이스|키커버/i, cn: '钥匙套', autoCn: '汽车 钥匙套' },
    { regex: /커버|덮개/i, cn: '防尘罩', autoCn: '汽车 前挡遮雪挡' },
    { regex: /성에방지/i, cn: '防冻 防雪挡', autoCn: '汽车 前挡遮雪挡' },
    { regex: /거치대|홀더/i, cn: '支架', autoCn: '车载 手机支架' }
  ];

  function extractMaterialIntelligence(titleKr = '') {
    const title = String(titleKr || '').trim();

    const matchedMaterials = [];
    MATERIAL_DICTIONARY.forEach(item => {
      if (item.regex.test(title)) {
        matchedMaterials.push(item);
      }
    });
    matchedMaterials.sort((a, b) => b.priority - a.priority);

    let matchedSpec = null;
    for (const item of SPEC_DICTIONARY) {
      if (item.regex.test(title)) {
        matchedSpec = item;
        break;
      }
    }

    const matchedPositions = [];
    POSITION_DICTIONARY.forEach(item => {
      if (item.regex.test(title)) {
        matchedPositions.push(item);
      }
    });

    const matchedUsps = [];
    USP_DICTIONARY.forEach(item => {
      if (item.regex.test(title)) {
        matchedUsps.push(item);
      }
    });

    const isAuto = /차량|자동차|차 안|전좌석|카악세사리|카시트|트렁크|핸들/i.test(title);
    let categoryCn = isAuto ? '车载用品' : '家居用品';
    for (const cat of CATEGORY_MAP) {
      if (cat.regex.test(title)) {
        categoryCn = isAuto && cat.autoCn ? cat.autoCn : cat.cn;
        break;
      }
    }

    const keywordsSet = new Set();
    if (matchedMaterials.length > 0) {
      matchedMaterials.slice(0, 2).forEach(m => keywordsSet.add(m.labelCn));
    }
    keywordsSet.add(categoryCn);

    if (matchedSpec) {
      keywordsSet.add(matchedSpec.labelCn);
    }

    if (matchedPositions.length > 0) {
      keywordsSet.add(matchedPositions[0].labelCn);
    } else if (matchedUsps.length > 0) {
      keywordsSet.add(matchedUsps[0].labelCn);
    }

    const precisionQueryCn = Array.from(keywordsSet).join(' ');
    const searchUrl1688 = `https://s.1688.com/selloffer/offer_search.htm?keywords=${encodeURIComponent(precisionQueryCn)}&spm=a260k.dacugarlin.search.0`;

    const highlightBadges = [];
    matchedMaterials.forEach(m => highlightBadges.push({ label: m.labelVi, type: 'material', code: m.code }));
    if (matchedSpec) highlightBadges.push({ label: matchedSpec.labelVi, type: 'spec', code: matchedSpec.code });
    matchedPositions.forEach(p => highlightBadges.push({ label: p.labelVi, type: 'position', code: p.code }));
    matchedUsps.forEach(u => highlightBadges.push({ label: u.labelVi, type: 'usp', code: u.code }));

    return {
      materials: matchedMaterials.map(m => ({ code: m.code, labelVi: m.labelVi, labelCn: m.labelCn, category: m.category })),
      spec: matchedSpec ? { code: matchedSpec.code, labelVi: matchedSpec.labelVi, labelCn: matchedSpec.labelCn } : null,
      positions: matchedPositions.map(p => ({ code: p.code, labelVi: p.labelVi, labelCn: p.labelCn })),
      usps: matchedUsps.map(u => ({ code: u.code, labelVi: u.labelVi, labelCn: u.labelCn })),
      primaryMaterialVi: matchedMaterials[0] ? matchedMaterials[0].labelVi : 'Vật liệu tiêu chuẩn',
      primaryMaterialCn: matchedMaterials[0] ? matchedMaterials[0].labelCn : '',
      precisionQueryCn,
      searchUrl1688,
      highlightBadges
    };
  }

  return {
    MATERIAL_DICTIONARY,
    SPEC_DICTIONARY,
    POSITION_DICTIONARY,
    USP_DICTIONARY,
    extractMaterialIntelligence
  };
});
