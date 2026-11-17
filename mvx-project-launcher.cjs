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
  return {id,device:os.hostname(),recorded:!!record,mode:record?.mode||null,pid:record?.pid||null,
    processAlive:alive(record?.pid),loopbackPort:port||null,loopbackListening:listening,
    url:listening?'http://127.0.0.1:'+port+'/':null,identityVerified:false};
};
async function launchLocal(id,mode,{waitMs=60000}={}){
  const project=find(id),profile=profileFor(project,mode),cwd=resolveProject(project);
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
    if(!binary.startsWith(cwd+path.sep)||!fs.existsSync(binary))throw Error('signed_native_binary_not_found');
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
  child.unref();
  writeState(id,{id,mode,pid:child.pid,device:os.hostname(),cwd,logfile,startedAt:new Date().toISOString(),port:profile.port||null});
  if(mode==='dev'){
    const deadline=Date.now()+waitMs;
    while(Date.now()<deadline){
      if(await portOpen(profile.port)){
        let responsive=false;
        try{
          const response=await fetch('http://127.0.0.1:'+profile.port+'/',{
            method:'HEAD',signal:AbortSignal.timeout(2500)
          });
          responsive=response.status>=200&&response.status<400;
        }catch{/* TCP accept alone does not mean HTTP service is ready. */}
        if(responsive)return {status:'http_ready',id,mode,pid:child.pid,
          url:'http://127.0.0.1:'+profile.port+'/',logfile,auth:'not_required_in_browser_dev_only'};
      }
      if(!alive(child.pid))throw Error('server_exited_before_readiness:'+logfile);
      await delay(650);
    }
    // Slow predev compilation may still be running. Do not report a failure
    // when the owned process is alive; return a distinguishable pending status.
    if(alive(child.pid))return {status:'starting_not_ready',id,mode,pid:child.pid,logfile,port:profile.port};
    throw Error('server_exited_before_readiness:'+logfile);
  }
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
  if(!device)throw Error('unknown_remote_device:configure_.hermes/tuios/devices.json');
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
async function cli(args=process.argv.slice(2)){
  const action=args[0]||'list';
  const option=key=>{const i=args.indexOf(key);return i<0?null:args[i+1]||null;};
  let result;
  if(action==='list')result={projects:inventory()};
  else if(action==='devices')result={local:{name:os.hostname(),transport:'local'},remote:loadDevices().map(x=>({
    id:x.id,transports:['desktop-commander','tailscale'],hasCommanderId:!!x.desktopCommanderId,
    hasTailscaleHost:!!x.tailscaleHost}))};
  else if(action==='status')result=await localStatus(args[1]);
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
if(require.main===module)cli().catch(e=>{console.error(JSON.stringify({error:e.message}));process.exitCode=1});
module.exports={inventory,find,resolveProject,profileFor,ensureIdentity,remotePlan,tailscaleHost,launchLocal,localStatus,cli};
