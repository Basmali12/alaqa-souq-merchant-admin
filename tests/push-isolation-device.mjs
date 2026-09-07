// Preview only local HTML/assets in an already authenticated USB PWA.
// Existing production worker, session, permission and deviceId are preserved.
// Normal registration upserts that device; no credential values are printed.
import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import assert from 'node:assert/strict';

const role=process.argv[2];
if(!['merchant','courier'].includes(role))throw Error('Specify merchant or courier');
const prefix=role==='merchant'?'/alaqa-souq-merchant-admin/':'/alaqa-souq-courier/';
const dist=resolve(role==='merchant'?'dist':'../courier-web/dist');
const browser=await chromium.connectOverCDP('http://127.0.0.1:9231');
const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('https://basmali12.github.io'+prefix));
if(!page){await browser.close();throw Error('Open the installed '+role+' PWA first');}
const errors=[];
page.on('pageerror',()=>errors.push('PAGE_ERROR'));
const before=await page.evaluate(()=>({
  merchantSession:localStorage.getItem('alaqa_merchant_session'),
  courierSession:localStorage.getItem('alaqa_courier_session'),
}));
let registered=false;
const pattern='https://basmali12.github.io'+prefix+'**';
const route=async r=>{
  const relative=new URL(r.request().url()).pathname.slice(prefix.length);
  if(relative&&!relative.startsWith('assets/'))return r.continue();
  const file=resolve(dist,relative||'index.html');
  if(!file.startsWith(dist+sep))return r.abort();
  await r.fulfill({status:200,body:await readFile(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html',headers:{'cache-control':'no-store'}});
};
try{
  await page.route(pattern,route);
  await page.bringToFront();
  if (process.argv.includes('--renew-subscription')) {
    await page.evaluate(async ({role,prefix}) => {
      if (Notification.permission !== 'granted') throw Error('Existing permission required');
      if (!localStorage.getItem('alaqa_'+role+'_session')) throw Error('Existing session required');
      const reg=await navigator.serviceWorker.getRegistration(prefix);
      if (reg?.scope !== location.origin+prefix) throw Error('Unexpected scope');
      const subscription=await reg.pushManager.getSubscription();
      if (subscription && !await subscription.unsubscribe()) throw Error('Unsubscribe failed');
      const key='alaqa_push_v2:'+role+':'+prefix+':';
      for (const suffix of ['token','auth','appId']) localStorage.removeItem(key+suffix);
    }, {role,prefix});
    console.log('RENEWED_ONLY_REQUESTED_ROLE_SUBSCRIPTION',role);
  }
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(({role,prefix})=>{
    const key='alaqa_push_v2:'+role+':'+prefix+':';
    return !!localStorage.getItem(key+'token') && !!localStorage.getItem(key+'auth');
  },{role,prefix},{timeout:35000});
  const result=await page.evaluate(async({role,prefix,before})=>{
    const key='alaqa_push_v2:'+role+':'+prefix+':';
    const token=localStorage.getItem(key+'token');
    const otherRole=role==='merchant'?'courier':'merchant';
    const otherScope=role==='merchant'?'/alaqa-souq-courier/':'/alaqa-souq-merchant-admin/';
    const otherToken=localStorage.getItem('alaqa_push_v2:'+otherRole+':'+otherScope+':token');
    const reg=await navigator.serviceWorker.getRegistration(prefix);
    return {
      role,permission:Notification.permission,
      scopedTokenPresent:!!token,otherScopedTokenPresent:!!otherToken,
      tokensDistinct:otherToken?token!==otherToken:null,
      correctScope:reg?.scope===location.origin+prefix,
      subscriptionPresent:!!(await reg?.pushManager.getSubscription()),
      sessionsPreserved:localStorage.getItem('alaqa_merchant_session')===before.merchantSession && localStorage.getItem('alaqa_courier_session')===before.courierSession,
      bundle:[...document.scripts].some(s=>s.src.includes('/assets/index-')),
    };
  },{role,prefix,before});
  assert.equal(result.permission,'granted');
  assert.equal(result.correctScope,true);
  assert.equal(result.subscriptionPresent,true);
  assert.equal(result.sessionsPreserved,true);
  if(result.otherScopedTokenPresent)assert.equal(result.tokensDistinct,true);
  assert.equal(errors.length,0);
  console.log('USB_SCOPED_REGISTRATION',JSON.stringify(result));
  // Let the unchanged Convex mutation complete; no reload into legacy code.
  await new Promise(r=>setTimeout(r,5000));
  registered=true;
}finally{
  await page.unroute(pattern,route);
  await browser.close();
}
if(!registered)process.exitCode=1;
