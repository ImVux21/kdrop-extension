// Read-only product audit. All mutations use an isolated in-memory test adapter.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const storage = require('../../storage/storageRepository.js');
const fee = require('../../core/feeCalculator.js');
const win = require('../../core/winAlgorithm.js');
const material = require('../../core/materialEngine.js');
const kc = require('../../core/kcRules.js');
const results = [];
function check(name, expected, actual) {
  const pass = JSON.stringify(expected) === JSON.stringify(actual);
  results.push({ name, pass, expected, actual });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(actual)}`);
}
const reset = () => { globalThis.__kdrop_test_storage__ = {}; };
const candidate = () => storage.enrichProduct({
  productId: '123456789', titleKr: '수납함', salesPriceKrw: 110000,
  isRocket: false, rocketType: 'NONE', rank: null,
  sourcingDossier: { cogs1688Cny: 100, isVerified: true, provenance: 'EVIDENCE', supplierUrl: 'https://detail.1688.com/offer/123.html' },
  economics: { adCostPerOrderKrw: 0, returnAllowanceRate: 0 },
  evidenceDossier: {
    demand: { peakMonthlySearches: 15000, seasonalityReviewed: true },
    rocketCompetition: { sampleSize: 100, rocketCount: 30 },
    sellerEvidence: { sellerReviewCount: 35, isInternationalDelivery: true },
    kcReview: { reviewStatus: 'EXEMPT' }
  }
});
(async () => {
  reset();
  const searchProduct = storage.migrateProduct({ productId: '1', titleKr: '수납함', salesPriceKrw: 110000,
    rank: null, listingPosition: 1, listingPageContext: 'Search results', isRocket: false, rocketType: 'NONE' });
  check('Normal search position is not verified BSR', {rank:null,demandKnown:false},
    {rank:searchProduct.rank,demandKnown:searchProduct.wpi.breakdown.demand.isKnown});

  const incomplete = candidate();
  check('Missing source/date/variant/quantity/seller URL keeps dossier pending', 'needs_verification', incomplete.trialEligibility.status);
  check('Missing shipping evidence keeps dossier pending', 'needs_verification', incomplete.trialEligibility.status);
  incomplete.evidenceDossier.rocketCompetition.rocketCount = -1;
  const negativeSample = win.evaluateTrialEligibility(incomplete);
  check('Negative Rocket count cannot pass competition criterion', false, negativeSample.criteria.find(c=>c.id==='rocket_share').status==='PASS');
  const p = candidate();
  p.evidenceDossier.kcReview = {};
  check('Unknown title is not confirmed safe by absence of keywords', 'REVIEW_REQUIRED', kc.evaluateKcReadiness(kc.evaluateKcRisk('unknown product'), {}).status);
  check('Korean mug keyword matches medium-risk list', 'MEDIUM', kc.evaluateKcRisk('머그컵').level);

  await storage.saveProduct({productId:'2',titleKr:'수납함',salesPriceKrw:110000,cogs1688Cny:100});
  await storage.saveSourcingDossier('coupang_2',{supplierUrl:'https://detail.1688.com/offer/2.html',cogs1688Cny:100,variant:'A',quantity:10,moq:1,isVerified:true});
  await storage.updateProductCogs('coupang_2',200);
  check('Changing verified quote price invalidates verification',false,(await storage.getAllProducts())[0].sourcingDossier.isVerified);

  const params = {salesPriceKrw:100000,cogs1688Cny:100,shippingCostKrw:3000,adCostPerOrderKrw:0,returnAllowanceKrw:10000,fulfillmentModel:'ROCKET_GROWTH'};
  const profit=fee.calculateProfit(params), unit=fee.calculateUnitEconomics(params);
  check('Profit and unit economics share pre-ad contribution',profit.preAdMarginKrw,unit.preAdMarginKrw);
  const cap=fee.calculateTargetMaxCny(100000,0.30,300,{shippingCostKrw:3000,adCostPerOrderKrw:20000,returnAllowanceRate:5});
  const atCap=fee.calculateProfit({salesPriceKrw:100000,cogs1688Cny:cap,shippingCostKrw:3000,adCostPerOrderKrw:20000,returnAllowanceRate:5});
  check('Suggested max sourcing cost reaches promised 30% margin',true,atCap.netMarginPct>=30);
  results[results.length-1].detail={maxCny:cap,resultMarginPct:atCap.netMarginPct};
  for (const [key,value] of [['exchangeRateCnyKrw',-190],['platformCommissionRate',-0.5],['buyingAgentFeeRate',-1],['returnAllowanceKrw',-10000]]) {
    check(`Financial input ${key} rejects negative values`,false,fee.calculateProfit({...params,[key]:value}).isValid);
  }
  const marginBorder=fee.calculateProfit({salesPriceKrw:100000,cogs1688Cny:100,shippingCostKrw:3000,adCostPerOrderKrw:42001,returnAllowanceRate:0});
  const borderProduct=candidate();borderProduct.financial=marginBorder;
  check('Unrounded margin below 25% fails eligibility','not_eligible',win.evaluateTrialEligibility(borderProduct).status);
  results[results.length-1].detail={exactMargin:marginBorder.netProfitKrw/100000*100,displayMargin:marginBorder.netMarginPct};

  reset();
  await storage.saveProduct({productId:'3',salesPriceKrw:110000,cogs1688Cny:100});
  await storage.saveSourcingDossier('coupang_3',{cogs1688Cny:123,isVerified:true,supplierUrl:'https://detail.1688.com/offer/3.html'});
  await storage.saveEvidenceDossier('coupang_3',{demand:{peakMonthlySearches:12345}});
  await storage.toggleWatchlist('coupang_3');
  const backup=await storage.exportBackup();
  await storage.updateProductCogs('coupang_3',999);
  await storage.saveEvidenceDossier('coupang_3',{demand:{peakMonthlySearches:99999}});
  await storage.toggleWatchlist('coupang_3');
  await storage.importBackup(backup);
  const restored=(await storage.getAllProducts())[0];
  check('Restore backup restores dossier of an existing product',{cost:123,watchlist:true,searches:12345},
    {cost:restored.cogs1688Cny,watchlist:restored.isWatchlist,searches:restored.evidenceDossier.demand.peakMonthlySearches});
  reset();
  let rejected=false;try{await storage.importBackup([{productId:'4',salesPriceKrw:110000}, {titleKr:'Missing identity'}]);}catch{rejected=true;}
  check('Invalid record rejects whole import without partial write',{rejected:true,count:0},{rejected,count:(await storage.getAllProducts()).length});

  reset();
  await storage.saveProduct({productId:'5',salesPriceKrw:110000,cogs1688Cny:100,economics:{platformCommissionRate:0,shippingCostKrw:0}});
  const zero=(await storage.getAllProducts())[0];
  check('Migration retains explicit zero commission and shipping',{commission:0,shipping:0},{commission:zero.economics.platformCommissionRate,shipping:zero.economics.shippingCostKrw});
  await storage.saveEconomics('coupang_5',{targetSalesPriceKrw:150000});
  check('Scenario target price does not overwrite observed Coupang price',110000,(await storage.getAllProducts())[0].marketData.salesPriceKrw);
  check('Non-automotive furniture keeps category in 1688 search',false,material.extractMaterialIntelligence('책장 수납 선반').precisionQueryCn.includes('车载用品'));
  check('Quantity 14 does not become a set of 4','1_piece',material.extractMaterialIntelligence('수납함 14개 단품').spec?.code);

  reset();
  await storage.saveProduct({productId:'6',salesPriceKrw:110000,cogs1688Cny:100,discountRate:20});
  await storage.saveProduct({productId:'6',salesPriceKrw:120000,discountRate:10});
  check('Rescan refreshes observed discount',10,(await storage.getAllProducts())[0].marketData.discountRate);

  const initial=JSON.parse(JSON.stringify(globalThis.__kdrop_test_storage__));
  const repositoryCode=fs.readFileSync(path.join(__dirname,'../../storage/storageRepository.js'),'utf8');
  let shared=initial;
  function independentView() {
    const context={console, setTimeout, KDropKcRules:kc, KDropMaterialEngine:material, KDropFeeCalculator:fee, KDropWinAlgorithm:win};
    context.self=context;
    context.chrome={runtime:{lastError:null,sendMessage:(_,callback)=>callback()},storage:{local:{
      get:([key],callback)=>{const snapshot=structuredClone(shared[key]);setTimeout(()=>callback({[key]:snapshot}),5);},
      set:(values,callback)=>setTimeout(()=>{Object.assign(shared,structuredClone(values));callback();},5)
    }}};
    vm.runInNewContext(repositoryCode,context);return context.KDropStorage;
  }
  await Promise.all([independentView().updateProductCogs('coupang_6',333),independentView().toggleWatchlist('coupang_6')]);
  check('Independent extension views preserve simultaneous edits',{cost:333,watchlist:true},
    {cost:shared[storage.KEY_PRODUCTS][0].cogs1688Cny,watchlist:shared[storage.KEY_PRODUCTS][0].isWatchlist});
  reset();
  const stale=storage.migrateProduct({productId:'7',titleKr:'수납함',salesPriceKrw:110000});
  stale.trialEligibility={status:'ready_for_trial',statusLabelVi:'Đủ Điều Kiện Thử Bán',criteria:[]};
  await storage.importBackup({version:2,products:[stale]});
  check('Schema v2 import recomputes eligibility from missing evidence','needs_verification',(await storage.getAllProducts())[0].trialEligibility.status);
  reset();
  let badMetadataRejected=false;
  try{await storage.importBackup({version:2,products:[{productId:'8',salesPriceKrw:110000}],categories:'bad metadata'});}catch{badMetadataRejected=true;}
  check('Malformed categories reject import before product write',{rejected:true,count:0},{rejected:badMetadataRejected,count:(await storage.getAllProducts()).length});
  reset();
  await storage.saveProduct({productId:'9',titleKr:'수납함',salesPriceKrw:110000,cogs1688Cny:100});
  await storage.saveEconomics('coupang_9',{buyingAgentFeeRate:0.1});
  check('Saved agent percentage applies when only percentage is entered',1900,(await storage.getAllProducts())[0].financial.buyingAgentFeeKrw);
  const failContext={console,KDropKcRules:kc,KDropMaterialEngine:material,KDropFeeCalculator:fee,KDropWinAlgorithm:win};
  failContext.self=failContext;let broadcasts=0;
  const protectedRecord=structuredClone(globalThis.__kdrop_test_storage__);
  failContext.chrome={runtime:{lastError:null,sendMessage:()=>broadcasts++},storage:{local:{
    get:([key],callback)=>callback({[key]:structuredClone(protectedRecord[key])}),
    set:(_,callback)=>{failContext.chrome.runtime.lastError={message:'simulated write failure'};callback();failContext.chrome.runtime.lastError=null;}
  }}};
  vm.runInNewContext(repositoryCode,failContext);
  let failedWriteRejected=false;
  try{await failContext.KDropStorage.updateProductCogs('coupang_9',333);}catch{failedWriteRejected=true;}
  check('Storage write failure rejects, preserves data and sends no success broadcast',
    {rejected:true,cost:100,broadcasts:0},{rejected:failedWriteRejected,cost:protectedRecord[storage.KEY_PRODUCTS][0].cogs1688Cny,broadcasts});
  fs.writeFileSync(path.join(__dirname,'core-results.json'),JSON.stringify(results,null,2));
  console.log(`Audit: ${results.filter(r=>r.pass).length} pass; ${results.filter(r=>!r.pass).length} failures.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
