const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('CSP Compliance: zero inline event handlers in HTML and JS source files', () => {
  const targetFiles = [
    'ui/dashboard.html',
    'ui/sidepanel.html',
    'ui/js/dashboard.js',
    'ui/js/sidepanel.js',
    'content/inpage_badge.js',
    'content/coupang_extractor.js'
  ];

  const inlineEventRegex = /\bon[a-zA-Z]+\s*=/i;

  targetFiles.forEach(relPath => {
    const fullPath = path.join(__dirname, '..', relPath);
    const content = fs.readFileSync(fullPath, 'utf8');

    const lines = content.split('\n');
    lines.forEach((line, index) => {
      // Bỏ qua comment
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return;

      const match = line.match(inlineEventRegex);
      if (match) {
        assert.fail(`Phát hiện inline event handler "${match[0]}" tại ${relPath} dòng ${index + 1}: ${line}`);
      }
    });
  });
});
