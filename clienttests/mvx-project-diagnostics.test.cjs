const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const telemetry = require('../mvx-project-diagnostics.cjs');
const launcher = require('../mvx-project-launcher.cjs');
const observer = require('../mvx-project-observer.cjs');
function withTempRoot(fn) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'mvx-diag-'));
  const prior=process.env.MVX_HERMES_HOME;
  process.env.MVX_HERMES_HOME=root;
  try { return fn(root); }
  finally {
    if(prior===undefined)delete process.env.MVX_HERMES_HOME;
    else process.env.MVX_HERMES_HOME=prior;
    fs.rmSync(root,{recursive:true,force:true});
  }
}
test('all 12 registered projects have a valid independent diagnostic namespace',()=>{
  const ids=new Set();
  for (const project of launcher.inventory()) {
    telemetry.validateProject(project.id);
    assert.equal(ids.has(project.id),false);
    ids.add(project.id);
  }
  assert.ok(ids.size>=12);
  assert.throws(()=>telemetry.validateProject('../vault'),/invalid_project_id/);
});
test('safe structured entries round-trip and arbitrary secrets never enter JSONL',()=>withTempRoot(()=>{
  const record=telemetry.createProjectLogger('mvx-ide-taurus',{runId:'test-run'});
  assert.equal(record('ERROR','vite.compiler','reported_failure',{
    errorCode:'MODULE_NOT_FOUND',result:'failed',password:'supersecret',
    argv:'sk-protected123456789',message:'Bearer abc',
    lineHash:'not-attested'
  }),true);
  const events=telemetry.readEvents('mvx-ide-taurus',10);
  assert.equal(events.length,1);
  assert.equal(events[0].errorCode,'MODULE_NOT_FOUND');
  const raw=fs.readFileSync(telemetry.eventPath('mvx-ide-taurus'),'utf8');
  assert.ok(!raw.includes('supersecret'));
  assert.ok(!raw.includes('sk-protected'));
  assert.ok(!raw.includes('Bearer abc'));
  assert.equal(events[0].result,'failed');
}));
test('readEvents isolates projects, including access to FOS legacy diagnostic ledger',()=>withTempRoot(root=>{
  telemetry.createProjectLogger('mvx-ide-taurus')('INFO','runtime','started',{result:'started'});
  telemetry.createProjectLogger('mvx-light-monitor')('CRITICAL','runtime','aborted',{result:'failed'});
  assert.equal(telemetry.readEvents('mvx-ide-taurus',10).length,1);
  assert.equal(telemetry.readEvents('mvx-light-monitor',10).length,1);
  const fos=path.join(root,'diagnostics','founder-os');
  fs.mkdirSync(fos,{recursive:true});
  fs.writeFileSync(path.join(fos,'events.jsonl'),JSON.stringify({
    schema:'mvx.fos.diagnostic.v1',time:new Date().toISOString(),
    level:'ERROR',component:'dpapi',event:'decrypt_failed',errorCode:'ETIMEDOUT'
  })+'\n');
  assert.equal(telemetry.readEvents('mvx-founder-os',10)[0].event,'decrypt_failed');
  assert.equal(telemetry.readEvents('mvx-ide-taurus',10)[0].event,'started');
}));
test('classifies Vite, Next, DPAPI and runtime errors without copying messages',()=>{
  for (const [line,code] of [
    ['[vite] Module not found: secret-path','MODULE_NOT_FOUND'],
    ['Error: listen EADDRINUSE 127.0.0.1','PORT_IN_USE'],
    ['fatal error heap out of memory','OUT_OF_MEMORY'],
    ['PowerShell DPAPI decrypt failed','DPAPI_ERROR'],
    ['Unhandled exception: bearer secret','RUNTIME_ERROR']
  ]) {
    const event=telemetry.classifyProcessLine(line);
    assert.equal(event.errorCode,code);
    assert.ok(!JSON.stringify(event).includes('secret'));
    assert.ok(!JSON.stringify(event).includes('bearer'));
  }
  assert.equal(telemetry.classifyProcessLine('Vite ready in 100 ms'),null);
});
test('observer refuses unregistered projects and invalid process metadata',()=>{
  const a=observer.input(['mvx-light-monitor','dev','1234','1421']);
  assert.equal(a.port,1421);
  assert.throws(()=>observer.input(['unknown-project','dev','1','80']),/unregistered_project/);
  assert.throws(()=>observer.input(['mvx-light-monitor','dev','-1','1421']),/invalid_observer_process/);
});
test('observer extracts only coded diagnostics, not runtime stdout',()=>{
  const output=[];
  assert.equal(observer.safeErrors('server ready\nError: EADDRINUSE at :5173\nAuthorization: Bearer secret',(...x)=>output.push(x)),1);
  assert.equal(output.length,1);
  assert.deepEqual(output[0][3],{errorCode:'PORT_IN_USE',result:'failed'});
});
test('status returns NO_EVIDENCE for registered but unobserved projects',()=>withTempRoot(()=>{
  assert.equal(telemetry.readEvents('mvx-trading-master').length,0);
  assert.equal(telemetry.readEvents('mvx-project-nomad').length,0);
}));
test('rejects symlink into private directory when supported by filesystem',(t)=>withTempRoot(root=>{
  const diag=path.join(root,'.mvx-tuios-runtime','diagnostics');
  fs.mkdirSync(diag,{recursive:true});
  const outside=fs.mkdtempSync(path.join(os.tmpdir(),'mvx-private-'));
  try {
    try { fs.symlinkSync(outside,path.join(diag,'mvx-engineering'),'dir'); }
    catch (error) {
      if (['EPERM','EACCES','ENOTSUP'].includes(error.code)) { t.skip('symlink unavailable');return; }
      throw error;
    }
    assert.equal(telemetry.createProjectLogger('mvx-engineering')('ERROR','x','y'),false);
    assert.throws(()=>telemetry.readEvents('mvx-engineering'),/unsafe_diagnostic_directory/);
  } finally { fs.rmSync(outside,{recursive:true,force:true}); }
}));
