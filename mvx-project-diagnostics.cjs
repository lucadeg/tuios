#!/usr/bin/env node
'use strict';
/**
 * Out-of-band telemetry for TUIOS-managed projects. No dependency on their
 * language, auth, database, agent or healthy HTTP endpoint.
 * Never persist stdout/stderr bodies, argv, env, credentials or URLs.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const ID = /^[a-z0-9][a-z0-9-]{1,79}$/;
const SAFE_VALUE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/;
const ALLOWED = new Set(['pid','port','httpStatus','exitCode','durationMs','attempt','freeMemoryMB',
  'result','errorCode','errorName','mode','lineHash','source','processAlive','observerPid']);
const LEVEL = new Set(['DEBUG','INFO','WARN','ERROR','CRITICAL']);
const RESULTS = new Set(['requested','started','http_ready','starting_not_ready','unreachable',
  'unsupported','no_evidence','not_certified','stopped','failed','pending','unknown',
  'running','not_running','process_exit','server_error','auth_required','transport_error']);
const FILE = 'events.jsonl';
const ROTATE = 4 * 1024 * 1024;
const COUNT = 3;
const MAX_READ = 512 * 1024;
const EVENT_SCHEMA = 'mvx.tuios.diagnostic.v1';
const RUN = crypto.randomUUID();
const hermesHome = () => path.resolve(process.env.MVX_HERMES_HOME || path.join(os.homedir(), '.hermes'));
const diagnosticsRoot = () => path.join(hermesHome(), '.mvx-tuios-runtime', 'diagnostics');
const projectFolder = id => path.join(diagnosticsRoot(), validateProject(id));
function validateProject(id) {
  if (typeof id !== 'string' || !ID.test(id)) throw Error('invalid_project_id');
  return id;
}
function assertNoSymlink(dir, create = false) {
  const base = hermesHome();
  const dest = path.resolve(dir);
  if (dest !== base && !dest.startsWith(base + path.sep)) throw Error('unsafe_diagnostic_path');
  // The parent of the .hermes root is an OS/user-managed directory, not a
  // writable path selected by the project ID.
  let parent = base;
  if (!fs.existsSync(parent)) {
    if (!create) return false;
    fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  }
  if (fs.lstatSync(parent).isSymbolicLink()) throw Error('symlink_diagnostic_root');
  for (const segment of path.relative(base, dest).split(path.sep).filter(Boolean)) {
    parent = path.join(parent, segment);
    if (!fs.existsSync(parent)) {
      if (!create) return false;
      fs.mkdirSync(parent, { mode: 0o700 });
    } else {
      const st = fs.lstatSync(parent);
      if (st.isSymbolicLink() || !st.isDirectory()) throw Error('unsafe_diagnostic_directory');
    }
  }
  return true;
}
function assertFile(file) {
  if (!fs.existsSync(file)) return false;
  const st = fs.lstatSync(file);
  if (!st.isFile() || st.isSymbolicLink()) throw Error('unsafe_diagnostic_file');
  return true;
}
function eventPath(id) { return path.join(projectFolder(id), FILE); }
function restrictIdentifier(input, fallback) {
  return typeof input === 'string' && SAFE_VALUE.test(input) ? input : fallback;
}
function rotate(dir, file) {
  if (!assertFile(file) || fs.statSync(file).size < ROTATE) return;
  for (let n = COUNT; n >= 1; n--) {
    const old = n === 1 ? file : path.join(dir, FILE + '.' + (n-1));
    const next = path.join(dir, FILE + '.' + n);
    if (!assertFile(old)) continue;
    if (assertFile(next)) fs.unlinkSync(next);
    fs.renameSync(old, next);
  }
}
function createProjectLogger(projectId, options = {}) {
  validateProject(projectId);
  const runId = restrictIdentifier(options.runId, RUN);
  return function record(level, component, event, attrs = {}) {
    const output = {
      schema: EVENT_SCHEMA,
      time: new Date().toISOString(),
      projectId, level: LEVEL.has(level) ? level : 'INFO',
      component: restrictIdentifier(component,'tuios'),
      event: restrictIdentifier(event,'unknown_event'),
      runId, device: restrictIdentifier(os.hostname(), 'device'),
      pid: process.pid
    };
    for (const [key, value] of Object.entries(attrs || {})) {
      if (!ALLOWED.has(key)) continue;
      if (typeof value === 'number' && Number.isFinite(value))
        output[key] = Math.round(value * 100) / 100;
      else if (typeof value === 'boolean') output[key] = value;
      else if (typeof value === 'string') {
        if (key === 'result') output[key] = RESULTS.has(value) ? value : 'unknown';
        else output[key] = restrictIdentifier(value,'UNKNOWN');
      }
    }
    try {
      const dir = projectFolder(projectId);
      assertNoSymlink(dir,true);
      const target = eventPath(projectId);
      if (assertFile(target) && fs.statSync(target).size >= ROTATE) rotate(dir,target);
      fs.appendFileSync(target, JSON.stringify(output) + '\n', { mode:0o600, flag:'a' });
      return true;
    } catch {
      process.stderr.write('MVX_DIAGNOSTIC_WRITE_UNAVAILABLE\n');
      return false;
    }
  };
}
function recentLines(file, limit = 100) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 2000) throw Error('invalid_log_tail');
  if (!assertFile(file)) return [];
  const fd = fs.openSync(file, 'r');
  try {
    const total = fs.fstatSync(fd).size;
    const count = Math.min(MAX_READ,total);
    const buffer = Buffer.alloc(count);
    fs.readSync(fd, buffer, 0, count, total - count);
    let text = buffer.toString('utf8');
    if (count < total) text = text.slice(text.indexOf('\n') + 1);
    return text.split(/\r?\n/).filter(Boolean).slice(-limit);
  } finally { fs.closeSync(fd); }
}
function readEvents(projectId, limit = 100) {
  validateProject(projectId);
  const roots = [projectFolder(projectId)];
  if (projectId === 'mvx-founder-os')
    roots.push(path.join(hermesHome(), 'diagnostics', 'founder-os'));
  const events = [];
  for (const root of roots) {
    if (!assertNoSymlink(root, false)) continue;
    for (const line of recentLines(path.join(root, FILE), limit)) {
      try {
        const value = JSON.parse(line);
        if (value.schema !== EVENT_SCHEMA && value.schema !== 'mvx.fos.diagnostic.v1') continue;
        if (value.schema === EVENT_SCHEMA && value.projectId !== projectId) continue;
        // Schema allows only safe, known fields. Never echo unknown keys.
        const entry = { time: value.time, level: value.level, projectId,
          component:value.component, event:value.event, runId:value.runId,
          result:value.result, errorCode:value.errorCode, errorName:value.errorName,
          mode:value.mode, pid:value.pid, httpStatus:value.httpStatus,
          port:value.port, durationMs:value.durationMs, lineHash:value.lineHash };
        if (typeof entry.time !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(entry.time)) continue;
        events.push(entry);
      } catch { /* Invalid records are never printed as plaintext. */ }
    }
  }
  events.sort((a,b) => a.time.localeCompare(b.time));
  return events.slice(-limit);
}
function classifyProcessLine(text) {
  // Only classify error signatures. Do not write original text or raw stack.
  const normalized = String(text || '').replace(/\x1b\[[0-9;]*m/g,'').trim();
  if (!normalized || normalized.length > 8192) return null;
  let errorCode;
  if (/Module not found|Cannot find module|ERR_MODULE_NOT_FOUND/i.test(normalized)) errorCode='MODULE_NOT_FOUND';
  else if (/EADDRINUSE|address already in use/i.test(normalized)) errorCode='PORT_IN_USE';
  else if (/ENOMEM|out of memory|heap out of memory/i.test(normalized)) errorCode='OUT_OF_MEMORY';
  else if (/ETIMEDOUT|timed out|timeout/i.test(normalized)) errorCode='TIMEOUT';
  else if (/EACCES|EPERM|permission denied|access denied/i.test(normalized)) errorCode='ACCESS_DENIED';
  else if (/DPAPI|CRYPT_E_|decrypt failed/i.test(normalized)) errorCode='DPAPI_ERROR';
  else if (/error|failed|panic|exception|fatal|unhandled rejection/i.test(normalized)) errorCode='RUNTIME_ERROR';
  else return null;
  return { errorCode, lineHash:crypto.createHash('sha256').update(normalized).digest('hex') };
}
function recordedLog(id, mode) {
  validateProject(id);
  if (mode !== 'dev' && mode !== 'production') throw Error('invalid_log_mode');
  const root = path.join(hermesHome(),'.mvx-tuios-runtime','launches');
  if (!assertNoSymlink(root,false)) return null;
  return path.join(root,id+'-'+mode+'.log');
}
module.exports = {validateProject,assertNoSymlink,createProjectLogger,readEvents,
  recentLines,classifyProcessLine,recordedLog,eventPath,EVENT_SCHEMA};
