/**
 * IN-PAGE BADGE & FLOATING ACTION WIDGET
 * Hiển thị widget phân tích trực tiếp trên trang Coupang cho người dùng
 * Tuân thủ CSP: không sử dụng inline event handler
 */

(function() {
  function initFloatingWidgets() {
    const isProductPage = window.location.pathname.includes('/vp/products/');

    if (isProductPage) {
      renderProductPageWidget();
    } else {
      renderListingPageBar();
    }
  }

  // 1. Widget trên trang chi tiết sản phẩm (R09: lấy hồ sơ chính thức đã lưu và làm mới khi có broadcast)
  async function renderProductPageWidget() {
    const targetContainer = document.querySelector('.prod-buy-header, .prod-price-container, .prod-buy');
    if (!targetContainer) return;

    const rawProd = window.KDropCoupangExtractor ? window.KDropCoupangExtractor.extractSingleProduct() : null;
    if (!rawProd) return;

    // R09: Truy vấn hồ sơ chính thức đã lưu của người vận hành từ storage
    let savedProd = null;
    if (window.KDropStorage && typeof window.KDropStorage.getProductById === 'function') {
      try {
        savedProd = await window.KDropStorage.getProductById(rawProd.productId);
      } catch (e) {
        console.warn('[K-Drop Widget] Không thể đọc hồ sơ đã lưu:', e);
      }
    }

    const isSaved = Boolean(savedProd);
    const prod = isSaved ? savedProd : (window.KDropStorage ? window.KDropStorage.enrichProduct(rawProd) : rawProd);

    const elig = prod.trialEligibility || { statusLabelVi: 'Cần xác minh', badgeClass: 'bg-amber-500 text-white', statusIcon: '⚠️' };
    const wpi = prod.wpi || { score: null, isProvisional: true, tierLabelVi: 'Tạm tính' };
    const kc = prod.kcSafety || { labelVi: 'Miễn trừ KC', level: 'LOW' };
    const mat = prod.materialIntel || { precisionQueryCn: prod.titleKr, searchUrl1688: '#' };

    const scoreDisplay = wpi.score !== null ? `${wpi.score}đ (${wpi.tierLabelVi})` : 'Chưa đủ điều kiện tính';
    const provisionalTag = (!isSaved || wpi.isProvisional)
      ? `<span style="font-size:10px; background:#fef3c7; color:#92400e; padding:1px 4px; border-radius:4px; margin-left:4px;">${isSaved ? '(Tạm tính)' : '(Chưa lưu - Tạm tính)'}</span>`
      : '';

    // Xóa widget cũ nếu đang vẽ lại (sau khi reload/broadcast)
    const existingWidget = document.getElementById('kdrop-detail-widget');
    if (existingWidget) existingWidget.remove();

    const widget = document.createElement('div');
    widget.id = 'kdrop-detail-widget';
    widget.style.cssText = 'background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:12px; margin:12px 0; font-family:sans-serif; box-shadow:0 1px 3px rgba(0,0,0,0.05);';

    widget.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f1f5f9; padding-bottom:8px; margin-bottom:8px;">
        <span style="font-weight:800; font-size:13px; color:#0074e9;">🚀 K-Drop Intelligence Inspector</span>
        <div style="display:flex; gap:4px; align-items:center;">
          <span style="font-size:11px; font-weight:bold; padding:2px 6px; border-radius:6px; ${elig.status === 'ready_for_trial' ? 'background:#ecfdf5; color:#059669; border:1px solid #a7f3d0;' : (elig.status === 'not_eligible' ? 'background:#fef2f2; color:#dc2626; border:1px solid #fecaca;' : 'background:#fffbeb; color:#d97706; border:1px solid #fde68a;')}">
            ${elig.statusIcon} ${elig.statusLabelVi}
          </span>
        </div>
      </div>

      <div style="font-size:12px; color:#334155; margin-bottom:8px; line-height:1.6;">
        <div>• <b>Hồ sơ lưu trữ:</b> <span style="font-weight:600; color:${isSaved ? '#059669' : '#d97706'};">${isSaved ? '✓ Đã có trong K-Drop Studio' : 'Chưa lưu (chỉ có dữ liệu DOM hiện tại)'}</span></div>
        <div>• <b>Điểm sàng lọc WPI:</b> ${scoreDisplay} ${provisionalTag}</div>
        <div>• <b>Chất liệu bóc tách:</b> ${mat.primaryMaterialVi || 'Vật liệu cơ bản'} ${mat.spec ? `(${mat.spec.labelVi})` : ''}</div>
        <div>• <b>Độ an toàn KC:</b> <span style="color:${kc.level === 'LOW' ? '#059669' : '#dc2626'}; font-weight:600;">${kc.labelVi}</span></div>
        <div>• <b>Từ khóa xưởng 1688:</b> <code style="background:#f1f5f9; padding:2px 4px; border-radius:4px; font-weight:bold;">${mat.precisionQueryCn}</code></div>
      </div>

      <div style="display:flex; gap:8px;">
        <a id="btnSearch1688Widget" target="_blank" style="text-decoration:none; display:inline-flex; align-items:center; background:#ea580c; color:#fff; border-radius:8px; padding:6px 12px; font-size:12px; font-weight:bold;">
          🔍 Tìm Xưởng 1688 Ngay
        </a>
        <button id="btnSaveToKDrop" style="cursor:pointer; border:none; background:${isSaved ? '#059669' : '#0074e9'}; color:#fff; border-radius:8px; padding:6px 12px; font-size:12px; font-weight:bold;">
          ${isSaved ? '✓ Đã Lưu Vào K-Drop' : '📥 Lưu Vào K-Drop Studio'}
        </button>
      </div>
    `;

    targetContainer.parentNode.insertBefore(widget, targetContainer.nextSibling);

    const link1688 = document.getElementById('btnSearch1688Widget');
    if (link1688 && mat.searchUrl1688 && (mat.searchUrl1688.startsWith('http:') || mat.searchUrl1688.startsWith('https:'))) {
      link1688.href = mat.searchUrl1688;
    }

    const btnSave = document.getElementById('btnSaveToKDrop');
    if (btnSave) {
      btnSave.addEventListener('click', async () => {
        if (window.KDropStorage) {
          try {
            await window.KDropStorage.saveProduct(rawProd);
            btnSave.innerText = '✓ Đã Lưu Vào K-Drop!';
            btnSave.style.background = '#059669';
            // Làm mới widget sau khi lưu
            setTimeout(() => {
              renderProductPageWidget();
            }, 500);
          } catch (err) {
            alert('Không thể lưu sản phẩm: ' + err.message);
          }
        }
      });
    }
  }

  // R09 & F09: Đăng ký lắng nghe thông báo cập nhật dữ liệu để đồng bộ hiển thị
  let refreshTimer = null;
  function triggerWidgetRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      const isProductPage = window.location.pathname.includes('/vp/products/');
      if (isProductPage) {
        renderProductPageWidget();
      }
    }, 50);
  }

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message && (message.action === 'KDROP_STORAGE_UPDATED' || message.action === 'PRODUCT_SAVED')) {
        triggerWidgetRefresh();
      }
    });
  }

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.kdrop_products) {
        triggerWidgetRefresh();
      }
    });
  }

  // Lắng nghe DOM đến muộn (late-rendered container)
  const isProductPage = window.location.pathname.includes('/vp/products/');
  const observer = new MutationObserver(() => {
    if (isProductPage) {
      if (document.getElementById('kdrop-detail-widget')) return;
      const targetContainer = document.querySelector('.prod-buy-header, .prod-price-container, .prod-buy');
      if (targetContainer) {
        renderProductPageWidget();
      }
    } else {
      if (document.getElementById('kdrop-floating-bar')) return;
      if (document.body) {
        renderListingPageBar();
      }
    }
  });
  if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  // 2. Thanh nổi trên trang danh mục / BSR Coupang
  function renderListingPageBar() {
    if (document.getElementById('kdrop-floating-bar')) return;

    const bar = document.createElement('div');
    bar.id = 'kdrop-floating-bar';
    bar.title = `K-Drop Studio v${chrome.runtime.getManifest().version}`;
    bar.innerHTML = `
      <div style="display:flex; background:#0f172a; color:#fff; border-radius:12px; overflow:hidden; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
        <button id="btnScrapeListing" class="kdrop-btn kdrop-btn-primary" style="border:none; cursor:pointer; background:#0074e9; color:#fff; font-weight:bold; padding:10px 16px; font-size:12px;">
          📥 Nạp Coupang Vào K-Drop Studio
        </button>
        <button id="btnOpenExtensionPanel" class="kdrop-btn" style="border:none; cursor:pointer; background:#1e293b; color:#fff; font-weight:bold; padding:10px 14px; font-size:12px;">
          ⚡ Mở K-Drop
        </button>
      </div>
    `;

    document.body.appendChild(bar);

    let isListingScrapeInProgress = false;
    document.getElementById('btnScrapeListing')?.addEventListener('click', async () => {
      const btn = document.getElementById('btnScrapeListing');
      if (isListingScrapeInProgress) return;
      isListingScrapeInProgress = true;
      btn.disabled = true;
      btn.innerText = '⏳ Đang quét sản phẩm...';

      try {
        if (!window.KDropCoupangExtractor) {
          alert('Không tìm thấy bộ quét K-Drop trên trang Coupang. Vui lòng tải lại trang (F5) và thử lại!');
          return;
        }

        const report = window.KDropCoupangExtractor.scanCurrentPage();
        if (report.status !== 'SUCCESS' || !report.items || report.items.length === 0) {
          alert(report.message);
          return;
        }

        if (window.KDropStorage) {
          try {
            const count = await window.KDropStorage.batchImportProducts(report.items, 'coupang_scrape', document.title);
            btn.innerText = `✓ Đã nạp ${count} sản phẩm!`;
            setTimeout(() => {
              btn.innerText = '📥 Nạp Coupang Vào K-Drop Studio';
            }, 3000);
          } catch (err) {
            alert('Lỗi lưu trữ sản phẩm: ' + err.message);
          }
        }
      } catch (err) {
        alert('Lỗi quét sản phẩm: ' + err.message);
      } finally {
        isListingScrapeInProgress = false;
        btn.disabled = false;
        if (!btn.innerText.includes('✓ Đã nạp')) {
          btn.innerText = '📥 Nạp Coupang Vào K-Drop Studio';
        }
      }
    });

    document.getElementById('btnOpenExtensionPanel')?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'OPEN_DASHBOARD' });
    });
  }

  // Chờ DOM load xong
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFloatingWidgets);
  } else {
    initFloatingWidgets();
  }
})();
