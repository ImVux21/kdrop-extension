/**
 * K-DROP EXTENSION DASHBOARD CONTROLLER (VERSION 2)
 * Hoạt động 100% Client-side trong môi trường Chrome Extension MV3
 * Tuân thủ CSP nghiêm ngặt: không dùng inline event handler
 */

let allProducts = [];
let availableMaterials = new Set();
let selectedProduct = null;
let currentSimulatorProduct = null;
let filteredProducts = [];
const pagination = { page: 1, pageSize: 20 };

const currentFilters = {
  search: '',
  niche: 'all',
  sort: 'wpi_desc',
  elig: 'ALL',
  buybox: 'ALL',
  tier: 'ALL',
  price: 'ALL',
  kcSafeOnly: false,
  material: 'ALL'
};

function initIcons() {
  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '#';
  const trimmed = url.trim();
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return escapeHtml(trimmed);
  }
  return '#';
}

// 1. TẢI DỮ LIỆU TỪ CHROME.STORAGE.LOCAL
async function loadData() {
  try {
    if (!window.KDropStorage) {
      console.error('KDropStorage chưa sẵn sàng!');
      return;
    }

    allProducts = await window.KDropStorage.getAllProducts();
    const stats = await window.KDropStorage.getStats();

    updateHeaderStats(stats);
    extractMaterialTags();
    renderNicheOptions();
    applyFilters(false);
    renderWatchlist();
    if (selectedProduct) {
      const refreshed = allProducts.find(p => String(p.id) === String(selectedProduct.id) || String(p.productId) === String(selectedProduct.productId));
      if (refreshed) {
        inspectProduct(refreshed.id, false);
      }
    }
  } catch (err) {
    console.error('Lỗi nạp dữ liệu:', err);
    filteredProducts = [];
    renderProductPage();
    document.getElementById('resultCount').textContent = 'Chưa tải được dữ liệu';
    document.getElementById('productsTableBody').innerHTML = '<tr><td colspan="8" class="table-empty"><i data-lucide="database"></i><strong>Chưa tải được dữ liệu</strong><p>Thử tải lại để đọc dữ liệu đã lưu trên thiết bị.</p><button class="button button-secondary" data-action="reload-data">Tải lại</button></td></tr>';
    initIcons();
  }
}

function updateHeaderStats(s) {
  if (!s) return;
  const setElText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
  };

  setElText('statTotalProducts', s.totalProducts || 0);
  setElText('statReadyForTrial', s.readyForTrialCount || 0);
  setElText('statNeedsVerification', s.needsVerificationCount || 0);
  setElText('statNotEligible', s.notEligibleCount || 0);
  setElText('statAvgMargin', `${s.avgMarginPct || 0}%`);

  const watchlistCount = allProducts.filter(p => p.isWatchlist).length;
  setElText('statWatchlistCount', watchlistCount);
}

function extractMaterialTags() {
  availableMaterials.clear();
  allProducts.forEach(p => {
    if (p.materialIntel?.materials && Array.isArray(p.materialIntel.materials)) {
      p.materialIntel.materials.forEach(m => {
        if (m.labelVi) availableMaterials.add(m.labelVi);
      });
    }
  });

  const container = document.getElementById('materialTagsContainer');
  if (!container) return;

  const currentActive = currentFilters.material;
  const buttonsHtml = [
    `<button class="material-chip-btn px-2.5 py-1 rounded-full text-[11px] font-semibold transition ${currentActive === 'ALL' ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}" data-material="ALL">Tất cả</button>`
  ];

  Array.from(availableMaterials).sort().forEach(mat => {
    const isActive = currentActive === mat;
    const cls = isActive ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200';
    buttonsHtml.push(
      `<button class="material-chip-btn px-2.5 py-1 rounded-full text-[11px] font-semibold transition ${cls}" data-material="${escapeHtml(mat)}">${escapeHtml(mat)}</button>`
    );
  });

  container.innerHTML = buttonsHtml.join('');
  container.querySelectorAll('.material-chip-btn').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.material === currentActive)));

  container.querySelectorAll('.material-chip-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      currentFilters.material = e.target.getAttribute('data-material') || 'ALL';
      const label = document.getElementById('selectedMaterialLabel');
      if (label) label.innerText = currentFilters.material;
      extractMaterialTags();
      applyFilters();
    });
  });
}

function renderNicheOptions() {
  const select = document.getElementById('nicheSelect');
  if (!select) return;

  const niches = new Map();
  niches.set('all', 'Tất cả ngách hàng');
  allProducts.forEach(p => {
    if (p.niche && p.nicheName) niches.set(p.niche, p.nicheName);
  });

  select.innerHTML = Array.from(niches.entries()).map(([code, name]) => 
    `<option value="${escapeHtml(code)}">${escapeHtml(name)}</option>`
  ).join('');
  select.value = currentFilters.niche;
}

// 2. LỌC VÀ SẮP XẾP SẢN PHẨM
function applyFilters(resetPage = true) {
  let list = [...allProducts];

  // Search query
  if (currentFilters.search) {
    const q = currentFilters.search.toLowerCase();
    list = list.filter(p => {
      const titleMatch = (p.titleKr || '').toLowerCase().includes(q);
      const queryMatch = (p.materialIntel?.precisionQueryCn || '').toLowerCase().includes(q);
      const idMatch = String(p.productId || '').includes(q);
      const matMatch = (p.materialIntel?.materials || []).some(m => (m.labelVi || '').toLowerCase().includes(q));
      return titleMatch || queryMatch || idMatch || matMatch;
    });
  }

  // Niche filter
  if (currentFilters.niche !== 'all') {
    list = list.filter(p => p.niche === currentFilters.niche);
  }

  // BỘ LỌC ĐIỀU KIỆN THỬ BÁN
  if (currentFilters.elig === 'READY_FOR_TRIAL') {
    list = list.filter(p => p.trialEligibility?.status === 'ready_for_trial');
  } else if (currentFilters.elig === 'NEEDS_VERIFICATION') {
    list = list.filter(p => p.trialEligibility?.status === 'needs_verification');
  } else if (currentFilters.elig === 'NOT_ELIGIBLE') {
    list = list.filter(p => p.trialEligibility?.status === 'not_eligible');
  }

  // Buy box filter
  if (currentFilters.buybox === 'WING_ONLY') {
    list = list.filter(p => !p.isRocket || p.rocketType === 'NONE');
  } else if (currentFilters.buybox === 'ROCKET_ONLY') {
    list = list.filter(p => p.isRocket && p.rocketType !== 'NONE');
  }

  // Tier filter
  if (currentFilters.tier === 'DIAMOND') {
    list = list.filter(p => p.wpi?.tier === 'DIAMOND_WIN');
  } else if (currentFilters.tier === 'GOLD') {
    list = list.filter(p => p.wpi?.tier === 'GOLD_WIN');
  }

  // Price filter
  if (currentFilters.price === 'UNDER_50K') {
    list = list.filter(p => (p.salesPriceKrw || 0) < 50000);
  } else if (currentFilters.price === '50K_TO_100K') {
    list = list.filter(p => (p.salesPriceKrw || 0) >= 50000 && (p.salesPriceKrw || 0) < 100000);
  } else if (currentFilters.price === 'OVER_100K') {
    list = list.filter(p => (p.salesPriceKrw || 0) >= 100000);
  }

  // KC Safety filter
  if (currentFilters.kcSafeOnly) {
    list = list.filter(p => p.kcSafety?.level === 'LOW');
  }

  // Material filter
  if (currentFilters.material !== 'ALL') {
    list = list.filter(p => (p.materialIntel?.materials || []).some(m => m.labelVi === currentFilters.material));
  }

  // Sắp xếp
  list.sort((a, b) => {
    switch (currentFilters.sort) {
      case 'wpi_desc': return (b.wpi?.score || 0) - (a.wpi?.score || 0);
      case 'margin_desc': return (b.financial?.netMarginPct || 0) - (a.financial?.netMarginPct || 0);
      case 'profit_desc': return (b.financial?.netProfitKrw || 0) - (a.financial?.netProfitKrw || 0);
      case 'price_desc': return (b.salesPriceKrw || 0) - (a.salesPriceKrw || 0);
      case 'price_asc': return (a.salesPriceKrw || 0) - (b.salesPriceKrw || 0);
      case 'cogs_asc': return (a.cogs1688Cny || 0) - (b.cogs1688Cny || 0);
      default: return (b.wpi?.score || 0) - (a.wpi?.score || 0);
    }
  });

  const countEl = document.getElementById('resultCount');
  if (countEl) countEl.innerText = `${list.length} sản phẩm phù hợp`;

  syncFilterControls(list.length);
  filteredProducts = list;
  if (resetPage) pagination.page = 1;
  renderProductPage();
}

