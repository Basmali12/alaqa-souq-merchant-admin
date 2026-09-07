// Diagnostic ONLY: synthetic push checks display, not Pushy/FCM delivery.
import {chromium} from '@playwright/test';
const browser=await chromium.connectOverCDP('http://127.0.0.1:9231');
try{
 const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('https://basmali12.github.io/alaqa-souq-merchant-admin/'));
 if(!page)throw Error('Merchant page unavailable');
 const cdp=await page.context().newCDPSession(page);
 const registrations=new Map();
 cdp.on('ServiceWorker.workerRegistrationUpdated',e=>e.registrations.forEach(r=>registrations.set(r.registrationId,r)));
 cdp.on('ServiceWorker.workerErrorReported',()=>console.log('WORKER_ERROR'));
 await cdp.send('ServiceWorker.enable');
 await new Promise(r=>setTimeout(r,1000));
 const reg=[...registrations.values()].find(r=>r.scopeURL==='https://basmali12.github.io/alaqa-souq-merchant-admin/'&&!r.isDeleted);
 if(!reg)throw Error('Merchant worker not found');
 console.log('MERCHANT_WORKER_FOUND');
 if(process.argv.includes('--simulate')){
  await cdp.send('ServiceWorker.deliverPushMessage',{
   origin:'https://basmali12.github.io',
   registrationId:reg.registrationId,
   data:JSON.stringify({title:'اختبار عرض إشعار التاجر',message:'فحص محلي فقط، ليس طلب شراء',orderId:'local-display-diagnostic'}),
  });
  await new Promise(r=>setTimeout(r,5000));
  console.log('SYNTHETIC_PUSH_DISPATCHED_NOT_NETWORK_DELIVERY');
 }
 await cdp.detach();
}finally{await browser.close();}
