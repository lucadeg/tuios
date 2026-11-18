#!/usr/bin/env node
'use strict';
// MVX TUIOS project launcher. Dev runs are loopback-only; production requires
// a project-specific native/IAM profile. Remote SSH requires a configured
// Tailscale endpoint. Desktop Commander plans are NOT executed locally.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const net=require('node:net');
const {spawn,spawnSync}=require('node:child_process');
const {isIP}=require('node:net');
const INVENTORY=require('./config/mvx-projects.json');
const telemetry=require('./mvx-project-diagnostics.cjs');
const diagnosticsFor=id=>telemetry.createProjectLogger(id);

const slug=/^[a-z0-9][a-z0-9-]{1,79}$/;
const home=()=>path.resolve(process.env.MVX_HERMES_HOME||path.join(os.homedir(),'.hermes'));
const stateRoot=()=>path.join(home(),'.mvx-tuios-runtime','launches');
const statePath=id=>path.join(stateRoot(),id+'.json');
const assertSlug=x=>{if(!slug.test(x||''))throw Error('invalid_project_or_device_id');return x;};
const inputIds=()=>new Set(INVENTORY.projects.map(x=>x.id));
const find=id=>{assertSlug(id);const p=INVENTORY.projects.find(x=>x.id===id);if(!p)throw Error('unknown_registered_project:'+id);return p;};
const resolveProject=(project,base=home())=>{
  for(const rel of project.paths){
    if(!/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(rel))throw Error('unsafe_registry_path');
    const candidate=path.resolve(base,...rel.split('/'));
    if(!candidate.startsWith(path.resolve(base)+path.sep))throw Error('path_outside_hermes');
    if(fs.existsSync(candidate)&&fs.statSync(candidate).isDirectory())return candidate;
  }
  return null;
};
const profileFor=(project,mode)=>{
  if(!['dev','production'].includes(mode))throw Error('mode_required_dev_or_production');
  const profile=project.modes[mode];
  if(!profile||profile.kind==='unconfigured')throw Error('launch_profile_not_certified:'+project.id+':'+mode+':'+(profile?.reason||'missing'));
  if(mode==='dev'&&(profile.kind!=='npm'||profile.auth!=='browser-local-development-only'||!Number.isInteger(profile.port)||profile.port<1024||profile.port>65535))
    throw Error('unsafe_dev_profile');
  if(mode==='production'&&(profile.kind!=='binary'||profile.auth!=='native-keycloak'||!Array.isArray(profile.requiredEnv)||profile.requiredEnv.length<2))
    throw Error('unauthenticated_production_forbidden');
  return profile;
};
const ensureIdentity=(profile,env=process.env)=>{
  for(const key of profile.requiredEnv||[])if(typeof env[key]!=='string'||!env[key].trim())throw Error('missing_production_identity_config:'+key);
  if((profile.requiredEnv||[]).includes('MVX_KEYCLOAK_ISSUER')){
    let issuer;
    try{issuer=new URL(env.MVX_KEYCLOAK_ISSUER)}catch{throw Error('invalid_keycloak_issuer_url');}
    if(issuer.protocol!=='https:'||issuer.username||issuer.password||issuer.search||issuer.hash||
       ['localhost','127.0.0.1','::1'].includes(issuer.hostname))
      throw Error('production_keycloak_requires_https_trusted_issuer');
    if(!/^[A-Za-z0-9][A-Za-z0-9._-]{2,119}$/.test(env.MVX_KEYCLOAK_CLIENT_ID||''))
      throw Error('invalid_keycloak_client_id');
  }
};
const verifySignedNativeRelease=binary=>{
  if(process.platform!=='win32')throw Error('windows_native_release_required');
  // The signed Windows executable must be trusted by the device certificate store.
  const script="$s=Get-AuthenticodeSignature -LiteralPath '"+binary.replace(/'/g,"''")+"';if($s.Status -ne 'Valid'){exit 7}";
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',
    Buffer.from(script,'utf16le').toString('base64')],{timeout:12000,windowsHide:true,encoding:'utf8'});
  if(result.error||result.status!==0)throw Error('native_production_signature_not_verified');
};
const loadedState=id=>{try{return JSON.parse(fs.readFileSync(statePath(id),'utf8'))}catch{return null}};
const alive=pid=>{if(!Number.isInteger(pid)||pid<=0)return false;try{process.kill(pid,0);return true}catch{return false}};
const portOpen=(port,host='127.0.0.1')=>new Promise(resolve=>{
  const s=net.connect({port,host});const finish=x=>{s.destroy();resolve(x)};
  s.setTimeout(650);s.once('connect',()=>finish(true));s.once('error',()=>finish(false));s.once('timeout',()=>finish(false));
});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const writeState=(id,data)=>{
  fs.mkdirSync(stateRoot(),{recursive:true,mode:0o700});
  const dest=statePath(id),temp=dest+'.'+process.pid+'.tmp';
  fs.writeFileSync(temp,JSON.stringify(data,null,2)+'\n',{mode:0o600});
  fs.renameSync(temp,dest);
};
const localStatus=async id=>{
  const project=find(id),record=loadedState(id);
  const port=project.modes.dev?.port;
  const listening=Number.isInteger(port)?await portOpen(port):false;
  let observed=null;
  try{observed=telemetry.readEvents(id,1)[0]||null;}catch{/* optional diagnostics unavailable */ }
  return {id,device:os.hostname(),recorded:!!record,mode:record?.mode||null,pid:record?.pid||null,
    processAlive:alive(record?.pid),loopbackPort:port||null,loopbackListening:listening,
    url:listening?'http://127.0.0.1:'+port+'/':null,identityVerified:false,
    diagnosticLedger:observed?{lastObservedAt:observed.time,lastEvent:observed.event,
      lastLevel:observed.level}:null,
    devProfile:project.modes.dev?.kind||'missing',
    devBlockedReason:project.modes.dev?.kind==='unconfigured'?
      project.modes.dev.reason:'none',
    productionProfile:project.modes.production?.kind||'missing',
    productionBlockedReason:project.modes.production?.kind==='unconfigured'?
      project.modes.production.reason:'none'};
};
async function launchLocal(id,mode,{waitMs=60000}={}){
  const project=find(id);
  const record=diagnosticsFor(project.id);
  record('INFO','project.launcher','launch_requested',{mode,result:'requested'});
  const profile=profileFor(project,mode),cwd=resolveProject(project);
  if(!cwd)throw Error('project_checkout_missing_on_this_device:'+id);
  const old=loadedState(id);
  if(old&&alive(old.pid))throw Error('already_running_managed_process:'+id+':'+old.pid);
  if(mode==='dev'&&await portOpen(profile.port))throw Error('existing_unmanaged_listener_on_port:'+profile.port);
  if(mode==='production')ensureIdentity(profile);
  let binary,args=[];
  if(profile.kind==='npm'){
    if(!fs.existsSync(path.join(cwd,'package.json')))throw Error('npm_manifest_missing');
    if(!/^[a-z][a-z0-9:-]{0,50}$/.test(profile.script))throw Error('unsafe_npm_script');
    const manifest=JSON.parse(fs.readFileSync(path.join(cwd,'package.json'),'utf8'));
    if(!Object.hasOwn(manifest.scripts||{},profile.script))throw Error('missing_npm_script:'+profile.script);
    if(process.platform==='win32'){binary=process.env.ComSpec||'C:\\Windows\\System32\\cmd.exe';args=['/d','/s','/c','npm.cmd run '+profile.script];}
    else{binary='npm';args=['run',profile.script];}
  }else{
    if(!/^[A-Za-z0-9_./-]+\.exe$/.test(profile.relative))throw Error('unsafe_native_binary');
    binary=path.resolve(cwd,...profile.relative.split('/'));
    if(!binary.startsWith(cwd+path.sep)||!fs.existsSync(binary))throw Error('native_binary_not_found');
    verifySignedNativeRelease(binary);
  }
  fs.mkdirSync(stateRoot(),{recursive:true,mode:0o700});
  const logfile=path.join(stateRoot(),id+'-'+mode+'.log');
  const fd=fs.openSync(logfile,'a',0o600);
  const child=spawn(binary,args,{
    cwd,env:{...process.env,MVX_TUIOS_LAUNCH_MODE:mode,
      ...(mode==='dev'?{MVX_TUIOS_DEV_LOOPBACK_ONLY:'1'}:{})},
    stdio:['ignore',fd,fd],detached:true,windowsHide:true
  });
  fs.closeSync(fd);
  if(!child.pid)throw Error('process_spawn_failed');
  child.on('error',()=>record('ERROR','project.launcher','child_spawn_error',{
    errorCode:'PROCESS_SPAWN_ERROR',result:'failed'
  }));
  child.unref();
  writeState(id,{id,mode,pid:child.pid,device:os.hostname(),cwd,logfile,startedAt:new Date().toISOString(),port:profile.port||null});
  record('INFO','project.launcher','managed_process_started',{
    pid:child.pid,mode,port:profile.port||0,result:'started'
  });
  // Detached observer, read-only, separate from the application runtime.
  try{
    const watchEnv={};
    for(const key of ['PATH','Path','SystemRoot','ComSpec','HOME','USERPROFILE','MVX_HERMES_HOME']){
      if(process.env[key])watchEnv[key]=process.env[key];
    }
    const watcher=spawn(process.execPath,[
      path.join(__dirname,'mvx-project-observer.cjs'),id,mode,
      String(child.pid),String(profile.port||0)
    ],{cwd:__dirname,env:watchEnv,stdio:'ignore',detached:true,windowsHide:true});
    if(watcher.pid){
      watcher.unref();
      record('INFO','project.launcher','observer_spawned',{observerPid:watcher.pid,result:'started'});
    }else record('WARN','project.launcher','observer_not_started',{errorCode:'OBSERVER_NOT_STARTED'});
  }catch{
    record('WARN','project.launcher','observer_not_started',{errorCode:'OBSERVER_SPAWN_FAILED'});
  }
  if(mode==='dev'){
    const deadline=Date.now()+waitMs;
    while(Date.now()<deadline){
      if(await portOpen(profile.port)){
        let responsive=false,observedStatus=0;
        try{
          const response=await fetch('http://127.0.0.1:'+profile.port+'/',{
            method:'HEAD',signal:AbortSignal.timeout(2500)
          });
          observedStatus=response.status;
          responsive=response.status>=200&&response.status<400;
        }catch{/* TCP accept alone does not mean HTTP service is ready. */}
        if(responsive){
          record('INFO','project.launcher','http_readiness_verified',{
            port:profile.port,httpStatus:observedStatus,result:'http_ready'
          });
          return {status:'http_ready',id,mode,pid:child.pid,
            url:'http://127.0.0.1:'+profile.port+'/',logfile,auth:'not_required_in_browser_dev_only'};
        }
      }
      if(!alive(child.pid))throw Error('server_exited_before_readiness:'+logfile);
      await delay(650);
    }
    // Slow predev compilation may still be running. Do not report a failure
    // when the owned process is alive; return a distinguishable pending status.
    if(alive(child.pid)){
      record('WARN','project.launcher','readiness_timeout',{port:profile.port,result:'pending'});
      return {status:'starting_not_ready',id,mode,pid:child.pid,logfile,port:profile.port};
    }
    throw Error('server_exited_before_readiness:'+logfile);
  }
  record('WARN','project.launcher','iam_not_yet_verified',{mode,result:'pending'});
  return {status:'process_started_iam_not_yet_verified',id,mode,pid:child.pid,logfile};
}
const loadDevices=()=>{
  const file=path.join(home(),'.mvx-tuios-runtime','devices.json');
  if(!fs.existsSync(file))return [];
  const value=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!Array.isArray(value.devices))throw Error('invalid_device_configuration');
  return value.devices;
};
const tailscaleHost=(host)=>{
  if(typeof host!=='string')throw Error('tailscale_host_not_configured');
  if(isIP(host)===4){
    const n=host.split('.').map(Number);
    if(n[0]===100&&n[1]>=64&&n[1]<=127)return host;
  }
  if(/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.ts\.net$/.test(host))return host;
  throw Error('remote_target_must_be_tailnet_ip_or_magicdns');
};
function remotePlan(id,mode,deviceId,transport){
  find(id);profileFor(find(id),mode);assertSlug(deviceId);
  const device=loadDevices().find(x=>x.id===deviceId);
  if(!device)throw Error('unknown_remote_device:configure_.hermes/.mvx-tuios-runtime/devices.json');
  const cmd='node "$env:USERPROFILE\\.hermes\\tuios\\mvx-project-launcher.cjs" launch '+id+' --mode '+mode+' --transport local';
  if(transport==='desktop-commander')
    return {status:'requires_connected_desktop_commander_dispatch',executed:false,
      device:deviceId,deviceId:device.desktopCommanderId||null,command:cmd,
      instruction:'Invoke the authorized Desktop Commander start_process action for this device; TUIOS does not impersonate its MCP credentials'};
  if(transport!=='tailscale')throw Error('unsupported_remote_transport');
  const address=tailscaleHost(device.tailscaleHost);
  if(!/^[a-z_][a-z0-9_.-]{0,50}$/i.test(device.sshUser||''))throw Error('ssh_user_not_configured');
  if(device.os!=='windows')throw Error('tailscale_remote_windows_profile_required');
  const encoded=Buffer.from(cmd,'utf16le').toString('base64');
  return {status:'prepared',device:deviceId,executable:'ssh',
    arguments:['-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=8',
      device.sshUser+'@'+address,'powershell.exe','-NoProfile','-NonInteractive','-EncodedCommand',encoded]};
}
function inventory(){
  const entries=INVENTORY.projects.map(p=>({id:p.id,name:p.name,category:p.category,
    localCheckout:resolveProject(p),dev:p.modes.dev?.kind==='unconfigured'?'not_certified':'available',
    production:p.modes.production?.kind==='unconfigured'?'not_certified':'requires_keycloak',
    details:p.modes.production?.reason||null}));
  // Additional checkouts are visible but not executable until explicitly certified.
  const known=new Set(INVENTORY.projects.flatMap(p=>p.paths.map(x=>x.toLowerCase())));
  try{
    for(const dir of fs.readdirSync(home(),{withFileTypes:true})){
      if(!dir.isDirectory()||!/^mvx[-_]/i.test(dir.name)||known.has(dir.name.toLowerCase()))continue;
      if(fs.existsSync(path.join(home(),dir.name,'package.json')))
        entries.push({id:dir.name.toLowerCase(),name:dir.name,category:'discovered',
          localCheckout:path.join(home(),dir.name),dev:'not_certified',production:'not_certified',
          details:'Startup and IAM policy must be registered before launch'});
    }
  }catch{}
  return entries;
}

