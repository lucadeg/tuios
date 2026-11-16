'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const mod = require('./mvx_service_control.cjs');

function fixture(data) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mvx-tuios-suite-'));
  fs.mkdirSync(path.join(root, 'config'));
  if (data) fs.writeFileSync(path.join(root, 'config', 'mvx-tuios-services.json'), JSON.stringify(data));
  return {root, env: {HERMES_ROOT:root}};
}
test('five canonical services are registered without claiming configured backends', () => {
  const {root,env} = fixture();
  const entries = mod.loadRegistry(root,env);
  assert.deepEqual(Object.keys(entries), Object.keys(mod.PROJECTS));
  assert.equal(entries['mvx-saas-master-ldg'].origin, null);
  assert.equal(entries['founder-os'].installed, false);
});
test('forbids endpoint SSRF and non-operator configuration files', () => {
  let {root,env} = fixture({schema:'mvx.tuios.services.v1',
    services:{'founder-os':{origin:'https://evil.invalid/extra'}}});
  assert.throws(() => mod.loadRegistry(root,env),/INVALID_SERVICE_ORIGIN/);
  assert.throws(() => mod.configurationPath(root, {...env,
    MVX_TUIOS_CONFIG_PATH:path.join(root,'state','remote.json')}),/CONFIG_PATH_OUTSIDE_OPERATOR_DIRECTORY/);
  assert.equal(mod.validApiPath('/api/health'),true);
  assert.equal(mod.validApiPath('/api/../private'),false);
  assert.equal(mod.validApiPath('//evil.invalid'),false);
});
test('allows only named backend operations, verifies expected request shape', async () => {
  const {root,env} = fixture({schema:'mvx.tuios.services.v1',services:{
    'founder-os':{origin:'http://127.0.0.1:3001', operations:{
      health:{method:'GET',path:'/api/health',authenticated:false}
    }}
  }});
  const service = mod.loadRegistry(root,env)['founder-os'];
  assert.throws(() => mod.operationFor(service,'private-admin'),/OPERATION_NOT_DECLARED/);
  const observed=[];
  const result=await mod.invoke(service,'health',{env,fetchImpl:async(url,opts)=>{
    observed.push({url,method:opts.method,redirect:opts.redirect});
    return {status:200,ok:true,text:async()=>JSON.stringify({status:'ok'})};
  }});
  assert.equal(result.ok,true);
  assert.deepEqual(observed,[{url:'http://127.0.0.1:3001/api/health',method:'GET',redirect:'error'}]);
  await assert.rejects(mod.invoke(service,'health',{env,payload:{x:1}}),/READONLY_OPERATION_DISALLOWS_BODY/);
});
test('refuses writes without service token, even with operator manifest', async () => {
  const {root,env} = fixture({schema:'mvx.tuios.services.v1',services:{
    'mvx-trading-master-v2':{origin:'https://trading.example.invalid',tokenEnvironment:'MVX_TRADING_CONTROL_TOKEN',
      operations:{task:{method:'POST',path:'/api/tasks',authenticated:true}}}
  }});
  const service=mod.loadRegistry(root,env)['mvx-trading-master-v2'];
  await assert.rejects(mod.invoke(service,'task',{env,payload:{name:'example'}}),/SERVICE_TOKEN_REQUIRED/);
  assert.throws(() => mod.startBackend(service,{root,env}),/PRIVATE_OPERATOR_PROFILE_REQUIRED/);
});
test('blocks undeclared HTTP routes and path traversal', () => {
  const {root,env}=fixture({schema:'mvx.tuios.services.v1',services:{
    'founder-os':{operations:{bad:{method:'POST',path:'/api/../internal'}}}
  }});
  assert.throws(()=>mod.loadRegistry(root,env),/INVALID_OPERATION/);
});

test('a public POST definition still requires private service credentials', async () => {
  const {root,env} = fixture({schema:'mvx.tuios.services.v1',services:{
    'founder-os':{origin:'http://127.0.0.1:3001',
      operations:{command:{method:'POST',path:'/api/commands',authenticated:false}}}
  }});
  const service=mod.loadRegistry(root,env)['founder-os'];
  await assert.rejects(mod.invoke(service,'command',{env,payload:{action:'read'}}),
    /SERVICE_TOKEN_REQUIRED/);
});
test('doctor and status all distinguish unconfigured services from healthy backends', async () => {
  const {root,env}=fixture({schema:'mvx.tuios.services.v1',services:{
    'founder-os':{origin:'http://127.0.0.1:3001',
      operations:{health:{method:'GET',path:'/api/health',authenticated:false}}}
  }});
  const registry=mod.loadRegistry(root,env);
  const report=await mod.probeAll(registry,{env,fetchImpl:async()=>({
    ok:true,status:200,text:async()=>JSON.stringify({status:'pass'})
  })});
  assert.equal(report.length,5);
  assert.deepEqual(report.filter(x=>x.status==='healthy').map(x=>x.service),['founder-os']);
  assert.equal(report.filter(x=>x.status==='not_configured').length,4);
  const output=[];
  assert.equal(await mod.main(['doctor'],{log:s=>output.push(s)},env),0);
  assert.equal(JSON.parse(output[0]).schema,'mvx.tuios.doctor.v1');
});
test('Python backend startup is forbidden without a pinned interpreter executable', () => {
  const {root,env}=fixture({schema:'mvx.tuios.services.v1',services:{
    'founder-os':{projectPath:'backend',
      launch:{runtime:'python',entry:'run.py',args:[]}}
  }});
  const backend=path.join(root,'backend');
  fs.mkdirSync(backend,{recursive:true});
  fs.writeFileSync(path.join(backend,'run.py'),'print("test")');
  const service=mod.loadRegistry(root,env)['founder-os'];
  assert.throws(()=>mod.startBackend(service,{root,env:{...env,MVX_TUIOS_PROFILE:'private'}}),
    /PYTHON_RUNTIME_NOT_APPROVED/);
});
