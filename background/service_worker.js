/**
 * BACKGROUND SERVICE WORKER (MANIFEST V3)
 * Quản lý vòng đời extension, mở Side Panel và điều hướng Dashboard
 */

importScripts(
  '../core/kcRules.js',
  '../core/materialEngine.js',
  '../core/feeCalculator.js',
  '../core/winAlgorithm.js',
  '../storage/storageRepository.js'
);

chrome.runtime.onInstalled.addListener(async () => {
  console.log('[K-Drop Studio] Extension installed/updated');

  // Khởi tạo cơ sở dữ liệu nếu lần đầu cài
  if (self.KDropStorage) {
    await self.KDropStorage.initDatabase();
  }

  // Cấu hình Side Panel mở khi click icon extension
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
      console.warn('Không thể setPanelBehavior:', err);
    });
  }
});

function relayToTabs(msg) {
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({}, (tabs) => {
      if (chrome.runtime && chrome.runtime.lastError) return;
      if (!Array.isArray(tabs)) return;
      tabs.forEach(tab => {
        if (tab && tab.id) {
          try {
            chrome.tabs.sendMessage(tab.id, msg, () => {
              const _ = chrome.runtime.lastError;
            });
          } catch (_) {}
        }
      });
    });
  }
}

// Xử lý message từ Content Script hoặc UI
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.action !== 'string') return;

  if (message.action === 'KDROP_HEALTH_CHECK') {
    sendResponse({ storageReady: Boolean(self.KDropStorage), version: chrome.runtime.getManifest().version });
    return;
  }
  if (message.action === 'KDROP_STORAGE_UPDATED') {
    relayToTabs(message);
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'KDROP_MUTATE') {
    const { mutationType, args } = message;
    if (self.KDropStorage && typeof self.KDropStorage[mutationType] === 'function') {
      Promise.resolve().then(() => self.KDropStorage[mutationType](...(args || [])))
        .then(result => {
          sendResponse({ result });
          relayToTabs({
            action: 'KDROP_STORAGE_UPDATED',
            mutationType,
            timestamp: new Date().toISOString()
          });
        })
        .catch(err => sendResponse({ error: err.message || String(err) }));
      return true; // Phản hồi bất đồng bộ
    } else {
      sendResponse({ error: `Hàm mutation không tồn tại: ${mutationType}` });
      return true;
    }
  }

  if (message.action === 'OPEN_DASHBOARD') {
    chrome.tabs.create({ url: chrome.runtime.getURL('ui/dashboard.html') });
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'OPEN_SIDEPANEL') {
    if (chrome.sidePanel && chrome.sidePanel.open && sender.tab) {
      chrome.sidePanel.open({ tabId: sender.tab.id });
    }
    sendResponse({ success: true });
    return true;
  }
});