function outputEvents(id,{tail=100,level='',component='',follow=false}={}){
  find(id); // inventory authority, not a filesystem-supplied path
  const n=Number(tail);
  if(!Number.isInteger(n)||n<1||n>2000)throw Error('invalid_log_tail');
  let seen=new Set();
  const snapshot=()=>{
    const events=telemetry.readEvents(id,n);
    for(const event of events){
      const key=JSON.stringify(event);
      if(seen.has(key))continue;
      seen.add(key);
      if(seen.size>4000)seen=new Set([key]);
      if(level&&event.level!==level.toUpperCase())continue;
      if(component&&event.component!==component)continue;
      console.log(JSON.stringify(event));
    }
    return events.length;
  };
  if(snapshot()===0 && !follow){
    console.log(JSON.stringify({projectId:id,status:'NO_EVIDENCE',
      runtimeVerified:false,authenticationVerified:false}));
  }
  if(follow){
    const watcher=setInterval(snapshot,1500);
    process.once('SIGINT',()=>clearInterval(watcher));
    process.once('SIGTERM',()=>clearInterval(watcher));
  }
}
async function cli(args=process.argv.slice(2)){
  const action=args[0]||'list';
  const option=key=>{const i=args.indexOf(key);return i<0?null:args[i+1]||null;};
  let result;
  if(action==='list')result={projects:inventory()};
  else if(action==='devices')result={local:{name:os.hostname(),transport:'local'},remote:loadDevices().map(x=>({
    id:x.id,transports:['desktop-commander','tailscale'],hasCommanderId:!!x.desktopCommanderId,
    hasTailscaleHost:!!x.tailscaleHost}))};
  else if(action==='status')result=await localStatus(args[1]);
  else if(action==='logs'){
    const id=args[1],n=Number(option('--tail')||100);
    outputEvents(id,{tail:n,level:option('--level')||'',
      component:option('--component')||'',follow:args.includes('--follow')});
    return {id,logSource:'structured_diagnostics'};
  }
  else if(action==='launch'||action==='plan'){
    const id=args[1],mode=option('--mode'),transport=option('--transport')||'local',device=option('--device');
    if(!id||!mode)throw Error('usage: launch <id> --mode dev|production [--transport local|tailscale|desktop-commander --device id]');
    if(transport==='local'){
      if(device&&device!==os.hostname().toLowerCase()&&device!=='local')throw Error('local_transport_device_mismatch');
      result=action==='plan'?{status:'ready_to_execute_locally',id,mode,profile:profileFor(find(id),mode)}:await launchLocal(id,mode);
    }else if(transport==='desktop-commander')result=remotePlan(id,mode,device,transport);
    else if(transport==='tailscale'){
      result=remotePlan(id,mode,device,transport);
      if(action==='launch'){
        const sub=spawnSync(result.executable,result.arguments,{encoding:'utf8',timeout:30000,windowsHide:true,maxBuffer:65536});
        if(sub.error||sub.status!==0)throw Error('tailscale_ssh_launch_failed:'+String(sub.error?.message||sub.stderr||sub.status).slice(0,300));
        result={status:'remote_command_executed',device,output:sub.stdout.slice(0,5000)};
      }
    }else throw Error('unknown_transport');
  }else throw Error('usage: list | devices | status <id> | launch <id> --mode dev|production [--transport local|tailscale|desktop-commander --device id]');
  console.log(JSON.stringify(result,null,2));
  if(result?.status==='requires_connected_desktop_commander_dispatch')process.exitCode=3;
  return result;
}
if(require.main===module)cli().catch(e=>{
  const [action,id]=process.argv.slice(2);
  if(action==='launch'&&INVENTORY.projects.some(p=>p.id===id)){
    diagnosticsFor(id)('ERROR','project.launcher','launch_failed',{
      errorCode: /not_certified/.test(e.message)?'PROFILE_NOT_CERTIFIED':
        /already_running/.test(e.message)?'ALREADY_RUNNING':
        /existing_unmanaged_listener/.test(e.message)?'PORT_BUSY':'LAUNCH_FAILED',
      result:'failed'
    });
  }
  console.error(JSON.stringify({error:'MVX_PROJECT_COMMAND_FAILED',reason:
    /not_certified/.test(e.message)?'PROFILE_NOT_CERTIFIED':'CHECK_DIAGNOSTIC_LEDGER'}));
  process.exitCode=1;
});
module.exports={inventory,find,resolveProject,profileFor,ensureIdentity,remotePlan,tailscaleHost,launchLocal,localStatus,cli,outputEvents};