function renderProductPage() {
  const total = filteredProducts.length;
  const pages = Math.max(1, Math.ceil(total / pagination.pageSize));
  pagination.page = Math.max(1, Math.min(pagination.page, pages));
  const start = (pagination.page - 1) * pagination.pageSize;
  renderTable(filteredProducts.slice(start, start + pagination.pageSize));
  document.getElementById('pageRange').textContent = total
    ? `${(start + 1).toLocaleString('vi-VN')}–${Math.min(start + pagination.pageSize, total).toLocaleString('vi-VN')} / ${total.toLocaleString('vi-VN')} sản phẩm`
    : '0 sản phẩm';
  const pageInput = document.getElementById('pageNumber');
  pageInput.value = pagination.page;
  pageInput.max = pages;
  pageInput.disabled = total === 0;
  document.getElementById('pageTotal').textContent = `/ ${pages.toLocaleString('vi-VN')}`;
  document.getElementById('btnPreviousPage').disabled = pagination.page === 1;
  document.getElementById('btnNextPage').disabled = pagination.page === pages;
  document.getElementById('pageSizeSelect').value = pagination.pageSize;
}

function goToProductPage(page) {
  if (!Number.isInteger(page)) return renderProductPage();
  pagination.page = page;
  renderProductPage();
  const table = document.querySelector('.table-scroll');
  table.scrollTop = 0;
  if (typeof table.scrollIntoView === 'function') table.scrollIntoView({ block: 'start' });
}

function syncFilterControls(resultLength) {
  [['elig', '.elig-filter-btn'], ['buybox', '.buybox-filter-btn'], ['tier', '.tier-filter-btn'], ['price', '.price-filter-btn']].forEach(([key, selector]) => {
    document.querySelectorAll(selector).forEach(btn => {
      btn.setAttribute('aria-pressed', String(btn.dataset[key] === currentFilters[key]));
    });
  });
  const active = currentFilters.search || currentFilters.niche !== 'all' || currentFilters.elig !== 'ALL' || currentFilters.buybox !== 'ALL' || currentFilters.tier !== 'ALL' || currentFilters.price !== 'ALL' || currentFilters.kcSafeOnly || currentFilters.material !== 'ALL' || currentFilters.sort !== 'wpi_desc';
  document.getElementById('btnResetFilters').disabled = !active;
  document.getElementById('resultCount').textContent = `${resultLength.toLocaleString('vi-VN')} / ${allProducts.length.toLocaleString('vi-VN')} sản phẩm`;
  document.getElementById('selectedMaterialLabel').textContent = currentFilters.material === 'ALL' ? 'Tất cả' : currentFilters.material;
}

function resetFilters() {
  Object.assign(currentFilters, { search: '', niche: 'all', sort: 'wpi_desc', elig: 'ALL', buybox: 'ALL', tier: 'ALL', price: 'ALL', kcSafeOnly: false, material: 'ALL' });
  document.getElementById('searchInput').value = '';
  document.getElementById('nicheSelect').value = 'all';
  document.getElementById('sortSelect').value = 'wpi_desc';
  document.getElementById('chkKcSafeOnly').checked = false;
  extractMaterialTags();
  applyFilters();
  initIcons();
}

function renderTable(products) {
  const tbody = document.getElementById('productsTableBody');
  if (!tbody) return;
  if (products.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-empty"><i data-lucide="search-x"></i><strong>${allProducts.length ? 'Không có sản phẩm phù hợp' : 'Bắt đầu với dữ liệu sản phẩm'}</strong><p>${allProducts.length ? 'Thử từ khóa khác hoặc đặt lại bộ lọc để xem thêm sản phẩm.' : 'Bấm “Nạp dữ liệu” để thêm sản phẩm vào Market Radar.'}</p>${allProducts.length ? '<button class="button button-secondary" data-action="reset-filters">Đặt lại bộ lọc</button>' : ''}</td></tr>`;
    initIcons();
    return;
  }
  tbody.innerHTML = products.map(p => {
    const fin = p.financial || {};
    const kc = p.kcSafety || {};
    const mat = p.materialIntel || {};
    const wpi = p.wpi || {};
    const e = escapeHtml;
    const wing = !p.isRocket || p.rocketType === 'NONE';
    const growth = p.rocketType === 'ROCKET_GROWTH';
    const type = wing ? 'wing' : growth ? 'growth' : 'rocket';
    const buyBox = wing ? 'Wing Seller' : growth ? 'CGF Growth' : 'Rocket Coupang';
    const tierLabel = ({ DIAMOND_WIN: 'Diamond', GOLD_WIN: 'Gold', SILVER_WIN: 'Silver', SILVER: 'Silver', INCOMPLETE: 'Chưa đủ dữ liệu', HIGH_RISK: 'Rủi ro', AVOID: 'Tránh' })[wpi.tier] || wpi.tierLabelVi || 'Chưa xếp hạng';
    const kcLabel = ({ LOW: 'Miễn trừ KC', MEDIUM: 'Cần lưu ý', HIGH: 'Bắt buộc KC' })[kc.level] || 'Chưa đánh giá';
    const profit = Number(fin.netProfitKrw || 0);
    const margin = Number(fin.netMarginPct || 0);
    const money = value => Number(value || 0).toLocaleString('en-US');
    const id = e(p.id);
    const elig = p.trialEligibility || {};
    const sourcing = p.sourcingDossier || {};
    const status = elig.status || 'needs_verification';
    const statusText = ({ ready_for_trial: 'Đủ điều kiện', needs_verification: 'Cần xác minh', not_eligible: 'Chưa đạt' })[status] || 'Cần xác minh';
    const provenance = sourcing.isVerified ? 'Đã xác minh' : sourcing.provenance === 'MANUAL' ? 'Nhập tay' : sourcing.provenance === 'LEGACY' ? 'Dữ liệu cũ' : 'Tạm tính';
    const badges = (mat.highlightBadges || []).slice(0, 2).map(b => `<span>${e(b.label)}</span>`).join('');
    const marketData = p.marketData || {};
    const sourceLabel = marketData.isAdvertised === true
      ? `Quảng cáo Coupang${marketData.listingSourceType ? ` · ${e(marketData.listingSourceType)}` : ''}`
      : marketData.listingSection === 'personalizedGW'
        ? 'Đề xuất cá nhân hóa Coupang'
        : marketData.listingSection === 'categoryBestUnit' || String(marketData.listingSection || '').startsWith('categoryBest_')
          ? 'Đề xuất theo danh mục Coupang'
          : '';
    return `<tr>
      <td><span class="eligibility-badge" data-status="${e(status)}">${e(statusText)}</span><span class="screening-score" data-tier="${e(wpi.tier)}">WPI ${wpi.isComplete === false ? "—" : e(wpi.score ?? "—")}<small>${wpi.isComplete === false ? "Chưa đủ dữ liệu" : wpi.isProvisional ? "Tạm tính" : "/100"}</small></span><span class="bsr-rank">BSR #${e(p.rank || "—")}</span></td>
      <td><div class="product-info"><img class="product-image product-thumb" src="${e(p.thumbnailUrl || '../icons/product-placeholder.svg')}" alt="" loading="lazy" width="60" height="60"><div class="product-copy">
        <div class="product-meta"><span class="buybox-badge" data-type="${type}"><i data-lucide="${wing ? 'flame' : 'rocket'}"></i>${buyBox}</span><span class="product-id">ID ${e(p.productId)}</span>${sourceLabel ? `<span class="product-source">${sourceLabel}</span>` : ''}</div>
        <a class="product-title" href="${sanitizeUrl(p.productUrl)}" target="_blank" rel="noopener noreferrer" title="${e(p.titleKr)}">${e(p.titleKr)}</a>
        <div class="product-rating"><i data-lucide="star"></i><span>${p.rating !== null && p.rating !== undefined ? e(p.rating) : '—'}</span><span>${p.reviewCount !== null && p.reviewCount !== undefined ? `(${money(p.reviewCount)} đánh giá)` : '(Chưa có đánh giá)'}</span></div>
      </div></div></td>
      <td><div class="material-badges">${badges || '<span>Vật liệu cơ bản</span>'}</div><span class="source-query" title="${e(mat.precisionQueryCn)}">${e(mat.precisionQueryCn || 'Chưa có từ khóa')}</span>${mat.searchUrl1688 ? `<a class="source-link" href="${sanitizeUrl(mat.searchUrl1688)}" target="_blank" rel="noopener noreferrer">Tìm xưởng 1688<i data-lucide="arrow-up-right"></i></a>` : ''}<button class="source-dossier btn-open-dossier" data-id="${id}">Hồ sơ & bằng chứng</button></td>
      <td class="numeric"><span class="money-value">${money(p.salesPriceKrw)} ₩</span></td>
      <td class="numeric"><input class="cogs-input input-cogs-cny" type="number" step="0.5" value="${e(p.cogs1688Cny ?? '')}" placeholder="—" data-id="${id}" aria-label="Giá vốn CNY của sản phẩm ${e(p.productId)}"><span class="provenance-label">${e(provenance)}</span></td>
      <td class="numeric"><span class="money-value profit-value ${profit < 0 ? 'is-negative' : ''} ${fin.isComplete === false ? 'is-provisional' : ''}">${profit > 0 ? '+' : ''}${money(profit)} ₩</span><br><span class="margin-badge ${margin < 0 ? 'is-negative' : ''}">${fin.isComplete === false ? 'Chưa đủ chi phí' : `${e(margin)}%`}</span></td>
      <td><span class="kc-badge" data-level="${e(kc.level || 'UNKNOWN')}" title="${e(kc.reason || kc.labelVi || '')}"><i data-lucide="${kc.level === 'LOW' ? 'shield-check' : 'shield-alert'}"></i>${kcLabel}</span></td>
      <td><div class="row-actions">
        <button class="icon-button btn-inspect" data-id="${id}" aria-label="Soi chi tiết WPI của ${e(p.productId)}" title="Soi chi tiết WPI"><i data-lucide="scan-search"></i></button>
        <button class="icon-button btn-dossier" data-id="${id}" aria-label="Hồ sơ bằng chứng của ${e(p.productId)}" title="Hồ sơ & bằng chứng"><i data-lucide="file-check"></i></button>
        <button class="icon-button btn-simulate" data-id="${id}" aria-label="Mô phỏng tài chính của ${e(p.productId)}" title="Mô phỏng tài chính"><i data-lucide="calculator"></i></button>
        <button class="icon-button btn-watchlist" data-id="${id}" aria-pressed="${Boolean(p.isWatchlist)}" aria-label="${p.isWatchlist ? 'Bỏ lưu' : 'Lưu'} sản phẩm ${e(p.productId)}" title="${p.isWatchlist ? 'Bỏ lưu khỏi Watchlist' : 'Lưu vào Watchlist'}"><i data-lucide="bookmark"></i></button>
        <a class="icon-button" href="${e(p.productUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Mở sản phẩm ${e(p.productId)} trên Coupang" title="Mở trên Coupang"><i data-lucide="external-link"></i></a>
      </div></td>
    </tr>`;
  }).join('');
  initIcons();
}

