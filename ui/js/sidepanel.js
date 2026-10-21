/**
 * SIDEPANEL JAVASCRIPT CONTROLLER (VERSION 2)
 * Tuân thủ CSP nghiêm ngặt: không dùng inline event handler
 */

let allProducts = [];

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

async function loadData() {
  if (window.KDropStorage) {
    allProducts = await window.KDropStorage.getAllProducts();
    updateStats();
    renderList();
  }
}

function updateStats() {
  const countEl = document.getElementById('sideCount');
  if (countEl) countEl.innerText = allProducts.length;

  let ready = 0, needs = 0, notElig = 0;
  allProducts.forEach(p => {
    const status = p.trialEligibility?.status;
    if (status === 'ready_for_trial') ready++;
    else if (status === 'not_eligible') notElig++;
    else needs++;
  });

  const rEl = document.getElementById('sideStatReady');
  if (rEl) rEl.innerText = ready;
  const nEl = document.getElementById('sideStatNeeds');
  if (nEl) nEl.innerText = needs;
  const eEl = document.getElementById('sideStatNotEligible');
  if (eEl) eEl.innerText = notElig;
}

function renderList() {
  const container = document.getElementById('sideProductsList');
  if (!container) return;

  const query = (document.getElementById('sideSearchInput')?.value || '').toLowerCase().trim();
  const filtered = allProducts.filter(p => {
    if (!query) return true;
    return (p.titleKr && p.titleKr.toLowerCase().includes(query)) ||
           (p.materialIntel?.precisionQueryCn && p.materialIntel.precisionQueryCn.toLowerCase().includes(query));
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 text-slate-400">
        Không tìm thấy sản phẩm nào.
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.slice(0, 30).map(p => {
    const wpi = p.wpi || {};
    const fin = p.financial || {};
    const mat = p.materialIntel || {};
    const elig = p.trialEligibility || {};

    let eligBadge = '';
    if (elig.status === 'ready_for_trial') {
      eligBadge = '<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-600 text-white">✓ Đủ điều kiện</span>';
    } else if (elig.status === 'not_eligible') {
      eligBadge = '<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-600 text-white">✕ Chưa đạt</span>';
    } else {
      eligBadge = '<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500 text-white">⚠️ Cần xác minh</span>';
    }

    const safeThumb = sanitizeUrl(p.thumbnailUrl || '');
    const safeProductUrl = sanitizeUrl(p.productUrl || '');
    const safeSearch1688 = sanitizeUrl(mat.searchUrl1688 || '#');

    return `
      <div class="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-xs space-y-2">
        <div class="flex items-start space-x-2">
          <img src="${safeThumb}" 
               class="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0 side-prod-thumb"
               alt="${escapeHtml(p.titleKr)}">
          <div class="min-w-0 flex-1">
            <div class="flex items-center space-x-1 flex-wrap gap-1">
              ${eligBadge}
              <span class="px-1.5 py-0.2 rounded text-[10px] font-bold ${wpi.badgeColor || 'bg-slate-100'}">
                WPI: ${wpi.score !== null ? `${wpi.score}đ` : 'n/a'}
              </span>
              ${!p.isRocket ? '<span class="text-[9px] px-1 bg-amber-50 text-amber-700 font-bold rounded">Wing</span>' : ''}
            </div>
            <a href="${safeProductUrl}" target="_blank" class="block font-medium text-slate-900 hover:text-coupang-blue line-clamp-2 mt-0.5 leading-snug" title="${escapeHtml(p.titleKr)}">
              ${escapeHtml(p.titleKr)}
            </a>
          </div>
        </div>

        <div class="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px]">
          <div>
            <span class="font-bold text-slate-900">${Number(p.salesPriceKrw || 0).toLocaleString()} ₩</span>
            <span class="text-emerald-600 font-bold ml-1">(${fin.netMarginPct || 0}%)</span>
          </div>
          <a href="${safeSearch1688}" target="_blank" class="px-2 py-0.5 bg-alibaba-orange text-white rounded font-bold hover:opacity-90">
            Xưởng 1688 ↗
          </a>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.side-prod-thumb').forEach(img => {
    img.addEventListener('error', () => {
      img.src = 'https://via.placeholder.com/48';
    });
  });

  initIcons();
}

// Mini Calculator
function initMiniCalculator() {
  const pInput = document.getElementById('sideCalcPrice');
  const cInput = document.getElementById('sideCalcCogs');
  const wInput = document.getElementById('sideCalcWeight');
  const rInput = document.getElementById('sideCalcRate');

  if (!pInput || !cInput) return;

  const update = () => {
    if (!window.KDropFeeCalculator) return;
    const price = Number(pInput.value) || 0;
    const cogs = Number(cInput.value) || 0;
    const weight = Number(wInput.value) || 250;
    const rate = Number(rInput.value) || 190;

    const fin = window.KDropFeeCalculator.calculateProfit({
      salesPriceKrw: price,
      cogs1688Cny: cogs,
      weightGram: weight
    }, { exchangeRateCnyKrw: rate });

    const u = window.KDropFeeCalculator.calculateUnitEconomics({
      salesPriceKrw: price,
      cogs1688Cny: cogs,
      exchangeRateCnyKrw: rate,
      shippingCostKrw: fin.shippingCostKrw
    });

    document.getElementById('sideCalcMargin').innerText = `${fin.netProfitKrw >= 0 ? '+' : ''}${Number(fin.netProfitKrw).toLocaleString()} ₩ (${fin.netMarginPct}%)`;
    document.getElementById('sideCalcPreAd').innerText = `+${Number(u.preAdMarginKrw).toLocaleString()} ₩ (${u.preAdMarginPct}%)`;
    document.getElementById('sideCalcRoas').innerText = `${u.breakevenRoasPct}% (${u.breakevenRoasRatio}x)`;
    document.getElementById('sideCalcMaxCpa').innerText = `${Number(u.maxAllowedCpaKrw).toLocaleString()} ₩`;
  };

  [pInput, cInput, wInput, rInput].forEach(el => el.addEventListener('input', update));
  update();
}

// Tab navigation & Actions in Sidepanel
function initTabs() {
  document.querySelectorAll('.side-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.side-tab-btn').forEach(b => {
        b.classList.remove('border-coupang-blue', 'text-coupang-blue');
        b.classList.add('border-transparent', 'text-slate-500');
      });
      btn.classList.add('border-coupang-blue', 'text-coupang-blue');
      btn.classList.remove('border-transparent', 'text-slate-500');

      const target = btn.getAttribute('data-target');
      document.getElementById('panelList')?.classList.toggle('hidden', target !== 'panelList');
      document.getElementById('panelCalc')?.classList.toggle('hidden', target !== 'panelCalc');
    });
  });

  document.getElementById('btnOpenDashboardTab')?.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('ui/dashboard.html') });
  });

  document.getElementById('sideSearchInput')?.addEventListener('input', renderList);

  // Scan current tab
  let isSidepanelScanInProgress = false;
  let stopPageScan = false;
  document.getElementById('btnScanCurrentTab')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnScanCurrentTab');
    if (isSidepanelScanInProgress) return;
    isSidepanelScanInProgress = true;
    btn.disabled = true;
    btn.innerHTML = '<span>⏳ Đang quét trang Coupang...</span>';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      let isCoupang = false;
      try {
        const url = new URL(tab?.url || '');
        isCoupang = /^https?:$/.test(url.protocol) && (url.hostname === 'coupang.com' || url.hostname.endsWith('.coupang.com'));
      } catch (_) {}
      if (!tab || !isCoupang) {
        alert('Vui lòng mở tab chứa trang sản phẩm hoặc danh sách của Coupang trước khi quét!');
        return;
      }

      let execResults;
      try {
        execResults = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            if (!window.KDropCoupangExtractor) {
              return {
                status: 'CONTEXT_MISSING',
                message: 'Không tìm thấy bộ quét K-Drop trên trang Coupang (ngữ cảnh extension có thể đã cũ). Vui lòng tải lại trang Coupang (F5) và thử lại!'
              };
            }
            return window.KDropCoupangExtractor.scanCurrentPage();
          }
        });
      } catch (scriptErr) {
        alert('Không thể kết nối hoặc thực thi bộ quét trên trang Coupang (ngữ cảnh extension có thể đã cũ). Vui lòng tải lại trang Coupang (F5) và thử lại!');
        return;
      }

      const report = execResults && execResults[0] ? execResults[0].result : null;
      if (!report) {
        alert('Không nhận được phản hồi từ bộ quét Coupang. Vui lòng tải lại trang và thử lại.');
        return;
      }

      if (report.status === 'CONTEXT_MISSING') {
        alert(report.message);
        return;
      }

      if (report.status !== 'SUCCESS' || !report.items || report.items.length === 0) {
        alert(report.message);
        return;
      }

      try {
        const count = await window.KDropStorage.batchImportProducts(report.items, 'active_tab', tab.title || 'Tab Coupang');
        alert(`Đã quét và cập nhật thành công ${count} sản phẩm!`);
        await loadData();
      } catch (storageErr) {
        alert('Lỗi lưu trữ: ' + storageErr.message);
      }
    } catch (err) {
      alert('Lỗi quét trang: ' + err.message);
    } finally {
      isSidepanelScanInProgress = false;
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="scan" class="w-4 h-4"></i><span>Quét Coupang Trang Này ➔ Nạp Ngay</span>';
      initIcons();
    }
  });

  const scanPagesButton = document.getElementById('btnScanPages');
  const stopPagesButton = document.getElementById('btnStopScanPages');
  const pageStatus = document.getElementById('scanPagesStatus');
  const setPageStatus = text => { if (pageStatus) pageStatus.textContent = text; };
  stopPagesButton?.addEventListener('click', () => {
    stopPageScan = true;
    setPageStatus('Đang dừng sau thao tác hiện tại; các trang đã lưu được giữ lại.');
  });

  async function readListingPage(tabId, expectedUrl) {
    const deadline = Date.now() + 20000;
    let lastMessage = 'Trang chưa tải xong danh sách sản phẩm.';
    while (Date.now() < deadline && !stopPageScan) {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === 'complete') {
        if (new URL(tab.url).href !== new URL(expectedUrl).href) throw new Error('Tab Coupang đã chuyển sang trang khác. Hãy bắt đầu lại từ danh sách cần quét.');
        const [result] = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const extractor = window.KDropCoupangExtractor;
            return extractor ? { report: extractor.scanCurrentPage(), pagination: extractor.getPaginationState?.() } : null;
          }
        });
        const value = result?.result;
        if (value?.report?.status === 'SUCCESS') return value;
        lastMessage = value?.report?.message || 'Không thấy bộ quét phiên bản mới. Hãy Reload extension rồi F5 trang Coupang.';
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    if (stopPageScan) return null;
    throw new Error(lastMessage);
  }

  scanPagesButton?.addEventListener('click', async () => {
    if (isSidepanelScanInProgress) return;
    const limit = Number(document.getElementById('scanPageLimit')?.value);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) return;
    isSidepanelScanInProgress = true;
    stopPageScan = false;
    scanPagesButton.disabled = true;
    stopPagesButton.disabled = false;
    document.getElementById('btnScanCurrentTab').disabled = true;
    const visitedUrls = new Set();
    const observedIds = new Set();
    let pagesSaved = 0;
    let completion = '';
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) throw new Error('Hãy mở trang danh mục hoặc tìm kiếm Coupang có phân trang trước khi bắt đầu.');
      const url = new URL(tab?.url || '');
      if (!/^https?:$/.test(url.protocol) || !(url.hostname === 'coupang.com' || url.hostname.endsWith('.coupang.com')) || !/^\/np\/(?:categories\/\d+|search)\/?$/.test(url.pathname)) {
        throw new Error('Hãy mở trang danh mục hoặc tìm kiếm Coupang có phân trang trước khi bắt đầu.');
      }
      let currentUrl = url.href;
      while (pagesSaved < limit && !stopPageScan) {
        if (visitedUrls.has(currentUrl)) throw new Error('Link phân trang bị lặp; lượt quét đã dừng.');
        visitedUrls.add(currentUrl);
        setPageStatus(`Đang đọc trang ${new URL(currentUrl).searchParams.get('page') || 1} · đã lưu ${pagesSaved} trang / ${observedIds.size} sản phẩm.`);
        const page = await readListingPage(tab.id, currentUrl);
        if (!page || stopPageScan) break;
        await window.KDropStorage.batchImportProducts(page.report.items, 'active_tab', tab.title || 'Tab Coupang');
        pagesSaved++;
        page.report.items.forEach(item => observedIds.add(String(item.productId)));
        const pagination = page.pagination;
        if (!pagination?.supported) {
          completion = 'Không nhận diện được phân trang tiếp theo; đã lưu trang hiện tại.';
          break;
        }
        if (!pagination.nextUrl) {
          completion = 'Đã đến trang cuối của danh sách phân trang.';
          break;
        }
        if (pagesSaved >= limit || stopPageScan) break;
        // Keep the operator's tab, filters and sorting; navigate only to the observed next-page link.
        currentUrl = pagination.nextUrl;
        await new Promise(resolve => setTimeout(resolve, 800));
        if (!stopPageScan) await chrome.tabs.update(tab.id, { url: currentUrl });
      }
      if (stopPageScan) completion = 'Đã dừng theo yêu cầu.';
      else if (!completion) completion = 'Đã đạt giới hạn số trang; có thể bắt đầu lượt tiếp theo từ trang kế tiếp.';
      setPageStatus(`${completion} Đã lưu ${pagesSaved} trang, ${observedIds.size} sản phẩm khác nhau.`);
      await loadData();
    } catch (error) {
      setPageStatus(`Đã dừng: ${error.message} Giữ lại ${pagesSaved} trang đã lưu, ${observedIds.size} sản phẩm.`);
    } finally {
      isSidepanelScanInProgress = false;
      scanPagesButton.disabled = false;
      stopPagesButton.disabled = true;
      document.getElementById('btnScanCurrentTab').disabled = false;
    }
  });

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === 'KDROP_STORAGE_UPDATED') {
        loadData();
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const versionEl = document.getElementById('extensionVersion');
  if (versionEl) versionEl.textContent = `v${chrome.runtime.getManifest().version}`;
  initTabs();
  initMiniCalculator();
  await loadData();
  initIcons();
});
