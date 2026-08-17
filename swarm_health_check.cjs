#!/usr/bin/env node
'use strict'
const fs = require('fs'); const path = require('path'); const net = require('net'); const { execFileSync } = require('child_process')
const ROOT = 'C:\\Users\\Deglu\\.hermes'; const BUZZ = path.join(ROOT, 'tools', 'buzz', 'buzz_state.json'); const MAX_AGE_MS = 5*60*1000
function probe(port) { return new Promise(resolve => { const socket=net.createConnection({host:'127.0.0.1',port});
  const done=status=>{socket.destroy();resolve({port,status})}; socket.setTimeout(800); socket.on('connect',()=>done('listening'));
  socket.on('timeout',()=>done('closed')); socket.on('error',()=>done('closed')) }) }
function processEvidence(pattern) { try { const out=execFileSync('powershell',['-NoProfile','-Command',
  `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match '${pattern}' } | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress`],
  {encoding:'utf8',timeout:5000}); const p=out.trim()?JSON.parse(out):[]; return Array.isArray(p)?p:[p] } catch(_){return []} }
async function main(){ const defs=[['Hydra Router Core',3033],['Hermes IDE',5195],['Paperclip Swarm Hub',3100],['Founder OS',19080],['Viral Hub',19081],['Buzz Monitor',5198]]
  const ports=await Promise.all(defs.map(async([name,port])=>({name,...await probe(port)}))); let state=null,stateError=null
  try{state=JSON.parse(fs.readFileSync(BUZZ,'utf8'))}catch(e){stateError=e.message} const timestamp=state?.last_updated||state?.updated_at||null
  const ageMs=timestamp?Date.now()-Date.parse(timestamp):null; const fresh=Number.isFinite(ageMs)&&ageMs>=0&&ageMs<=MAX_AGE_MS
  const processes=processEvidence('hermes_swarm_executor|project_swarm_audit_daemon|multi_jobs_daemon').filter(p=>!String(p.CommandLine||'').includes('Get-CimInstance'))
  const heartbeats=(state?.telemetry_events||[]).filter(e=>{const t=Date.parse(e.timestamp);return Number.isFinite(t)&&Date.now()-t<=MAX_AGE_MS&&e.event_type==='heartbeat'})
  const running=processes.length>0&&heartbeats.length>0; const result={checked_at:new Date().toISOString(),verdict:running?'HEALTHY':'NOT_RUNNING',swarm_running:running,
    evidence:{agent_process_count:processes.length,fresh_heartbeat_count:heartbeats.length,telemetry_fresh:fresh,telemetry_age_seconds:ageMs===null?null:Math.round(ageMs/1000),telemetry_error:stateError,listening_ports:ports.filter(p=>p.status==='listening').map(p=>p.port)},ports,
    note:running?'Process and heartbeat evidence are both present.':'No swarm success is claimed without both a live process and a recent heartbeat.'}
  console.log(JSON.stringify(result,null,2));process.exitCode=running?0:2}
main().catch(e=>{console.error(e.stack||e.message);process.exit(1)})
