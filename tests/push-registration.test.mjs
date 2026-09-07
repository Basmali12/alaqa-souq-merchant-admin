import test from 'node:test';
import assert from 'node:assert/strict';
import { PushRegistration } from '../src/push-registration.ts';
function setup() {
  let permission='granted', calls=0, prompts=0, now=0, fail=false;
  const values=new Map();
  const options={key:'merchant-A',storage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},permission:()=>permission,request:async()=>{prompts++;return permission='granted'},register:async()=>{calls++;if(fail)throw Error('offline')},changed:()=>{},now:()=>now};
  return {options,values, stats:()=>({calls,prompts}), permission:v=>permission=v,time:v=>now=v,fail:v=>fail=v};
}
test('granted permission restores on reopen without another prompt, with coalescing/throttling',async()=>{
  const f=setup(); const a=new PushRegistration(f.options);
  await Promise.all([a.ensure(),a.ensure(),a.ensure()]);assert.equal(a.state,'ready');assert.equal(a.saved,true);assert.deepEqual(f.stats(),{calls:1,prompts:0});
  await a.ensure();assert.equal(f.stats().calls,1);await a.stop();
  const b=new PushRegistration(f.options);await b.ensure();assert.equal(b.state,'ready');assert.deepEqual(f.stats(),{calls:2,prompts:0});
});
test('default/denied permissions are never silently requested or overridden',async()=>{
  const f=setup();f.permission('default');const a=new PushRegistration(f.options);await a.ensure();assert.equal(f.stats().prompts,0);
  await a.ensure(true);assert.equal(f.stats().prompts,1);f.permission('denied');await a.ensure();assert.equal(a.state,'denied');assert.equal(f.stats().calls,1);
});
test('offline failure preserves remembered activation and a later retry repairs registration',async()=>{
  const f=setup();const a=new PushRegistration(f.options);await a.ensure();f.time(300001);f.fail(true);await a.ensure();assert.equal(a.state,'error');assert.equal(a.saved,true);
  f.fail(false);f.time(330002);await a.ensure();assert.equal(a.state,'ready');assert.equal(f.stats().prompts,0);
});
test('logout stops late registration completion from saving success',async()=>{
  const f=setup();let release;f.options.register=()=>new Promise(resolve=>release=resolve);const a=new PushRegistration(f.options);const pending=a.ensure();const stopped=a.stop();release();await Promise.all([pending,stopped]);assert.equal(a.saved,false);
});
