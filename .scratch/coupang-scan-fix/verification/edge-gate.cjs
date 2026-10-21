// Independent verification of scan behaviors; production files remain unchanged.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/vuodo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '../../..');
const results = [];
const observations = [];
const check = (name, expected, actual) => {
  const pass = JSON.stringify(expected) === JSON.stringify(actual);
  results.push({ name, expected, actual, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(actual)}`);
};
const doc = body => `<!doctype html><meta charset="utf-8"><title>Verification</title>${body}`;
const card = (id, price = '<span>195,800원</span>', extra = '', href = `/vp/products/${id}?vendorItemId=95921999183`) => `<li class="ProductUnit_productUnit__differentHash" data-id="95921999183"><a href="${href}"><figure class="ProductUnit_productImage__differentHash"><img src="https://thumbnail.coupangcdn.com/item.jpg"></figure><div class="ProductUnit_productInfo__differentHash"><div class="ProductUnit_productNameV2__differentHash">VERIFY ${id}</div><div class="PriceArea_priceArea__differentHash">${price}</div>${extra}</div></a></li>`;
const modern = doc(`<ul id="product-list">${card('9693648728','<del>219,800원</del><div><span>195,800원</span><span>(1개당 97,900원)</span></div>', '<div class="ProductRating_productRating__differentHash"><div aria-label="5"></div><span>(2)</span></div>')}</ul>`);
const fixtures = {
  homepage: doc('<div id="todayDiscoveryUnit"><ul class="banner-list"><li><a href="https://shop.coupang.com/brand/123">Campaign</a></li></ul></div>'),
  modern,
  incomplete: doc(`<ul id="product-list">${card('123456789','<span>품절</span>')}</ul>`),
  ambiguous: doc(`<ul id="product-list">${card('123456789','<span>10,000원</span><span>20,000원</span>')}</ul>`),
  foreign: doc(`<ul id="product-list">${card('123456789', undefined, '', 'https://example.com/vp/products/123456789')}</ul>`),
  legacy: doc('<ul class="search-product-list"><li class="search-product" data-product-id="123456789"><a href="/vp/products/123456789"><span class="name">VERIFY LEGACY</span><strong class="price-value">110,000원</strong></a></li></ul>'),
  late: doc('<div>Loading</div>'),
  bsr: doc(`<ul id="product-list">${card('111111111',undefined,'<span class="best-seller-rank">1</span>')}${card('222222222',undefined,'<button aria-label="Ad information">광고</button>')}${card('333333333',undefined,'<span class="best-seller-rank">2</span>')}</ul>`),
  rankMismatch: doc(`<ul id="product-list">${card('111111111',undefined,'<span class="best-seller-rank">17</span>')}</ul>`),
  feeOnly: doc(`<ul id="product-list">${card('123456789','<span class="shipping-cost">3,000원</span>')}</ul>`),
  srcset: doc(`<ul id="product-list">${card('123456789').replace('src="https://thumbnail.coupangcdn.com/item.jpg"','src="https://thumbnail.coupangcdn.com/blank.gif" srcset="https://thumbnail.coupangcdn.com/item.jpg 1x, https://thumbnail.coupangcdn.com/item2.jpg 2x"')}</ul>`)
};
(async () => {
  const profile = fs.mkdtempSync(path.join(__dirname, 'chrome-profile-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, { executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true, ignoreDefaultArgs:['--disable-extensions'], args:['--enable-unsafe-extension-debugging'] });
    context.setDefaultTimeout(20000);
    await context.route('https://**/*', r => r.abort());
    await context.route('https://www.coupang.com/**', r => {
      const u = new URL(r.request().url());
      return r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:fixtures[u.searchParams.get('case')] || fixtures.homepage});
    });
    const cdp = await context.browser().newBrowserCDPSession();
    const {id} = await cdp.send('Extensions.loadUnpacked',{path:root});
    const dash = await context.newPage();
    await dash.goto(`chrome-extension://${id}/ui/dashboard.html`, {waitUntil:'domcontentloaded'});
    await dash.waitForFunction(() => typeof allProducts !== 'undefined' && allProducts.length > 0);
    const side = await context.newPage();
    await side.goto(`chrome-extension://${id}/ui/sidepanel.html`, {waitUntil:'domcontentloaded'});
    await side.waitForFunction(() => Boolean(window.KDropStorage));
    const page = await context.newPage();
    const errors = [], dialogs = [];
    for (const p of [dash, side, page]) {
      p.on('pageerror', e => errors.push(e.message));
      p.on('dialog', async d => { dialogs.push(d.message()); await d.accept(); });
    }
    const reset = () => dash.evaluate(async () => { await chrome.storage.local.set({kdrop_products:[]}); await loadData(); });
    const stored = () => dash.evaluate(async () => (await chrome.storage.local.get('kdrop_products')).kdrop_products);
    const navigate = async (name, pathname = '/np/search') => {
      await page.goto(`https://www.coupang.com${pathname}?case=${name}`, {waitUntil:'domcontentloaded'});
      await page.locator('#btnScrapeListing').waitFor();
    };
    const scan = async entry => {
      dialogs.length = 0;
      await page.bringToFront();
      const target = entry === 'floating' ? page : side;
      const selector = entry === 'floating' ? '#btnScrapeListing' : '#btnScanCurrentTab';
      await target.locator(selector).click();
      await target.waitForFunction(selector => !document.querySelector(selector).disabled, selector);
      return { records:await stored(), message:dialogs.at(-1) || await target.locator(selector).innerText() };
    };
    for (const entry of ['floating','sidepanel']) {
      for (const name of ['modern','homepage','incomplete','legacy','ambiguous','foreign','feeOnly']) {
        await reset(); await navigate(name, name === 'homepage' ? '/' : '/np/search');
        const result = await scan(entry);
        observations.push({entry, name, message:result.message, products:result.records.map(p=>({id:p.productId, price:p.marketData.salesPriceKrw, url:p.marketData.productUrl, thumbnail:p.marketData.thumbnailUrl, rank:p.marketData.rank}))});
        check(`${entry}/${name} accepted count`, ['modern','legacy'].includes(name) ? 1 : 0, result.records.length);
        check(`${entry}/${name} control recovers`, true, await (entry === 'floating' ? page : side).locator(entry === 'floating' ? '#btnScrapeListing' : '#btnScanCurrentTab').isEnabled());
        if (name === 'modern') {
          const p = result.records[0];
          check(`${entry}/modern observed fields`, {id:'9693648728',vendor:'95921999183',price:195800,rating:5,reviews:2,rank:null}, {id:p?.productId,vendor:p?.vendorItemId,price:p?.marketData.salesPriceKrw,rating:p?.marketData.rating,reviews:p?.marketData.reviewCount,rank:p?.marketData.rank});
          await dash.waitForFunction(() => document.querySelector('#productsTableBody').innerText.includes('VERIFY 9693648728'));
          check(`${entry}/Studio actual table displays committed product`, true, await dash.locator('#productsTableBody').innerText().then(t => t.includes('VERIFY 9693648728')));
          await dash.reload();
          await dash.waitForFunction(() => document.querySelector('#productsTableBody')?.innerText.includes('VERIFY 9693648728'));
          check(`${entry}/Studio table persists after reload`, true, await dash.locator('#productsTableBody').innerText().then(t => t.includes('VERIFY 9693648728')));
        }
        if (name === 'homepage') check(`${entry}/homepage guidance`, true, /Trang chủ.*Vui lòng mở/.test(result.message));
        if (name === 'incomplete') check(`${entry}/incomplete diagnosis`, true, /thẻ sản phẩm.*thiếu thông tin/.test(result.message));
      }
      await reset(); await navigate('late'); await scan(entry);
      await page.locator('body').evaluate((body, html) => body.insertAdjacentHTML('beforeend', html), `<ul id="product-list">${card('9693648728')}</ul>`);
      check(`${entry}/late DOM without reload`, 1, (await scan(entry)).records.length);
      await reset(); await navigate('modern');
      await dash.evaluate(async () => { const [tab] = await chrome.tabs.query({url:'https://www.coupang.com/*'}); await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{window.KDropCoupangExtractor=undefined;}}); });
      const missing = await scan(entry);
      check(`${entry}/missing context guidance`, true, /bộ quét.*(F5|tải lại)/.test(missing.message));
      check(`${entry}/missing context leaves storage empty`, 0, missing.records.length);
      await reset(); await navigate('modern');
      const target = entry === 'floating' ? page : side;
      const inject = async action => {
        if (entry === 'sidepanel') return side.evaluate(action => {
          if (action === 'fail') {
            window.__verificationOriginalImport = window.KDropStorage.batchImportProducts;
            window.KDropStorage.batchImportProducts = async () => {throw new Error('VERIFY_WRITE_FAILED');};
          } else {window.KDropStorage.batchImportProducts=window.__verificationOriginalImport;delete window.__verificationOriginalImport;}
        }, action);
        return dash.evaluate(async action => {
          const [tab] = await chrome.tabs.query({url:'https://www.coupang.com/*'});
          await chrome.scripting.executeScript({target:{tabId:tab.id},args:[action],func:action=>{
            if (action === 'fail') {
              window.__verificationOriginalImport = window.KDropStorage.batchImportProducts;
              window.KDropStorage.batchImportProducts = async () => {throw new Error('VERIFY_WRITE_FAILED');};
            } else {window.KDropStorage.batchImportProducts=window.__verificationOriginalImport;delete window.__verificationOriginalImport;}
          }});
        }, action);
      };
      await inject('fail');
      const failedSave = await scan(entry);
      check(`${entry}/storage error is distinct and visible`, true, /Lỗi lưu trữ.*VERIFY_WRITE_FAILED/.test(failedSave.message));
      check(`${entry}/failed storage commit leaves zero records`, 0, failedSave.records.length);
      check(`${entry}/storage failure restores control`, true, await target.locator(entry === 'floating' ? '#btnScrapeListing' : '#btnScanCurrentTab').isEnabled());
      await inject('restore');
    }
    for (const name of ['bsr','rankMismatch','srcset']) {
      await reset(); await navigate(name, name === 'srcset' ? '/np/search' : '/np/best');
      const r = await scan('floating');
      if (name === 'bsr') check('BSR does not count inserted ad as rank', null, r.records.find(p => p.productId === '333333333')?.marketData.rank);
      if (name === 'rankMismatch') check('Unverified BSR fixture never invents rank 1 from position', null, r.records[0]?.marketData.rank);
      if (name === 'srcset') check('srcset thumbnail is a single usable URL', 'https://thumbnail.coupangcdn.com/item.jpg', r.records[0]?.marketData.thumbnailUrl);
      if (name !== 'srcset') {
        const rescanned = await scan('floating');
        observations.push({entry:'floating',name:`${name}/rescan`,products:rescanned.records.map(p=>({id:p.productId,rank:p.marketData.rank}))});
        if (name === 'bsr') check('Unverified ranking plus ad stays unknown on rescan', null, rescanned.records.find(p=>p.productId==='333333333')?.marketData.rank);
        if (name === 'rankMismatch') check('Unverified displayed 17 never becomes rank 1 on rescan', null, rescanned.records[0]?.marketData.rank);
      }
    }
    check('No unhandled page errors', [], errors);
    fs.writeFileSync(path.join(__dirname,'edge-results.json'),JSON.stringify(results,null,2));
    fs.writeFileSync(path.join(__dirname,'observations.json'),JSON.stringify(observations,null,2));
    console.log(`Independent gate: ${results.filter(r=>r.pass).length} passed, ${results.filter(r=>!r.pass).length} failed`);
  } finally {
    if (context) await context.close();
    const resolved = path.resolve(profile);
    if (resolved.startsWith(path.resolve(__dirname)+path.sep)) fs.rmSync(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
  if (results.some(r=>!r.pass)) process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
