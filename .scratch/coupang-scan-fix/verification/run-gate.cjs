// Re-run the author's gate with only its external example.com dependency isolated.
// No production source or original test is changed.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const filename = path.resolve(__dirname, '../../../tests/installed_coupang_gate.cjs');
let source = fs.readFileSync(filename, 'utf8');
const original = 'context.setDefaultTimeout(15000);';
if (!source.includes(original)) throw new Error('Gate bootstrap changed; review wrapper');
source = source.replace(original, original + `
  await context.route('https://example.com/**', route => route.fulfill({status:200, contentType:'text/html', body:'<title>Unrelated page</title>'}));
  await context.route('https://thumbnail.coupang.com/**', route => route.abort());
`);
const gate = new Module(filename, module);
gate.filename = filename;
gate.paths = Module._nodeModulePaths(path.dirname(filename));
gate._compile(source, filename);
