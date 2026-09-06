// USB-only, temporary preview of the local build in an existing authenticated PWA.
// Does not publish, extract credentials, alter permissions, or clear user data.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
const role = process.argv[2] || 'merchant';
if (!['merchant','courier'].includes(role)) throw new Error('Unknown role');
const prefix = role === 'merchant' ? '/alaqa-souq-merchant-admin/' : '/alaqa-souq-courier/';
const app = resolve(role === 'merchant' ? '.' : '../courier-web');
const dist = resolve(app,'dist');
const browser = await chromium.connectOverCDP(process.env.SOUND_TEST_CDP || 'http://127.0.0.1:9231');
const page = browser.contexts().flatMap(c=>c.pages()).find(p=>new URL(p.url()).origin === 'https://basmali12.github.io' && new URL(p.url()).pathname.startsWith(prefix));
if (!page) { await browser.close(); throw new Error('Open the installed role PWA on the USB device first'); }
const devtools = await page.context().newCDPSession(page);
const pattern = `https://basmali12.github.io${prefix}**`;
let downloads=0;
page.on('response',r=>{if(r.url().includes('.convex.cloud/api/storage/')) downloads++;});
page.on('console', async msg=>{
  if (!msg.text().startsWith('notification-sound')) return;
  const value = await msg.args()[1]?.jsonValue().catch(()=>null);
  if(value) console.log('sound',JSON.stringify({type:value.type,version:value.version,status:value.status}));
});
const route = async request=>{
  const relative = new URL(request.request().url()).pathname.slice(prefix.length);
  if (relative && !relative.startsWith('assets/')) return request.continue();
  const path=resolve(dist,relative || 'index.html');
  if(!path.startsWith(dist+sep)) return request.abort();
  const contentType=path.endsWith('.js')?'application/javascript':path.endsWith('.css')?'text/css':'text/html';
  await request.fulfill({status:200,contentType,body:await readFile(path),headers:{'cache-control':'no-store'}});
};
try {
  await devtools.send('Network.setBypassServiceWorker',{bypass:true});
  await page.route(pattern,route);
  await page.bringToFront(); await page.reload();
  const button=page.getByRole('button',{name:'تفعيل صوت الإشعارات',exact:true});
  await button.waitFor({timeout:30000}); await button.click();
  await page.getByRole('button',{name:'صوت الإشعارات مفعّل',exact:true}).waitFor({timeout:30000});
  console.log('LIVE_READY',role,'real session, real Production config, local build only');
  for(let i=0;i<60;i++) {
    await new Promise(r=>setTimeout(r,5000));
    if(i%6===0) console.log('CACHE',JSON.stringify(await page.evaluate(async()=>{
      const result=[];
      for(const name of await caches.keys()) if(name.startsWith('alaqa-sound-')&&!name.includes('test_sound')) {
        const c=await caches.open(name),keys=await c.keys();
        for(const k of keys){const r=await c.match(k); result.push({type:name,entries:keys.length,version:r.headers.get('x-sound-version'),enabled:r.headers.get('x-sound-enabled'),bytes:(await r.arrayBuffer()).byteLength});}
      }
      return result;
    })), 'downloads',downloads);
  }
} finally {
  await page.unroute(pattern,route);
  await devtools.send('Network.setBypassServiceWorker',{bypass:false});
  await page.reload().catch(()=>{});
  await browser.close();
}
