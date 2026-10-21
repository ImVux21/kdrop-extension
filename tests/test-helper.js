/**
 * Test Helper for K-Drop Studio Regression Suite
 */
const assert = require('node:assert');

function setupTestStorage(initialData = {}) {
  globalThis.__kdrop_test_storage__ = JSON.parse(JSON.stringify(initialData));
  return globalThis.__kdrop_test_storage__;
}

function clearTestStorage() {
  globalThis.__kdrop_test_storage__ = {};
}

module.exports = {
  assert,
  setupTestStorage,
  clearTestStorage
};
