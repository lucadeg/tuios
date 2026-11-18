const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const observer=require('../mvx-project-observer.cjs');
const telemetry=require('../mvx-project-diagnostics.cjs');

test('detached-style observer records a real child exit and sanitizes a synthetic runtime error',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'mvx-observer-live-'));
  const prior=process.env.MVX_HERMES_HOME;
  process.env.MVX_HERMES_HOME=root;
  let child;
  try {
    const launches=path.join(root,'.mvx-tuios-runtime','launches');
    fs.mkdirSync(launches,{recursive:true});
    fs.writeFileSync(path.join(launches,'mvx-light-monitor-dev.log'),
      'Vite ready\nError: EADDRINUSE credential=supersecret\n');
    child=spawn(process.execPath,['-e','setTimeout(()=>process.exit(0),200)'],{stdio:'ignore'});
    assert.ok(child.pid>0);
    const result=await Promise.race([
      observer.run({id:'mvx-light-monitor',mode:'dev',pid:child.pid,port:0},40),
      new Promise((_,reject)=>setTimeout(()=>reject(Error('OBSERVER_TEST_TIMEOUT')),4500))
    ]);
    assert.equal(result,0);
    const events=telemetry.readEvents('mvx-light-monitor',100);
    assert.ok(events.some(e=>e.event==='reported_failure'&&e.errorCode==='PORT_IN_USE'));
    assert.ok(events.some(e=>e.event==='managed_process_exited'));
    assert.equal(JSON.stringify(events).includes('supersecret'),false);
  } finally {
    if(child&&!child.killed)child.kill();
    if(prior===undefined)delete process.env.MVX_HERMES_HOME;
    else process.env.MVX_HERMES_HOME=prior;
    fs.rmSync(root,{recursive:true,force:true});
  }
});
