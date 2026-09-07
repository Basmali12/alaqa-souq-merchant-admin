import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {isolatePushyStorage} from '../src/push-namespace.ts';

function fixture(token) {
  const config = {localStorageKeys:{}};
  const locks = [];
  const sdk = {register:async()=>token};
  const source = fs.readFileSync(new URL('../src/scoped-push.ts',import.meta.url),'utf8').replaceAll('import.meta.env.BASE_URL', "'/test-app/'");
  const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const module = {exports:{}};
  vm.runInNewContext('(function(require,module,exports){'+js+'\n})',{
    URL,location:{href:'https://market.test/test-app/'},
    navigator:{onLine:true,locks:{request:async(key,fn)=>{locks.push(key);return fn();}}},
  })(name=>name.includes('lib/pushy')?sdk:name.includes('config')?config:{isolatePushyStorage},module,module.exports);
  return {register:module.exports.registerScopedPush,locks,config};
}
test('invalid SDK registration never resolves as successful registration',async()=>{
  for(const token of [undefined,null,'','short',' '.repeat(20),'x'.repeat(2049)]) {
    const f=fixture(token);
    await assert.rejects(f.register('test-app',()=>true),/PUSH_REGISTRATION_FAILED/);
  }
});
test('valid SDK token uses the role scope lock; cancelled registration produces no token',async()=>{
  const f=fixture('valid-test-device-token');
  assert.equal(await f.register('test-app',()=>true),'valid-test-device-token');
  assert.equal(f.locks[0],f.config.localStorageKeys.token.replace(/token$/,''));
  assert.equal(await f.register('test-app',()=>false),undefined);
});

