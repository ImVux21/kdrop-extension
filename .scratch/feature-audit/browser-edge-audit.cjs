const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('C:/Users/vuodo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../..'),results=[];
const check=(name,expected,actual)=>{const pass=JSON.stringify(expected)===JSON.stringify(actual);results.push({name,pass,expected,actual});console.log(`${pass?'PASS':'FAIL'} ${name}: ${JSON.stringify(actual)}`);};
const product='<div class="prod-buy"><h1 class="prod-buy-header__title">수납함</h1><div class="total-price"><strong>110,000원</strong></div><img class="prod-image__detail" src="https://example.com/placeholder.gif" data-src="https://example.com/real-product.jpg"></div>';
const recommended='<ul><li class="search-product" data-product-id="222222222"><a href="/vp/products/222222222"><span class="name">추천 상품</span><span class="price-value">120,000원</span></a></li></ul>';
(async()=>{
 const profile=fs.mkdtempSync(path.join(__dirname,'chrome-profile-'));
 const context=await chromium.launchPersistentContext(profile,{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
 context.setDefaultTimeout(10000);
 try{
  const cdp=await context.browser().newBrowserCDPSession();const {id}=await cdp.send('Extensions.loadUnpacked',{path:root});
  const dashboard=await context.newPage();await dashboard.goto(`chrome-extension://${id}/ui/dashboard.html`);
  await dashboard.waitForFunction(()=>typeof allProducts!=='undefined'&&allProducts.length>0);
  await dashboard.evaluate(async()=>{await chrome.storage.local.set({kdrop_products:[]});await loadData();});
  await context.route('https://example.com/**',r=>r.abort());
  await context.route('https://www.coupang.com/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:`<html><head><meta charset="utf-8"><title>Audit</title></head><body>${r.request().url().includes('late')?'':product+recommended}</body></html>`}));
  const side=await context.newPage();const dialogs=[];side.on('dialog',async d=>{dialogs.push(d.message());await d.accept();});
  await side.goto(`chrome-extension://${id}/ui/sidepanel.html`);
  const fixture=await context.newPage();await fixture.goto('https://www.coupang.com/vp/products/111111111');
  await fixture.waitForFunction(()=>!!document.getElementById('kdrop-detail-widget'));
  const getRaw=()=>dashboard.evaluate(async()=>{const [tab]=await chrome.tabs.query({url:'https://www.coupang.com/*'});return(await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>window.KDropCoupangExtractor.extractSingleProduct()}))[0].result;});
  check('Lazy detail thumbnail uses product image','https://example.com/real-product.jpg',(await getRaw()).thumbnailUrl);
  await fixture.bringToFront();await side.evaluate(()=>document.getElementById('btnScanCurrentTab').click());
  await side.waitForFunction(()=>!document.getElementById('btnScanCurrentTab').innerText.includes('Đang quét'));
  check('Scanning detail page prefers main product over recommendations',['111111111'],await dashboard.evaluate(async()=>(await KDropStorage.getAllProducts()).map(p=>p.productId)));
  await fixture.locator('#btnSaveToKDrop').click();
  await fixture.waitForFunction(()=>document.getElementById('btnSaveToKDrop').innerText.includes('Đã Lưu'));
  check('Product widget save reaches real storage',true,await dashboard.evaluate(async()=>(await KDropStorage.getAllProducts()).some(p=>p.productId==='111111111')));
  await dashboard.reload();await dashboard.waitForFunction(()=>allProducts.some(p=>p.productId==='111111111'));
  const unknown=await dashboard.evaluate(()=>Array.from(document.querySelectorAll('#productsTableBody tr')).find(tr=>tr.innerText.includes('ID 111111111')).querySelector('.product-rating').innerText);
  check('Dashboard unknown rating is shown as unknown',false,/0\s*\(0 đánh giá\)/.test(unknown));
  const newPage=context.waitForEvent('page');await side.locator('#btnOpenDashboardTab').click();const opened=await newPage;await opened.waitForLoadState();
  check('Sidepanel Dashboard button opens actual dashboard',`chrome-extension://${id}/ui/dashboard.html`,opened.url());
  check('Toolbar action is configured to open sidepanel',true,await dashboard.evaluate(async()=>(await chrome.sidePanel.getPanelBehavior()).openPanelOnActionClick));
  await dashboard.locator('#btnOpenImportModal').click();check('Import modal focuses first input','importNicheName',await dashboard.evaluate(()=>document.activeElement.id));
  await dashboard.keyboard.press('Escape');check('Import Escape restores focus','btnOpenImportModal',await dashboard.evaluate(()=>document.activeElement.id));
  await dashboard.keyboard.press('/');check('Search keyboard shortcut','searchInput',await dashboard.evaluate(()=>document.activeElement.id));
  await fixture.goto('https://www.coupang.com/vp/products/333333333?late=1');
  await dashboard.evaluate(async()=>{const [tab]=await chrome.tabs.query({url:'https://www.coupang.com/*'});await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>window.KDropCoupangExtractor.extractSingleProduct()});});
  await fixture.evaluate(html=>{document.body.innerHTML=html;},product);
  await fixture.waitForTimeout(300);
  check('Widget appears when product DOM arrives after content initialization',true,await fixture.locator('#kdrop-detail-widget').count()===1);
  const raw=await getRaw();check('Manual extraction handles late rendered product','333333333',raw.productId);
  // Fixed UI records isolate filtering from the separately audited evaluator.
  await dashboard.evaluate(()=>{
   const definitions=[
    ['A',110000,20,false,'NONE','ready_for_trial','DIAMOND_WIN',90,'LOW','alpha','silicone',40,44000],
    ['B',75000,30,false,'NONE','needs_verification','GOLD_WIN',75,'LOW','beta','magnetic',30,22500],
    ['C',150000,40,true,'ROCKET_DELIVERY','needs_verification','SILVER_WIN',55,'MEDIUM','alpha','silicone',20,30000],
    ['D',25000,50,true,'ROCKET_GROWTH','not_eligible','HIGH_RISK',20,'HIGH','beta','magnetic',-10,-2500]
   ];
   allProducts=definitions.map(([id,price,cogs,isRocket,rocketType,status,tier,score,level,niche,material,margin,profit])=>({
    id,productId:id,titleKr:`${id} product`,salesPriceKrw:price,cogs1688Cny:cogs,isRocket,rocketType,niche,nicheName:niche,
    wpi:{tier,score,isComplete:true,isProvisional:false},trialEligibility:{status},kcSafety:{level},
    financial:{isComplete:true,netMarginPct:margin,netProfitKrw:profit},materialIntel:{materials:[{labelVi:material}],precisionQueryCn:material},sourcingDossier:{}
   }));renderNicheOptions();extractMaterialTags();resetFilters();
  });
  const visibleIds=()=>dashboard.locator('#productsTableBody .product-id').allTextContents().then(values=>values.map(v=>v.replace('ID ','')));
  const filterCases=[
   ['elig','READY_FOR_TRIAL',['A']],['elig','NEEDS_VERIFICATION',['B','C']],['elig','NOT_ELIGIBLE',['D']],
   ['buybox','WING_ONLY',['A','B']],['buybox','ROCKET_ONLY',['C','D']],
   ['tier','DIAMOND',['A']],['tier','GOLD',['B']],
   ['price','UNDER_50K',['D']],['price','50K_TO_100K',['B']],['price','OVER_100K',['A','C']]
  ];
  for(const [type,value,expected] of filterCases){await dashboard.locator(`[data-${type}="${value}"]`).click();check(`Individual filter ${type} ${value}`,expected,await visibleIds());await dashboard.locator('#btnResetFilters').click();}
  await dashboard.locator('#nicheSelect').selectOption('alpha');check('Niche dropdown filter',['A','C'],await visibleIds());await dashboard.locator('#btnResetFilters').click();
  await dashboard.locator('#chkKcSafeOnly').check();check('KC signal filter',['A','B'],await visibleIds());await dashboard.locator('#btnResetFilters').click();
  await dashboard.locator('.material-filter summary').click();await dashboard.locator('[data-material="silicone"]').click();check('Material chip filter',['A','C'],await visibleIds());await dashboard.locator('#btnResetFilters').click();
  await dashboard.locator('[data-buybox="WING_ONLY"]').click();await dashboard.locator('[data-elig="NEEDS_VERIFICATION"]').click();check('Combined Wing and needs-verification filters',['B'],await visibleIds());await dashboard.locator('#btnResetFilters').click();
  for(const [value,expected] of [['margin_desc',['A','B','C','D']],['profit_desc',['A','C','B','D']],['price_desc',['C','A','B','D']],['price_asc',['D','B','A','C']],['cogs_asc',['A','B','C','D']]]){
   await dashboard.locator('#sortSelect').selectOption(value);check(`Sort ${value}`,expected,await visibleIds());await dashboard.locator('#btnResetFilters').click();
  }
 }finally{fs.writeFileSync(path.join(__dirname,'browser-edge-results.json'),JSON.stringify(results,null,2));await context.close();}
 console.log(`Edge audit: ${results.filter(r=>r.pass).length} pass; ${results.filter(r=>!r.pass).length} failures.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
