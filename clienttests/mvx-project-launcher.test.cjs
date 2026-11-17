const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const launcher=require('../mvx-project-launcher.cjs');

test('TAURUS and Light Monitor are registered, with separate loopback dev ports',()=>{
  const taurus=launcher.find('mvx-ide-taurus'),light=launcher.find('mvx-light-monitor');
  assert.equal(launcher.profileFor(taurus,'dev').port,1420);
  assert.equal(launcher.profileFor(light,'dev').port,1421);
  assert.equal(launcher.profileFor(taurus,'production').auth,'native-keycloak');
  assert.throws(()=>launcher.profileFor(light,'production'),/not_certified/);
});
test('every inventoried project has explicit dev and production status',()=>{
  for(const p of launcher.inventory()){
    assert.ok(p.id&&p.dev&&p.production);
  }
  assert.throws(()=>launcher.find('../unsafe'),/invalid_project/);
  assert.throws(()=>launcher.find('nonexistent-project'),/unknown_registered_project/);
});
test('production refuses absent OIDC configuration regardless of browser-dev policy',()=>{
  const profile=launcher.profileFor(launcher.find('mvx-ide-taurus'),'production');
  assert.throws(()=>launcher.ensureIdentity(profile,{}),/missing_production_identity_config/);
  assert.doesNotThrow(()=>launcher.ensureIdentity(profile,{
    MVX_KEYCLOAK_ISSUER:'https://idp.example.test/realms/mvx',
    MVX_KEYCLOAK_CLIENT_ID:'mvx-native'
  }));
  assert.throws(()=>launcher.ensureIdentity(profile,{
    MVX_KEYCLOAK_ISSUER:'http://127.0.0.1:8080/realms/mvx',
    MVX_KEYCLOAK_CLIENT_ID:'mvx-native'
  }),/production_keycloak_requires_https_trusted_issuer/);
  assert.throws(()=>launcher.ensureIdentity(profile,{
    MVX_KEYCLOAK_ISSUER:'https://idp.example.test/realms/mvx',
    MVX_KEYCLOAK_CLIENT_ID:'!'
  }),/invalid_keycloak_client_id/);
});
test('uncertified projects cannot be launched in either auth mode',()=>{
  for(const id of ['mvx-founder-os','mvx-saas-master','mvx-trading-master']){
    assert.throws(()=>launcher.profileFor(launcher.find(id),'dev'),/not_certified/);
    assert.throws(()=>launcher.profileFor(launcher.find(id),'production'),/not_certified/);
  }
});
test('Tailscale endpoints cannot be public IPs, host commands or arbitrary DNS',()=>{
  assert.equal(launcher.tailscaleHost('100.64.0.1'),'100.64.0.1');
  assert.equal(launcher.tailscaleHost('100.127.255.254'),'100.127.255.254');
  assert.equal(launcher.tailscaleHost('laptop.example.ts.net'),'laptop.example.ts.net');
  for(const host of ['8.8.8.8','100.128.0.1','my-home.invalid','100.64.0.1;rm -rf /']){
    assert.throws(()=>launcher.tailscaleHost(host),/remote_target/);
  }
});
test('Desktop Commander dispatch is a plan, not a false execution receipt',()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'mvx-tuios-device-test-'));
  const old=process.env.MVX_HERMES_HOME;
  try{
    process.env.MVX_HERMES_HOME=base;
    fs.mkdirSync(path.join(base,'.mvx-tuios-runtime'),{recursive:true});
    fs.writeFileSync(path.join(base,'.mvx-tuios-runtime','devices.json'),JSON.stringify({devices:[{
      id:'laptop',desktopCommanderId:'test-only-device',sshUser:'tester',
      tailscaleHost:'100.100.100.100',os:'windows'
    }]}));
    const plan=launcher.remotePlan('mvx-ide-taurus','dev','laptop','desktop-commander');
    assert.equal(plan.executed,false);
    assert.equal(plan.status,'requires_connected_desktop_commander_dispatch');
    assert.match(plan.command,/mvx-ide-taurus.*--mode dev/);
    const ssh=launcher.remotePlan('mvx-ide-taurus','dev','laptop','tailscale');
    assert.equal(ssh.executable,'ssh');
    assert.ok(ssh.arguments.includes('-EncodedCommand'));
    assert.ok(ssh.arguments.includes('tester@100.100.100.100'));
    assert.throws(()=>launcher.remotePlan('mvx-light-monitor','production','laptop','tailscale'),/not_certified/);
  }finally{
    if(old===undefined)delete process.env.MVX_HERMES_HOME;
    else process.env.MVX_HERMES_HOME=old;
    fs.rmSync(base,{recursive:true,force:true});
  }
});
test('checkout resolution never escapes .hermes root',()=>{
  const p=launcher.find('mvx-ide-taurus');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'mvx-tuios-roots-'));
  try{
    fs.mkdirSync(path.join(root,'mvx-ide-taurus'));
    assert.equal(launcher.resolveProject(p,root),path.join(root,'mvx-ide-taurus'));
    assert.throws(()=>launcher.resolveProject({paths:['../etc']} ,root),/unsafe_registry_path|path_outside_hermes/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
