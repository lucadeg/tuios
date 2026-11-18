#!/usr/bin/env node
'use strict';
/**
 * Standalone, low-I/O observer for an owned TUIOS launcher process.
 * Reads only its fixed local launch log. Raw output is never duplicated.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const registry = require('./config/mvx-projects.json');
const telemetry = require('./mvx-project-diagnostics.cjs');

function input(argv) {
  const [id, mode, pidString, portString] = argv;
  telemetry.validateProject(id);
  if (!registry.projects.some(p => p.id === id)) throw Error('unregistered_project');
  if (!['dev','production'].includes(mode)) throw Error('invalid_mode');
  const pid = Number(pidString), port = Number(portString || 0);
  if (!Number.isSafeInteger(pid) || pid < 1 || !Number.isSafeInteger(port) ||
      port < 0 || port > 65535) throw Error('invalid_observer_process');
  return { id,mode,pid,port };
}
const alive = pid => { try { process.kill(pid,0); return true; } catch { return false; } };
function safeErrors(text, record) {
  let observed=0;
  const lines=String(text).split(/\r?\n/);
  for (const line of lines) {
    const event=telemetry.classifyProcessLine(line);
    if (!event) continue;
    if (++observed>20) break;
    record('ERROR','project.runtime','reported_failure', {
      errorCode:event.errorCode, result:'failed'
    });
  }
  return observed;
}
async function probe(port) {
  if (!port) return { result:'unsupported' };
  try {
    const response=await fetch('http://127.0.0.1:'+port+'/',{
      method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(1800)
    });
    if (response.status >= 200 && response.status < 400)
      return {result:'http_ready',httpStatus:response.status};
    if (response.status === 401 || response.status === 403)
      return {result:'auth_required',httpStatus:response.status};
    return {result:'server_error',httpStatus:response.status};
  } catch {
    return {result:'unreachable'};
  }
}
async function run(options, pollMs=5000) {
  const {id,mode,pid,port}=options;
  const record=telemetry.createProjectLogger(id);
  record('INFO','project.observer','observer_started',{
    observerPid:process.pid, mode, pid,port
  });
  const logfile=telemetry.recordedLog(id,mode);
  if (!logfile) {
    record('WARN','project.observer','log_directory_absent',{result:'no_evidence'});
    return 2;
  }
  let position=0, residual='', lastHealth=null, lastProbe=0;
  let absentCount=0;
  while (true) {
    try {
      // Never trust a logfile path supplied via stored state or command input.
      if (fs.existsSync(logfile)) {
        const stat=fs.lstatSync(logfile);
        if (!stat.isFile() || stat.isSymbolicLink()) throw Error('UNSAFE_LOG_PATH');
        if (stat.size < position) { position=0;residual=''; }
        if (stat.size > position) {
          const fd=fs.openSync(logfile,'r');
          try {
            let delta=Math.min(stat.size-position,64*1024);
            if (stat.size-position>64*1024) {
              position=stat.size-64*1024;
              residual='';
              delta=64*1024;
              record('WARN','project.observer','log_backpressure',{result:'pending'});
            }
            const buffer=Buffer.alloc(delta);
            fs.readSync(fd,buffer,0,delta,position);
            position+=delta;
            const lines=(residual+buffer.toString('utf8')).split(/\r?\n/);
            residual=lines.pop()||'';
            if (residual.length>4096) residual='';
            safeErrors(lines.join('\n'),record);
          } finally { fs.closeSync(fd); }
        }
      }
    } catch {
      record('ERROR','project.observer','log_read_failed',{errorCode:'FILE_READ_ERROR'});
    }
    if (Date.now()-lastProbe>=30000) {
      const status=await probe(port);
      if (status.result!==lastHealth) {
        record(status.result==='http_ready'||status.result==='auth_required'?'INFO':'WARN',
          'project.observer','http_probe',{port,...status});
        lastHealth=status.result;
      }
      lastProbe=Date.now();
    }
    if (!alive(pid)) {
      if (++absentCount>=2) {
        record('WARN','project.observer','managed_process_exited',{result:'stopped',pid});
        return 0;
      }
    } else absentCount=0;
    await new Promise(resolve=>setTimeout(resolve,pollMs));
  }
}
if (require.main===module) {
  try {
    const opts=input(process.argv.slice(2));
    run(opts).then(code => {process.exitCode=code;}).catch(() => {
      telemetry.createProjectLogger(opts.id)('ERROR','project.observer','observer_failed',
        {errorCode:'OBSERVER_RUNTIME_FAILURE'});
      process.exitCode=1;
    });
  } catch {
    process.stderr.write('MVX_OBSERVER_INVALID_INPUT\n');
    process.exitCode=2;
  }
}
module.exports={input,safeErrors,probe,run};
