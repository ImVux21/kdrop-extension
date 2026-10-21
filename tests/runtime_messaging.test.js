const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../storage/storageRepository.js'), 'utf8');

function client(respond) {
  const calls = [];
  const runtime = {
    id: 'test-extension',
    getManifest: () => ({ version: '1.0.1' }),
    sendMessage(message, callback) {
      calls.push(message.action);
      const reply = respond(message, calls.length);
      if (reply.throw) throw new Error(reply.throw);
      runtime.lastError = reply.error ? { message: reply.error } : undefined;
      callback(reply.response);
      runtime.lastError = undefined;
    }
  };
  const context = vm.createContext({ chrome: { runtime }, window: {}, console, setTimeout, clearTimeout });
  context.self = context;
  vm.runInContext(source, context);
  return { storage: context.KDropStorage, calls };
}

test('Batch import recovers once after the background message port disconnects', async () => {
  const { storage, calls } = client((message, n) => n === 1
    ? { error: 'The message port closed before a response was received.' }
    : { response: message.action === 'KDROP_HEALTH_CHECK' ? { storageReady: true, version: '1.0.1' } : { result: 60 } });
  assert.equal(await storage.batchImportProducts([{ productId: '175498077' }]), 60);
  assert.deepEqual(calls, ['KDROP_MUTATE', 'KDROP_HEALTH_CHECK', 'KDROP_MUTATE']);
});

test('An unavailable background gives extension reload guidance, not a raw port error', async () => {
  const { storage } = client(() => ({ error: 'The message port closed before a response was received.' }));
  await assert.rejects(storage.batchImportProducts([]), /chrome:\/\/extensions.*Reload.*F5/);
});

test('A real storage rejection is not retried or hidden', async () => {
  const { storage, calls } = client(() => ({ response: { error: 'VERIFY_WRITE_FAILED' } }));
  await assert.rejects(storage.batchImportProducts([]), /VERIFY_WRITE_FAILED/);
  assert.deepEqual(calls, ['KDROP_MUTATE']);
});

test('A stale content script gives extension reload guidance after synchronous runtime failure', async () => {
  const { storage } = client(() => ({ throw: 'Extension context invalidated.' }));
  await assert.rejects(storage.batchImportProducts([]), /chrome:\/\/extensions.*Reload.*F5/);
});

test('Non-idempotent mutations are never retried after a lost response', async () => {
  const { storage, calls } = client(() => ({ error: 'The message port closed before a response was received.' }));
  await assert.rejects(storage.toggleWatchlist('coupang_123'), /chrome:\/\/extensions/);
  assert.deepEqual(calls, ['KDROP_MUTATE']);
});

test('A real storage failure on the recovery attempt stays visible', async () => {
  const { storage, calls } = client((message, n) => n === 1
    ? { error: 'The message port closed before a response was received.' }
    : { response: message.action === 'KDROP_HEALTH_CHECK' ? { storageReady: true } : { error: 'VERIFY_RETRY_WRITE_FAILED' } });
  await assert.rejects(storage.batchImportProducts([]), /VERIFY_RETRY_WRITE_FAILED/);
  assert.deepEqual(calls, ['KDROP_MUTATE', 'KDROP_HEALTH_CHECK', 'KDROP_MUTATE']);
});
