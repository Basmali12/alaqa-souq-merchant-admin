import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {isolatePushyStorage} from '../src/push-namespace.ts';

// Execute the actual pinned SDK in separate page realms sharing origin storage.
// Only browser subscription and Pushy HTTP are faked; the faulty cache branch is real.
function fixture(values = new Map()) {
  const storage = {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const registrations=[];
  const calls=[];
  function page(scope) {
    const subscription={endpoint:'https://push.test'+scope,keys:{auth:'test-auth',p256dh:'test-key'}};
    const context=vm.createContext({
      self:{localStorage:storage,PushManager:function(){},location:{origin:'https://market.test'}},
      navigator:{serviceWorker:{ready:Promise.resolve(),register:async(url,options)=>{
        registrations.push({url,scope:options.scope});
        return {pushManager:{getSubscription:async()=>subscription}};
      }}},
      setTimeout:()=>0, console,
      fetch:async(url,options)=>{
        const body=JSON.parse(options.body);calls.push({url,body});
        return {status:200,json:async()=>url.endsWith('/register')
          ? {token:'token-for-'+body.subscription.endpoint,auth:'test-credential'}
          : {success:true}};
      },
    });
    const cache=new Map();
    function load(filename) {
      if(cache.has(filename))return cache.get(filename).exports;
      const module={exports:{}};cache.set(filename,module);
      const js=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
      const require=specifier=>load(path.resolve(path.dirname(filename),specifier)+(path.extname(specifier)?'':'.js'));
      vm.runInContext('(function(require,module,exports){'+js+'\n})',context)(require,module,module.exports);
      return module.exports;
    }
    const sdkRoot=path.resolve('src/vendor/pushy');
    const config=load(path.join(sdkRoot,'config.js'));
    const sdk=load(path.join(sdkRoot,'lib/pushy.js'));
    isolatePushyStorage(config, scope.includes('merchant') ? 'merchant' : 'courier', scope);
    return {config,sdk,register:()=>sdk.register({appId:'same-app',serviceWorkerFile:scope.slice(1)+'service-worker.js',serviceWorkerScope:scope})};
  }
  return {page,storage,values,calls,registrations};
}

test('merchant and courier on the same origin must not reuse each other token',async()=>{
  const f=fixture();
  const merchant=f.page('/merchant/');
  const courier=f.page('/courier/');
  const a=await merchant.register();
  const b=await courier.register();
  assert.notEqual(a,b);
  assert.equal(f.calls.filter(c=>c.url.endsWith('/register')).length,2);
  assert.deepEqual(f.registrations,[
    {url:'/merchant/service-worker.js',scope:'/merchant/'},
    {url:'/courier/service-worker.js',scope:'/courier/'},
  ]);
});

test('legacy credentials are not adopted and unrelated login/sound data are preserved',async()=>{
  const original=new Map([['pushyToken','legacy-token'],['pushyTokenAuth','legacy-auth'],['pushyTokenAppId','same-app'],['session','keep-session'],['sound','enabled']]);
  const f=fixture(new Map(original));
  const a=await f.page('/merchant/').register();
  assert.notEqual(a,'legacy-token');
  for(const [key,value] of original)assert.equal(f.values.get(key),value);
});

test('reopening both apps reuses their own registrations without new token creation',async()=>{
  const f=fixture();
  const [a,b]=await Promise.all([f.page('/merchant/').register(),f.page('/courier/').register()]);
  assert.notEqual(a,b);
  assert.equal(await f.page('/courier/').register(),b);
  assert.equal(await f.page('/merchant/').register(),a);
  assert.equal(f.calls.filter(c=>c.url.endsWith('/register')).length,2);
  assert.equal(f.calls.filter(c=>c.url.endsWith('/devices/auth')).length,2);
});

test('a legacy tab overwriting global credentials cannot corrupt either scoped registration',async()=>{
  const f=fixture();
  const a=await f.page('/merchant/').register();
  f.storage.setItem('pushyToken','old-client-token');
  f.storage.setItem('pushyTokenAuth','old-client-auth');
  assert.equal(await f.page('/merchant/').register(),a);
  assert.notEqual(await f.page('/courier/').register(),a);
});
