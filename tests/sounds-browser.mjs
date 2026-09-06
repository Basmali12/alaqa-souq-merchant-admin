import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
const appRoot = resolve(process.argv[2] || ".");
const port = Number(process.env.SOUND_TEST_PORT || 4216);
const server = spawn(process.execPath, [resolve("node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: appRoot, stdio: "ignore" });
const cdpEndpoint = process.env.SOUND_TEST_CDP;
let browser, page, deviceSession;
try {
  for (let i=0;i<60;i++) { try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break; } catch {} await new Promise(r=>setTimeout(r,200)); }
  browser=cdpEndpoint ? await chromium.connectOverCDP(cdpEndpoint) : await chromium.launch({channel:"chrome",headless:true});
  const context=cdpEndpoint ? browser.contexts()[0] : await browser.newContext();
  page=await context.newPage();
  await page.bringToFront();
  if (cdpEndpoint) deviceSession=await context.newCDPSession(page);
  // Offline emulation affects only our new test tab, never the user's other tabs.
  const offline=async value=>deviceSession ? deviceSession.send("Network.emulateNetworkConditions", {offline:value,latency:0,downloadThroughput:-1,uploadThroughput:-1}) : context.setOffline(value);
  await page.goto(`http://127.0.0.1:${port}/`);
  // Isolated page, real browser Cache Storage / AudioContext; no production login or orders.
  await page.setContent('<button id="unlock">Enable audio</button>');
  await page.evaluate(async()=>{
    const {LocalSound}=await import("/src/local-sound.ts");
    window.engine=new LocalSound("test_sound","qa");
    const a=new Uint8Array(16044),v=new DataView(a.buffer),text=(at,s)=>[...s].forEach((x,i)=>a[at+i]=x.charCodeAt(0));
    text(0,"RIFF");v.setUint32(4,a.length-8,true);text(8,"WAVE");text(12,"fmt ");v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
    v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,"data");v.setUint32(40,16000,true);
    for(let i=0;i<8000;i++)v.setInt16(44+i*2,Math.sin(i/8000*440*Math.PI*2)*4000,true);
    window.wav=Array.from(a);
    document.querySelector("#unlock").onclick=()=>window.unlockPromise=window.engine.unlock();
  });
  let downloads=0;
  const bytes=await page.evaluate(()=>window.wav);
  await page.route("https://sound.test/**",route=>{downloads++;return route.fulfill({status:200,contentType:"audio/wav",body:Buffer.from(bytes)});});
  await page.evaluate(()=>window.engine.sync({type:"test_sound",version:1,enabled:true,url:"https://sound.test/1.wav",mimeType:"audio/wav"}));
  await page.click("#unlock");
  assert.equal(await page.evaluate(async()=>{await window.unlockPromise;return window.engine.ready;}),true);
  assert.equal(await page.evaluate(()=>window.engine.play("order-1")),true);
  assert.equal(await page.evaluate(()=>window.engine.play("order-1")),false);
  await page.evaluate(()=>window.engine.sync({type:"test_sound",version:1,enabled:true,url:"https://sound.test/1.wav",mimeType:"audio/wav"}));
  assert.equal(downloads,1);
  await offline(true);
  assert.equal(await page.evaluate(()=>window.engine.play("order-offline")),true);
  assert.equal(downloads,1);
  await offline(false);
  await page.evaluate(()=>window.engine.sync({type:"test_sound",version:2,enabled:true,url:"https://sound.test/2.wav",mimeType:"audio/wav"}));
  assert.equal(downloads,2);
  const cache=await page.evaluate(async()=>{const c=await caches.open(window.engine.cacheName);return {count:(await c.keys()).length,version:(await c.match(window.engine.key)).headers.get("x-sound-version")};});
  assert.deepEqual(cache,{count:1,version:"2"});
  await page.evaluate(()=>window.engine.sync({type:"test_sound",version:2,enabled:false,url:"https://sound.test/2.wav",mimeType:"audio/wav"}));
  assert.equal(await page.evaluate(()=>window.engine.play("disabled-order")),false);
  await page.evaluate(()=>window.engine.sync({type:"test_sound",version:2,enabled:true,url:"https://sound.test/2.wav",mimeType:"audio/wav"}));
  assert.equal(downloads,2);
  await page.evaluate(async()=>{
    const old=window.engine;old.dispose();
    const {LocalSound}=await import("/src/local-sound.ts");
    window.engine=new LocalSound("test_sound","qa");
  });
  await offline(true);
  await page.click("#unlock");
  assert.equal(await page.evaluate(async()=>{await window.unlockPromise;return window.engine.play("offline-restart");}),true);
  assert.equal(await page.evaluate(()=>window.engine.play("order-1")),false);
  await page.evaluate(async()=>{
    window.engine.dispose();
    const c=await caches.open("alaqa-sound-test_sound");
    await c.put(window.engine.key,new Response("broken",{headers:{"x-sound-enabled":"true","x-sound-version":"2"}}));
    const {LocalSound}=await import("/src/local-sound.ts");window.engine=new LocalSound("test_sound","qa");
  });
  await page.click("#unlock");
  assert.equal(await page.evaluate(async()=>{await window.unlockPromise;return window.engine.play("bad-cache");}),false);
  console.log("PASS",cdpEndpoint ? "USB Android Chrome" : "desktop Chrome", ": decode, unlock, one download, offline playback, restart, idempotency, version replacement, disable, corrupt-cache fallback:",appRoot);
} finally {
  // Remove only generated test state. No account, order or application data is cleared.
  if (page && !page.isClosed()) {
    await page.evaluate(async()=>{window.engine?.dispose();await caches.delete("alaqa-sound-test_sound");localStorage.removeItem("sound-events-test_sound-qa");localStorage.removeItem("sound-enabled-test_sound-qa");}).catch(()=>{});
    await page.close();
  }
  await browser?.close();server.kill();
}