// 4. WATCHLIST RENDER
function renderWatchlist() {
  const container = document.getElementById('watchlistContainer');
  if (!container) return;
  const bookmarked = allProducts.filter(p => p.isWatchlist);

  if (bookmarked.length === 0) {
    container.innerHTML = `
      <div class="py-12 text-center text-slate-400">
        <i data-lucide="bookmark" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
        <p>Chưa có sản phẩm nào trong Watchlist.</p>
        <p class="text-[11px] text-slate-400">Bấm biểu tượng Bookmark ở bảng Market Radar để lưu các sản phẩm bạn muốn theo dõi.</p>
      </div>
    `;
    initIcons();
    return;
  }

  container.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      ${bookmarked.map(p => {
        const elig = p.trialEligibility || {};
        const safeThumb = sanitizeUrl(p.thumbnailUrl || '');
        const safe1688 = sanitizeUrl(p.materialIntel?.searchUrl1688 || '#');
        return `
          <div class="p-4 rounded-xl border border-slate-200 bg-white shadow-sm space-y-3">
            <div class="flex items-start justify-between">
              <div class="flex items-center space-x-2">
                <span class="px-2 py-0.5 text-[10px] font-bold rounded ${elig.status === 'ready_for_trial' ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}">
                  ${escapeHtml(elig.statusLabelVi || 'Cần xác minh')}
                </span>
                <span class="text-xs font-bold text-slate-400">WPI: ${p.wpi?.score || 'n/a'}đ</span>
              </div>
              <button class="btn-remove-watchlist text-amber-500 hover:text-slate-400" data-id="${escapeHtml(p.id)}">
                <i data-lucide="bookmark-x" class="w-4 h-4"></i>
              </button>
            </div>

            <div class="flex space-x-3">
              <img src="${safeThumb}" class="w-14 h-14 rounded-lg object-cover border border-slate-200 shrink-0">
              <div class="min-w-0 flex-1">
                <h4 class="text-xs font-bold text-slate-900 line-clamp-2">${escapeHtml(p.titleKr)}</h4>
                <p class="text-[11px] text-slate-500 mt-1">${Number(p.salesPriceKrw || 0).toLocaleString()} ₩ (Lãi: +${Number(p.financial?.netProfitKrw || 0).toLocaleString()} ₩)</p>
              </div>
            </div>

            <div class="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
              <span class="font-bold text-emerald-600">${p.financial?.netMarginPct || 0}% Margin</span>
              <div class="flex space-x-2">
                <button class="btn-open-dossier px-2 py-1 bg-slate-100 text-slate-700 font-bold rounded-lg text-xs hover:bg-slate-200" data-id="${escapeHtml(p.id)}">
                  Bằng Chứng
                </button>
                <a href="${safe1688}" target="_blank" class="px-3 py-1 bg-orange-500 text-white font-bold rounded-lg text-xs hover:bg-orange-600">
                  Tìm 1688
                </a>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
  initIcons();
}

// 5. INSPECTOR: ĐỐI CHIẾU TIÊU CHÍ NGHIÊN CỨU & BUY BOX
function inspectProduct(id, switchTab = true) {
  const product = allProducts.find(p => String(p.id) === String(id) || String(p.productId) === String(id) || String(p.id) === `coupang_${id}`);
  if (!product) return;
  selectedProduct = product;

  if (switchTab) {
    document.querySelector('[data-tab="tabInspector"]')?.click();
  }
  const container = document.getElementById('inspectorContent');
  if (!container) return;

  const fin = product.financial || {};
  const wpi = product.wpi || {};
  const b = wpi.breakdown || {};
  const elig = product.trialEligibility || {};

  container.innerHTML = `
    <div class="space-y-6">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <span class="text-xs font-bold text-coupang-blue uppercase tracking-wider block">Chi Tiết Đánh Giá Hồ Sơ Sản Phẩm</span>
          <h3 class="text-base font-black text-slate-900 mt-0.5">${escapeHtml(product.titleKr)}</h3>
        </div>
        <div class="flex items-center space-x-2">
          <span class="px-3 py-1 rounded-full text-xs font-black ${elig.badgeClass || 'bg-slate-200 text-slate-800'}">
            ${elig.statusIcon || ''} ${escapeHtml(elig.statusLabelVi || 'Cần xác minh')}
          </span>
          <button id="btnInspectorOpenDossier" class="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold shadow-xs">
            Bổ Sung Bằng Chứng ✍️
          </button>
        </div>
      </div>

      <!-- 7 TIÊU CHÍ NGHIÊN CỨU NGÁCH -->
      <div class="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3">
        <h4 class="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
          <i data-lucide="list-checks" class="w-4 h-4 text-emerald-600"></i>
          <span>Kết Quả Đánh Giá 7 Tiêu Chí Điều Kiện Thử Bán</span>
        </h4>

        <div class="space-y-2">
          ${(elig.criteria || []).map(c => {
            let statusColor = 'bg-amber-100 text-amber-800 border-amber-300';
            let icon = '⚠️';
            if (c.status === 'PASS') {
              statusColor = 'bg-emerald-100 text-emerald-800 border-emerald-300';
              icon = '✓';
            } else if (c.status === 'FAIL') {
              statusColor = 'bg-rose-100 text-rose-800 border-rose-300';
              icon = '✕';
            }

            return `
              <div class="p-3 bg-white rounded-lg border border-slate-200 flex items-start justify-between">
                <div class="space-y-0.5">
                  <div class="flex items-center space-x-2">
                    <span class="px-1.5 py-0.2 rounded text-[10px] font-black border ${statusColor}">
                      ${icon} ${escapeHtml(c.status)}
                    </span>
                    <strong class="text-xs text-slate-800">${escapeHtml(c.name)}</strong>
                  </div>
                  <p class="text-[11px] text-slate-600">${escapeHtml(c.reason)}</p>
                </div>
                <div class="text-right text-[11px] text-slate-400 shrink-0 ml-3">
                  <div>Yêu cầu: <span class="font-medium text-slate-700">${escapeHtml(c.target || '')}</span></div>
                  ${c.value !== null && c.value !== undefined ? `<div>Thực tế: <span class="font-bold text-slate-900">${escapeHtml(String(c.value))}</span></div>` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- BẢNG ĐIỂM SÀNG LỌC WPI -->
      <div class="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3">
        <div class="flex items-center justify-between">
          <h4 class="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
            <i data-lucide="gem" class="w-4 h-4 text-coupang-blue"></i>
            <span>Bảng Điểm Ưu Tiên Sàng Lọc WPI (${wpi.score !== null ? `${wpi.score}/100đ` : 'Chưa đủ thành phần'})</span>
          </h4>
          ${wpi.isProvisional ? '<span class="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-100 text-amber-800">Điểm Tạm Tính (Provisional)</span>' : ''}
        </div>

        <div class="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
          <div class="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
            <span class="text-[10px] text-slate-500 font-bold block">1. Lợi Nhuận Ròng (35%)</span>
            <div class="text-base font-black text-blue-600">${b.margin?.isKnown ? `${b.margin?.weighted}/35đ` : 'Chưa có'}</div>
            <p class="text-[10px] text-slate-600">${escapeHtml(b.margin?.exp || '')}</p>
          </div>
          <div class="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
            <span class="text-[10px] text-slate-500 font-bold block">2. Cơ Hội Buy Box (25%)</span>
            <div class="text-base font-black text-amber-600">${b.rocketGap?.isKnown ? `${b.rocketGap?.weighted}/25đ` : 'Chưa có'}</div>
            <p class="text-[10px] text-slate-600">${escapeHtml(b.rocketGap?.exp || '')}</p>
          </div>
          <div class="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
            <span class="text-[10px] text-slate-500 font-bold block">3. An Toàn KC (15%)</span>
            <div class="text-base font-black text-emerald-600">${b.kcSafety?.isKnown ? `${b.kcSafety?.weighted}/15đ` : 'Chưa có'}</div>
            <p class="text-[10px] text-slate-600">${escapeHtml(b.kcSafety?.exp || '')}</p>
          </div>
          <div class="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
            <span class="text-[10px] text-slate-500 font-bold block">4. Giá Bán Thực Tế (15%)</span>
            <div class="text-base font-black text-purple-600">${b.priceViability?.isKnown ? `${b.priceViability?.weighted}/15đ` : 'Chưa có'}</div>
            <p class="text-[10px] text-slate-600">${escapeHtml(b.priceViability?.exp || '')}</p>
          </div>
          <div class="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
            <span class="text-[10px] text-slate-500 font-bold block">5. Sức Mua BSR (10%)</span>
            <div class="text-base font-black text-slate-800">${b.demand?.isKnown ? `${b.demand?.weighted}/10đ` : 'Chưa có'}</div>
            <p class="text-[10px] text-slate-600">${escapeHtml(b.demand?.exp || '')}</p>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btnInspectorOpenDossier')?.addEventListener('click', () => {
    openDossierModal(product.id);
  });

  initIcons();
}

// 6. MODAL HỒ SƠ BẰNG CHỨNG (EVIDENCE DOSSIER)
function openDossierModal(productId) {
  const p = allProducts.find(item => item.id === productId);
  if (!p) return;

  const modal = document.getElementById('dossierModal');
  if (!modal) return;

  document.getElementById('dossierProductId').value = p.id;
  document.getElementById('dossierProductTitle').innerText = p.titleKr;

  const sourcing = p.sourcingDossier || {};
  document.getElementById('dossierSupplierUrl').value = sourcing.supplierUrl || '';
  document.getElementById('dossierVariant').value = sourcing.variant || '';
  document.getElementById('dossierUnitPriceCny').value = sourcing.cogs1688Cny || sourcing.unitPriceCny || '';
  document.getElementById('dossierQuantity').value = sourcing.quantity || 10;
  document.getElementById('dossierMoq').value = sourcing.moq || 1;
  const quoteDateVal = sourcing.quoteDate || sourcing.verifiedAt;
  document.getElementById('dossierQuoteDate').value = quoteDateVal ? quoteDateVal.slice(0, 10) : new Date().toISOString().slice(0, 10);
  document.getElementById('dossierMoqNotes').value = sourcing.moqApplicabilityNotes || '';
  document.getElementById('dossierIsVerified').checked = Boolean(sourcing.isVerified);

  const statusBadge = document.getElementById('dossierQuoteStatus');
  if (statusBadge) {
    statusBadge.innerText = sourcing.isVerified ? '✓ Đã xác minh' : 'Chưa xác minh';
    statusBadge.className = sourcing.isVerified
      ? 'px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-100 text-emerald-800'
      : 'px-2 py-0.5 text-[10px] font-bold rounded bg-amber-100 text-amber-800';
  }

  const demand = p.evidenceDossier?.demand || {};
  document.getElementById('dossierDemandKeyword').value = demand.keyword || '';
  document.getElementById('dossierPeakSearches').value = demand.peakMonthlySearches || '';
  document.getElementById('dossierDemandSource').value = demand.source || '';
  document.getElementById('dossierDemandGeography').value = demand.geography || 'KR';
  document.getElementById('dossierDemandPeriod').value = demand.period || '';
  document.getElementById('dossierDemandUnit').value = demand.unit || 'SEARCHES';
  document.getElementById('dossierSeasonalityReviewed').checked = Boolean(demand.seasonalityReviewed);
  document.getElementById('dossierSeasonalityNotes').value = demand.seasonalityFinding || demand.seasonalityNotes || '';

  const rocket = p.evidenceDossier?.rocketCompetition || {};
  document.getElementById('dossierSampleSize').value = rocket.sampleSize || '';
  document.getElementById('dossierRocketCount').value = rocket.rocketCount || '';
  document.getElementById('dossierRocketKeyword').value = rocket.keywordOrCategory || rocket.keyword || '';
  const rocketDateVal = rocket.inspectedAt || rocket.inspectionDate;
  document.getElementById('dossierRocketInspectedAt').value = rocketDateVal ? rocketDateVal.slice(0, 10) : new Date().toISOString().slice(0, 10);

  const seller = p.evidenceDossier?.sellerEvidence || {};
  document.getElementById('dossierOfferUrl').value = seller.offerUrl || seller.comparableOfferUrl || '';
  document.getElementById('dossierSellerReviews').value = seller.sellerReviewCount || '';
  document.getElementById('dossierSellerId').value = seller.sellerId || '';
  const sellerDateVal = seller.inspectedAt || seller.inspectionDate;
  document.getElementById('dossierSellerInspectedAt').value = sellerDateVal ? sellerDateVal.slice(0, 10) : new Date().toISOString().slice(0, 10);
  document.getElementById('dossierIsInternational').checked = Boolean(seller.isInternationalDelivery);

  const priceRev = p.evidenceDossier?.priceReview || {};
  document.getElementById('dossierPriceJustification').value = priceRev.justification || '';

  const kcRev = p.evidenceDossier?.kcReview || {};
  document.getElementById('dossierKcStatus').value = kcRev.reviewStatus || 'PENDING';
  document.getElementById('dossierKcSource').value = kcRev.source || kcRev.reference || '';
  const kcDateVal = kcRev.reviewDate || kcRev.reviewedAt;
  document.getElementById('dossierKcReviewDate').value = kcDateVal ? kcDateVal.slice(0, 10) : new Date().toISOString().slice(0, 10);
  document.getElementById('dossierKcNotes').value = kcRev.rationale || kcRev.notes || '';

  const fulfillment = p.evidenceDossier?.fulfillment || {};
  document.getElementById('dossierFulfillmentBasis').value = fulfillment.shippingBasis || p.economics?.shippingBasis || 'REVIEWED_WEIGHT';
  document.getElementById('dossierFulfillmentSource').value = fulfillment.shippingBasisSource || '';
  document.getElementById('dossierFulfillmentDelivery').value = fulfillment.deliveryEstimate || '';
  document.getElementById('dossierFulfillmentReturn').value = fulfillment.returnArrangement || '';

  modal.classList.remove('hidden');
  initIcons();
}

function initDossierModal() {
  const modal = document.getElementById('dossierModal');
  const btnClose = document.getElementById('btnCloseDossierModal');
  const btnCancel = document.getElementById('btnCancelDossier');
  const btnSave = document.getElementById('btnSaveDossier');

  const close = () => modal.classList.add('hidden');
  if (btnClose) btnClose.addEventListener('click', close);
  if (btnCancel) btnCancel.addEventListener('click', close);

  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      const prodId = document.getElementById('dossierProductId').value;
      if (!prodId) return;

      const supplierUrl = document.getElementById('dossierSupplierUrl').value.trim();
      const variant = document.getElementById('dossierVariant').value.trim();
      const rawPrice = document.getElementById('dossierUnitPriceCny').value.trim();
      const unitPriceCny = rawPrice === '' ? null : parseFloat(rawPrice);
      const rawQty = document.getElementById('dossierQuantity').value.trim();
      const quantity = rawQty === '' ? null : parseInt(rawQty, 10);
      const rawMoq = document.getElementById('dossierMoq').value.trim();
      const moq = rawMoq === '' ? null : parseInt(rawMoq, 10);
      const quoteDate = document.getElementById('dossierQuoteDate').value;
      const moqNotes = document.getElementById('dossierMoqNotes').value.trim();
      const isVerified = document.getElementById('dossierIsVerified').checked;

      const sourcingUpdates = {
        supplierUrl: supplierUrl || null,
        variant: variant || null,
        cogs1688Cny: Number.isFinite(unitPriceCny) ? unitPriceCny : null,
        unitPriceCny: Number.isFinite(unitPriceCny) ? unitPriceCny : null,
        quantity: Number.isInteger(quantity) ? quantity : null,
        moq: Number.isInteger(moq) ? moq : null,
        quoteDate: quoteDate ? new Date(quoteDate).toISOString() : null,
        moqApplicabilityNotes: moqNotes || null,
        isVerified,
        provenance: isVerified ? 'EVIDENCE' : (unitPriceCny !== null ? 'MANUAL' : 'HEURISTIC'),
        verifiedAt: isVerified ? new Date().toISOString() : null
      };

      const peakSearches = parseInt(document.getElementById('dossierPeakSearches').value, 10);
      const seasonalityReviewed = document.getElementById('dossierSeasonalityReviewed').checked;
      const seasonalityNotes = document.getElementById('dossierSeasonalityNotes').value.trim();
      const demandUpdates = {
        keyword: document.getElementById('dossierDemandKeyword').value.trim() || null,
        peakMonthlySearches: Number.isFinite(peakSearches) ? peakSearches : null,
        source: document.getElementById('dossierDemandSource').value.trim() || null,
        geography: document.getElementById('dossierDemandGeography').value.trim() || 'KR',
        period: document.getElementById('dossierDemandPeriod').value.trim() || null,
        unit: document.getElementById('dossierDemandUnit').value || 'SEARCHES',
        seasonalityReviewed,
        seasonalityFinding: seasonalityNotes || null,
        seasonalityNotes: seasonalityNotes || null
      };

      const sampleSize = parseInt(document.getElementById('dossierSampleSize').value, 10);
      const rocketCount = parseInt(document.getElementById('dossierRocketCount').value, 10);
      const rocketKeyword = document.getElementById('dossierRocketKeyword').value.trim();
      const rocketInspectedAt = document.getElementById('dossierRocketInspectedAt').value;
      const rocketUpdates = {
        sampleSize: Number.isFinite(sampleSize) ? sampleSize : null,
        rocketCount: Number.isFinite(rocketCount) ? rocketCount : null,
        keywordOrCategory: rocketKeyword || null,
        inspectedAt: rocketInspectedAt ? new Date(rocketInspectedAt).toISOString() : null
      };

      const sellerReviews = parseInt(document.getElementById('dossierSellerReviews').value, 10);
      const offerUrl = document.getElementById('dossierOfferUrl').value.trim();
      const sellerId = document.getElementById('dossierSellerId').value.trim();
      const sellerInspectedAt = document.getElementById('dossierSellerInspectedAt').value;
      const sellerUpdates = {
        offerUrl: offerUrl || null,
        comparableOfferUrl: offerUrl || null,
        sellerReviewCount: Number.isFinite(sellerReviews) ? sellerReviews : null,
        sellerId: sellerId || null,
        isInternationalDelivery: document.getElementById('dossierIsInternational').checked,
        inspectedAt: sellerInspectedAt ? new Date(sellerInspectedAt).toISOString() : null
      };

      const priceJustification = document.getElementById('dossierPriceJustification').value.trim();
      const priceReviewUpdates = {
        isReviewed: Boolean(priceJustification),
        justification: priceJustification || null,
        reviewedAt: priceJustification ? new Date().toISOString() : null
      };

      const kcSource = document.getElementById('dossierKcSource').value.trim();
      const kcDate = document.getElementById('dossierKcReviewDate').value;
      const kcNotes = document.getElementById('dossierKcNotes').value.trim();
      const kcReviewUpdates = {
        reviewStatus: document.getElementById('dossierKcStatus').value,
        source: kcSource || null,
        reference: kcSource || null,
        reviewDate: kcDate || null,
        rationale: kcNotes || null,
        notes: kcNotes || null,
        reviewedAt: new Date().toISOString()
      };

      const fulfillmentUpdates = {
        shippingBasis: document.getElementById('dossierFulfillmentBasis').value,
        shippingBasisSource: document.getElementById('dossierFulfillmentSource').value.trim() || null,
        deliveryEstimate: document.getElementById('dossierFulfillmentDelivery').value.trim() || null,
        returnArrangement: document.getElementById('dossierFulfillmentReturn').value.trim() || null
      };

      try {
        await window.KDropStorage.saveSourcingDossier(prodId, sourcingUpdates);
        const enriched = await window.KDropStorage.saveEvidenceDossier(prodId, {
          demand: demandUpdates,
          rocketCompetition: rocketUpdates,
          sellerEvidence: sellerUpdates,
          priceReview: priceReviewUpdates,
          kcReview: kcReviewUpdates,
          fulfillment: fulfillmentUpdates
        });

        // Cập nhật bộ nhớ cục bộ
        const idx = allProducts.findIndex(p => p.id === prodId);
        if (idx !== -1) allProducts[idx] = enriched;

        alert('✓ Đã lưu hồ sơ bằng chứng thành công!');
        close();
        await loadData();
      } catch (err) {
        alert('Lỗi lưu hồ sơ: ' + err.message);
      }
    });
  }
}

// 7. SIMULATOR
function initCalculator() {
  const priceInput = document.getElementById('calcPriceKrw');
  const cogsInput = document.getElementById('calcCogsCny');
  const weightInput = document.getElementById('calcWeight');
  const rateInput = document.getElementById('calcExchangeRate');
  const shipInput = document.getElementById('calcQuotedShip');
  const adInput = document.getElementById('calcAdCost');
  const cgfCheckbox = document.getElementById('calcIsCgf');
  const returnRateInput = document.getElementById('calcReturnRate');
  const targetContribInput = document.getElementById('calcTargetContrib');
  const ordersDayInput = document.getElementById('calcOrdersDay');
  const settlementDaysInput = document.getElementById('calcSettlementDays');
  const btnSaveBaseline = document.getElementById('btnSaveAsBaseline');

  if (!priceInput || !cogsInput) return;

  const updateSim = () => {
    if (!window.KDropFeeCalculator) return;

    const salesPriceKrw = Number(priceInput.value) || 0;
    const hasCogsInput = cogsInput.value.trim() !== '';
    const cogs1688Cny = hasCogsInput ? Number(cogsInput.value) : 0;
    const hasWeightInput = weightInput.value.trim() !== '';
    const hasExchangeRateInput = rateInput.value.trim() !== '';
    const weightGram = hasWeightInput ? Number(weightInput.value) : 250;
    const exchangeRate = hasExchangeRateInput ? Number(rateInput.value) : 190;
    const quotedShip = shipInput.value.trim() !== '' ? Number(shipInput.value) : null;
    const hasAdCostInput = adInput.value.trim() !== '';
    const adCost = hasAdCostInput ? Number(adInput.value) : 0;
    const financialConfig = hasExchangeRateInput ? { exchangeRateCnyKrw: exchangeRate } : {};
    const isCgf = Boolean(cgfCheckbox.checked);
    const hasReturnRateInput = Boolean(returnRateInput && returnRateInput.value.trim() !== '');
    const returnRatePct = hasReturnRateInput ? Number(returnRateInput.value) : 3;
    const targetContributionPct = Number(targetContribInput?.value || 15);
    const ordersPerDay = Number(ordersDayInput?.value || 10);
    const settlementCycleDays = Number(settlementDaysInput?.value || 30);

    const econ = currentSimulatorProduct?.economics || {};

    const c = window.KDropFeeCalculator.calculateProfit({
      salesPriceKrw,
      cogs1688Cny: hasCogsInput ? cogs1688Cny : null,
      weightGram: hasWeightInput ? weightGram : undefined,
      shippingCostKrw: quotedShip,
      adCostPerOrderKrw: hasAdCostInput ? adCost : null,
      returnAllowanceMode: econ.returnAllowanceMode,
      returnAllowanceRate: hasReturnRateInput ? returnRatePct : null,
      returnAllowanceKrw: econ.returnAllowanceKrw,
      isCgf,
      fulfillmentModel: isCgf ? 'ROCKET_GROWTH' : (econ.fulfillmentModel || 'BUYING_PER_ORDER'),
      platformCommissionRate: econ.platformCommissionRate,
      buyingAgentFeeMode: econ.buyingAgentFeeMode,
      buyingAgentFeeKrw: econ.buyingAgentFeeKrw,
      buyingAgentFeeRate: econ.buyingAgentFeeRate,
      otherCostPerOrderKrw: econ.otherCostPerOrderKrw,
      dimensions: econ.dimensions
    }, financialConfig);

    const targetMaxCny = window.KDropFeeCalculator.calculateTargetMaxCny(salesPriceKrw, 0.30, hasWeightInput ? weightGram : undefined, {
      ...financialConfig,
      shippingCostKrw: quotedShip,
      platformCommissionRate: econ.platformCommissionRate,
      buyingAgentFeeMode: econ.buyingAgentFeeMode,
      buyingAgentFeeKrw: econ.buyingAgentFeeKrw,
      buyingAgentFeeRate: econ.buyingAgentFeeRate,
      otherCostPerOrderKrw: econ.otherCostPerOrderKrw,
      adCostPerOrderKrw: hasAdCostInput ? adCost : null,
      returnAllowanceMode: econ.returnAllowanceMode,
      returnAllowanceRate: hasReturnRateInput ? returnRatePct : null,
      returnAllowanceKrw: econ.returnAllowanceKrw,
      fulfillmentModel: isCgf ? 'ROCKET_GROWTH' : (econ.fulfillmentModel || 'BUYING_PER_ORDER'),
      dimensions: econ.dimensions
    });

    const u = window.KDropFeeCalculator.calculateUnitEconomics({
      salesPriceKrw,
      cogs1688Cny: hasCogsInput ? cogs1688Cny : null,
      exchangeRateCnyKrw: hasExchangeRateInput ? exchangeRate : undefined,
      shippingCostKrw: c.shippingCostKrw,
      shippingBasis: c.shippingBasis,
      returnAllowanceMode: econ.returnAllowanceMode,
      returnAllowanceRate: hasReturnRateInput ? returnRatePct : null,
      returnAllowanceKrw: econ.returnAllowanceKrw,
      adCostPerOrderKrw: hasAdCostInput ? adCost : null,
      targetContributionPct,
      ordersPerDay,
      settlementCycleDays,
      platformCommissionRate: econ.platformCommissionRate,
      buyingAgentFeeMode: econ.buyingAgentFeeMode,
      buyingAgentFeeKrw: econ.buyingAgentFeeKrw,
      buyingAgentFeeRate: econ.buyingAgentFeeRate,
      otherCostPerOrderKrw: econ.otherCostPerOrderKrw,
      fulfillmentModel: isCgf ? 'ROCKET_GROWTH' : (econ.fulfillmentModel || 'BUYING_PER_ORDER'),
      dimensions: econ.dimensions
    });

    // Update UI elements
    const setTxt = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.innerText = text;
    };

    setTxt('calcNetProfitKrw', `${Number(c.netProfitKrw).toLocaleString()} ₩`);
    setTxt('calcNetMarginPct', `${c.netMarginPct}% Margin`);
    setTxt('calcRoiPct', `${c.roiPct}%`);
    setTxt('calcTargetMaxCny', `${targetMaxCny} ¥`);

    if (u) {
      setTxt('calcPreAdMarginKrw', `${Number(u.preAdMarginKrw).toLocaleString()} ₩`);
      setTxt('calcPreAdMarginPct', `${u.preAdMarginPct}% Doanh thu`);
      setTxt('calcBreakevenRoas', `${u.breakevenRoasPct}% (${u.breakevenRoasRatio}x)`);
      setTxt('calcMaxAllowedCpa', `${Number(u.maxAllowedCpaKrw).toLocaleString()} ₩`);

      setTxt('calcRowReturnReserve', `-${Number(u.returnReserveKrw).toLocaleString()} KRW (${returnRatePct}%)`);
      setTxt('calcRowAds', `-${Number(adCost).toLocaleString()} KRW`);
      setTxt('calcRowFinalProfit', `${Number(c.netProfitKrw).toLocaleString()} KRW`);

      if (u.scenarios) {
        setTxt('scenarioFavCpa', `${Number(u.scenarios.favorable.cpaKrw).toLocaleString()} ₩`);
        setTxt('scenarioFavProfit', `+${Number(u.scenarios.favorable.contributionKrw).toLocaleString()} ₩`);
        setTxt('scenarioFavPct', `${u.scenarios.favorable.contributionPct}% Margin`);

        setTxt('scenarioBaseCpa', `${Number(u.scenarios.base.cpaKrw).toLocaleString()} ₩`);
        setTxt('scenarioBaseProfit', `+${Number(u.scenarios.base.contributionKrw).toLocaleString()} ₩`);
        setTxt('scenarioBasePct', `${u.scenarios.base.contributionPct}% Margin`);

        setTxt('scenarioAdvCpa', `${Number(u.scenarios.adverse.cpaKrw).toLocaleString()} ₩`);
        setTxt('scenarioAdvProfit', `${u.scenarios.adverse.contributionKrw >= 0 ? '+' : ''}${Number(u.scenarios.adverse.contributionKrw).toLocaleString()} ₩`);
        setTxt('scenarioAdvPct', `${u.scenarios.adverse.contributionPct}% Margin`);
      }

      if (u.workingCapital) {
        setTxt('wcCapitalPerOrder', `${Number(u.workingCapital.capitalPerOrderKrw).toLocaleString()} ₩`);
        setTxt('wcTotalKrw', `${(u.workingCapital.workingCapitalKrw / 1000000).toFixed(1)} Triệu ₩`);
        setTxt('wcTotalVnd', `~${(u.workingCapital.workingCapitalVnd / 1000000).toFixed(0)} Triệu VND`);
        setTxt('wcNoteVi', u.workingCapital.noteVi);
      }
    }

    setTxt('calcRowRevenue', `+${Number(c.salesPriceKrw).toLocaleString()} KRW`);
    setTxt('calcRowCogs', `-${Number(c.cogsKrw).toLocaleString()} KRW (${c.cogs1688Cny} CNY)`);
    const commPct = Math.round(((econ.platformCommissionRate !== undefined ? econ.platformCommissionRate : 0.11)) * 100);
    setTxt('calcRowFee', `-${Number(c.coupangFeeKrw).toLocaleString()} KRW (${commPct}%)`);
    setTxt('calcRowShip', `-${Number(c.shippingCostKrw).toLocaleString()} KRW (${c.shippingBasis === 'QUOTED' ? 'Báo giá' : 'Theo cân'})`);
    setTxt('calcRowCgf', `-${Number(c.cgfFeeKrw).toLocaleString()} KRW`);

    const badge = document.getElementById('calcVerdictBadge');
    if (badge) {
      badge.className = `px-3 py-1 rounded-full text-xs font-bold border ${c.badgeClass}`;
      badge.innerText = c.verdict === 'SUPER_WIN' ? '🔥 SIÊU PHẨM WIN (>35%)' :
                        c.verdict === 'GOOD_WIN' ? '✓ SẢN PHẨM TỐT' :
                        c.verdict === 'MODERATE' ? '⚡ TẠM ĐẠT' : '❌ BIÊN LÃI THẤP';
    }
  };

  [priceInput, cogsInput, weightInput, rateInput, shipInput, adInput, cgfCheckbox, returnRateInput, targetContribInput, ordersDayInput, settlementDaysInput]
    .filter(Boolean)
    .forEach(el => el.addEventListener('input', updateSim));

  if (btnSaveBaseline) {
    btnSaveBaseline.addEventListener('click', async () => {
      if (!currentSimulatorProduct) return;
      try {
        const salesPriceKrw = Number(priceInput.value) || 0;
        const cogs1688Cny = cogsInput.value.trim() !== '' ? Number(cogsInput.value) : null;
        const weightGram = weightInput.value.trim() !== '' ? Number(weightInput.value) : null;
        const exchangeRateCnyKrw = rateInput.value.trim() !== '' ? Number(rateInput.value) : null;
        const quotedShip = shipInput.value.trim() !== '' ? Number(shipInput.value) : null;
        const adCostPerOrderKrw = adInput.value.trim() !== '' ? Number(adInput.value) : null;
        const returnAllowanceRate = returnRateInput?.value.trim() !== '' ? Number(returnRateInput.value) : null;
        const targetContributionPct = Number(targetContribInput?.value || 15);
        const ordersPerDay = Number(ordersDayInput?.value || 10);
        const settlementCycleDays = Number(settlementDaysInput?.value || 30);
        const isCgf = Boolean(cgfCheckbox.checked);

        const econ = currentSimulatorProduct.economics || {};

        await window.KDropStorage.saveBaseline(currentSimulatorProduct.id, {
          targetSalesPriceKrw: salesPriceKrw,
          cogs1688Cny,
          exchangeRateCnyKrw,
          shippingCostKrw: quotedShip,
          weightGram,
          adCostPerOrderKrw,
          returnAllowanceMode: econ.returnAllowanceMode,
          returnAllowanceRate,
          returnAllowanceKrw: econ.returnAllowanceKrw,
          targetContributionPct,
          ordersPerDay,
          settlementCycleDays,
          fulfillmentModel: isCgf ? 'ROCKET_GROWTH' : (econ.fulfillmentModel || 'BUYING_PER_ORDER'),
          platformCommissionRate: econ.platformCommissionRate,
          buyingAgentFeeMode: econ.buyingAgentFeeMode,
          buyingAgentFeeKrw: econ.buyingAgentFeeKrw,
          buyingAgentFeeRate: econ.buyingAgentFeeRate,
          otherCostPerOrderKrw: econ.otherCostPerOrderKrw,
          dimensions: econ.dimensions
        });

        alert(`✓ Đã lưu các tham số này thành kịch bản cơ sở cho sản phẩm "${currentSimulatorProduct.titleKr}"!`);
        await loadData();
        const refreshed = allProducts.find(item => String(item.id) === String(currentSimulatorProduct.id) || String(item.productId) === String(currentSimulatorProduct.id));
        if (refreshed) {
          currentSimulatorProduct = refreshed;
          inspectProduct(refreshed.id, false);
        }
      } catch (err) {
        alert('Lỗi lưu kịch bản cơ sở: ' + err.message);
      }
    });
  }

  updateSim();
}

function openSimulatorForProduct(productId) {
  const p = allProducts.find(item => String(item.id) === String(productId) || String(item.productId) === String(productId) || String(item.id) === 'coupang_' + productId);
  if (!p) return;
  currentSimulatorProduct = p;

  document.querySelector('[data-tab="tabCalculator"]')?.click();

  const titleEl = document.getElementById('calcLoadedProdTitle');
  if (titleEl) titleEl.innerText = `Đang mô phỏng cho: ${p.titleKr} (Thay đổi tại đây không ảnh hưởng cơ sở cho đến khi lưu)`;

  const btnSave = document.getElementById('btnSaveAsBaseline');
  if (btnSave) btnSave.classList.remove('hidden');

  const priceInput = document.getElementById('calcPriceKrw');
  const cogsInput = document.getElementById('calcCogsCny');
  const weightInput = document.getElementById('calcWeight');
  const rateInput = document.getElementById('calcExchangeRate');
  const shipInput = document.getElementById('calcQuotedShip');
  const adInput = document.getElementById('calcAdCost');
  const cgfCheckbox = document.getElementById('calcIsCgf');
  const returnRateInput = document.getElementById('calcReturnRate');
  const targetContribInput = document.getElementById('calcTargetContrib');
  const ordersDayInput = document.getElementById('calcOrdersDay');
  const settlementDaysInput = document.getElementById('calcSettlementDays');

  if (priceInput) priceInput.value = (p.economics?.targetSalesPriceKrw !== undefined && p.economics?.targetSalesPriceKrw !== null) ? p.economics.targetSalesPriceKrw : (p.salesPriceKrw || 15000);
  if (cogsInput) cogsInput.value = (p.sourcingDossier?.cogs1688Cny !== undefined && p.sourcingDossier?.cogs1688Cny !== null) ? p.sourcingDossier.cogs1688Cny : '';
  if (weightInput) weightInput.value = (p.economics?.weightGram !== undefined && p.economics?.weightGram !== null) ? p.economics.weightGram : '';
  if (rateInput) rateInput.value = (p.economics?.exchangeRateCnyKrw !== undefined && p.economics?.exchangeRateCnyKrw !== null) ? p.economics.exchangeRateCnyKrw : '';
  if (shipInput) shipInput.value = (p.economics?.shippingCostKrw !== undefined && p.economics?.shippingCostKrw !== null) ? p.economics.shippingCostKrw : '';
  if (adInput) adInput.value = (p.economics?.adCostPerOrderKrw !== undefined && p.economics?.adCostPerOrderKrw !== null) ? p.economics.adCostPerOrderKrw : '';
  if (returnRateInput) returnRateInput.value = (p.economics?.returnAllowanceRate !== undefined && p.economics?.returnAllowanceRate !== null) ? p.economics.returnAllowanceRate : '';
  if (targetContribInput) targetContribInput.value = (p.economics?.targetContributionPct !== undefined && p.economics?.targetContributionPct !== null) ? p.economics.targetContributionPct : 15;
  if (ordersDayInput) ordersDayInput.value = (p.economics?.ordersPerDay !== undefined && p.economics?.ordersPerDay !== null) ? p.economics.ordersPerDay : 10;
  if (settlementDaysInput) settlementDaysInput.value = (p.economics?.settlementCycleDays !== undefined && p.economics?.settlementCycleDays !== null) ? p.economics.settlementCycleDays : 30;

  // R08: Tách biệt hoàn toàn mô hình vận hành CGF với cờ đối thủ Coupang
  if (cgfCheckbox) cgfCheckbox.checked = p.economics?.fulfillmentModel === 'ROCKET_GROWTH';

  priceInput?.dispatchEvent(new Event('input'));
}

// 8. BACKUP & RESTORE
function initBackupAndImport() {
  // Export Versioned Backup
  document.getElementById('btnExportJson')?.addEventListener('click', async () => {
    try {
      const backupObj = await window.KDropStorage.exportBackup();
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupObj, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `kdrop_backup_v2_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (err) {
      alert('Lỗi xuất dữ liệu: ' + err.message);
    }
  });

  // Import Modal
  const modal = document.getElementById('importModal');
  const btnOpen = document.getElementById('btnOpenImportModal');
  const btnClose = document.getElementById('btnCloseImportModal');
  const btnCancel = document.getElementById('btnCancelImport');
  const btnConfirm = document.getElementById('btnConfirmImport');
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const nicheInput = document.getElementById('importNicheName');

  let uploadedFile = null;
  if (btnOpen) btnOpen.addEventListener('click', () => {
    modal.classList.remove('hidden');
    nicheInput.focus();
  });
  const closeModal = () => {
    modal.classList.add('hidden');
    uploadedFile = null;
    fileInput.value = '';
    dropZone.querySelector('p').innerText = 'Bấm để chọn file JSON';
    btnOpen.focus();
  };
  modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
  modal.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeModal();
    if (event.key === 'Tab') {
      const controls = Array.from(modal.querySelectorAll('button, input, [tabindex="0"]')).filter(el => !el.disabled && el.getClientRects().length);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  if (btnClose) btnClose.addEventListener('click', closeModal);
  if (btnCancel) btnCancel.addEventListener('click', closeModal);

  if (dropZone) {
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.click(); }
    });
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        uploadedFile = e.target.files[0];
        dropZone.querySelector('p').innerText = `Đã chọn: ${uploadedFile.name}`;
      }
    });
  }

  if (btnConfirm) {
    btnConfirm.addEventListener('click', async () => {
      if (!uploadedFile) {
        alert('Vui lòng chọn file JSON để nạp!');
        return;
      }

      try {
        const text = await uploadedFile.text();
        const parsed = JSON.parse(text);

        const count = await window.KDropStorage.importBackup(
          parsed,
          'custom_' + Date.now(),
          nicheInput.value.trim() || 'Danh mục nạp mới'
        );

        alert(`✓ Đã nạp thành công ${count} sản phẩm vào K-Drop Studio!`);
        closeModal();
        await loadData();
      } catch (err) {
        alert('Lỗi đọc file JSON: ' + err.message);
      }
    });
  }
}

// 9. EVENT DELEGATION: KHÔNG DÙNG INLINE HANDLERS
function initEventDelegation() {
  document.getElementById('btnPreviousPage').addEventListener('click', () => goToProductPage(pagination.page - 1));
  document.getElementById('btnNextPage').addEventListener('click', () => goToProductPage(pagination.page + 1));
  document.getElementById('pageNumber').addEventListener('change', event => goToProductPage(Number(event.target.value)));
  document.getElementById('pageSizeSelect').addEventListener('change', event => {
    const size = Number(event.target.value);
    if (![10, 20, 50].includes(size)) return;
    pagination.pageSize = size;
    goToProductPage(1);
  });
  // Navigation tabs
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => {
        t.classList.remove('active');
        t.removeAttribute('aria-current');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-current', 'page');

      const target = tab.getAttribute('data-tab');
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
      document.getElementById(target)?.classList.remove('hidden');

      if (target === 'tabInspector' && selectedProduct) {
        inspectProduct(selectedProduct.id, false);
      }
    });
  });

  // Search input
  document.getElementById('searchInput')?.addEventListener('input', (e) => {
    currentFilters.search = e.target.value.trim();
    applyFilters();
  });

  // Niche select
  document.getElementById('nicheSelect')?.addEventListener('change', (e) => {
    currentFilters.niche = e.target.value;
    applyFilters();
  });

  // Sort select
  document.getElementById('sortSelect')?.addEventListener('change', (e) => {
    currentFilters.sort = e.target.value;
    applyFilters();
  });

  document.getElementById('btnResetFilters')?.addEventListener('click', resetFilters);
  document.addEventListener('click', event => {
    if (event.target.closest('[data-action="reset-filters"]')) resetFilters();
    if (event.target.closest('[data-action="reload-data"]')) loadData();
  });
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.target.closest('input, textarea, select, [contenteditable="true"]') && !document.getElementById('tabRadar').classList.contains('hidden') && document.getElementById('importModal').classList.contains('hidden') && document.getElementById('dossierModal').classList.contains('hidden')) {
      event.preventDefault(); document.getElementById('searchInput').focus();
    }
  });
  document.getElementById('productsTableBody').addEventListener('error', event => {
    if (event.target.matches('.product-thumb') && !event.target.dataset.fallback) {
      event.target.dataset.fallback = 'true'; event.target.src = '../icons/product-placeholder.svg';
    }
  }, true);

  // Eligibility filter buttons
  document.querySelectorAll('.elig-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.elig-filter-btn').forEach(b => b.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', 'true');
      currentFilters.elig = btn.getAttribute('data-elig') || 'ALL';
      applyFilters();
    });
  });

  // Buybox buttons
  document.querySelectorAll('.buybox-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.buybox-filter-btn').forEach(b => b.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', 'true');
      currentFilters.buybox = btn.getAttribute('data-buybox') || 'ALL';
      applyFilters();
    });
  });

  // Tier buttons
  document.querySelectorAll('.tier-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tier-filter-btn').forEach(b => b.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', 'true');
      currentFilters.tier = btn.getAttribute('data-tier') || 'ALL';
      applyFilters();
    });
  });

  // Price buttons
  document.querySelectorAll('.price-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.price-filter-btn').forEach(b => b.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', 'true');
      currentFilters.price = btn.getAttribute('data-price') || 'ALL';
      applyFilters();
    });
  });

  // KC safe toggle
  document.getElementById('chkKcSafeOnly')?.addEventListener('change', (e) => {
    currentFilters.kcSafeOnly = e.target.checked;
    applyFilters();
  });

  // EVENT DELEGATION TRÊN BẢNG SẢN PHẨM (productsTableBody)
  const tbody = document.getElementById('productsTableBody');
  if (tbody) {
    // 1. Thao tác nút bấm
    tbody.addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;

      const id = btn.getAttribute('data-id');
      if (!id) return;

      if (btn.classList.contains('btn-inspect')) {
        inspectProduct(id);
      } else if (btn.classList.contains('btn-dossier') || btn.classList.contains('btn-open-dossier')) {
        openDossierModal(id);
      } else if (btn.classList.contains('btn-simulate')) {
        openSimulatorForProduct(id);
      } else if (btn.classList.contains('btn-watchlist')) {
        if (window.KDropStorage) {
          const updated = await window.KDropStorage.toggleWatchlist(id);
          if (updated) {
            const idx = allProducts.findIndex(p => p.id === id);
            if (idx !== -1) allProducts[idx].isWatchlist = updated.isWatchlist;
            applyFilters();
            renderWatchlist();
            const count = allProducts.filter(p => p.isWatchlist).length;
            const cntEl = document.getElementById('statWatchlistCount');
            if (cntEl) cntEl.innerText = count;
          }
        }
      }
    });

    // 2. Chỉnh sửa giá vốn 1688 trực tiếp trên bảng
    tbody.addEventListener('change', async (e) => {
      if (e.target.classList.contains('input-cogs-cny')) {
        const id = e.target.getAttribute('data-id');
        const rawVal = e.target.value != null ? e.target.value.trim() : '';
        const val = rawVal === '' ? null : parseFloat(rawVal);
        if (!id) return;

        try {
          if (window.KDropStorage) {
            const updated = await window.KDropStorage.updateProductCogs(id, val, 'MANUAL');
            if (updated) {
              const idx = allProducts.findIndex(p => p.id === id);
              if (idx !== -1) allProducts[idx] = updated;
              applyFilters();
            }
          }
        } catch (err) {
          alert('Lỗi cập nhật giá vốn: ' + err.message);
        }
      }
    });
  }

  // EVENT DELEGATION TRÊN WATCHLIST CONTAINER
  const wlContainer = document.getElementById('watchlistContainer');
  if (wlContainer) {
    wlContainer.addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;

      const id = btn.getAttribute('data-id');
      if (!id) return;

      if (btn.classList.contains('btn-remove-watchlist')) {
        if (window.KDropStorage) {
          await window.KDropStorage.toggleWatchlist(id);
          const idx = allProducts.findIndex(p => p.id === id);
          if (idx !== -1) allProducts[idx].isWatchlist = false;
          applyFilters();
          renderWatchlist();
          const count = allProducts.filter(p => p.isWatchlist).length;
          const cntEl = document.getElementById('statWatchlistCount');
          if (cntEl) cntEl.innerText = count;
        }
      } else if (btn.classList.contains('btn-open-dossier')) {
        openDossierModal(id);
      }
    });
  }

  // LẮNG NGHE STORAGE BROADCAST TỪ CÁC VIEW KHÁC HOẶC BACKGROUND
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === 'KDROP_STORAGE_UPDATED') {
        loadData();
      }
    });
  }
}

// STARTUP
document.addEventListener('DOMContentLoaded', async () => {
  initEventDelegation();
  initDossierModal();
  initCalculator();
  initBackupAndImport();
  await loadData();
  initIcons();
});
